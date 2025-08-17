const { getSchedulesCol, getConversationsCol } = require('../config/db');
const { getSocket } = require('../socket/socketClient');
const { sendCancellationEmail } = require('../utils/emailSender');

async function cleanUnpaid() {
  const schedulesCol = getSchedulesCol();
  const conversationsCol = getConversationsCol();
  const socket = getSocket();

  if (!schedulesCol || !conversationsCol || !socket?.connected) {
    console.error('❌ No inicializado completamente o socket desconectado.');
    return;
  }

  try {
    const unpaid = await schedulesCol.find({ paid: false, accountType: 'Customer' }).toArray();
    if (unpaid.length === 0) return;

    for (const sched of unpaid) {
      const msgText = `❌ Tu cita del ${sched.date} a las ${sched.time} fue cancelada por no haber pagado.`;

      await conversationsCol.updateOne(
        { userId: sched.userId },
        {
          $push: {
            messages: {
              sender: 'office',
              text: msgText,
              imageUrl: '',
              at: new Date()
            }
          }
        },
        { upsert: true }
      );

      const conv = await conversationsCol.findOne({ userId: sched.userId });
      socket.emit('conversation_update', conv);

      if (sched.email) {
        await sendCancellationEmail(sched.email, sched.date, sched.time);
      }
    }

    const { deletedCount } = await schedulesCol.deleteMany({ paid: false, accountType: 'Customer' });
    console.log(`🗑️ Eliminadas ${deletedCount} citas impagas`);

  } catch (err) {
    console.error('❌ Error limpiando y notificando:', err);
  }
}

module.exports = { cleanUnpaid };
