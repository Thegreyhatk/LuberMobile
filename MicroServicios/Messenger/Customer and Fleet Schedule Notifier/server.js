require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');
const { io } = require('socket.io-client');
const nodemailer = require('nodemailer');
const path = require('path');

const MONGO_URI  = process.env.MONGODB_URI || 'mongodb://localhost:27017/LuberDB';
const SOCKET_URL = process.env.SOCKET_URL || 'http://localhost:3000';

let schedulesCol, conversationsCol, socket;
let lastCheck = new Date();

// ─────────────────────────────
// Nodemailer
// ─────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function sendEmail(to, subject, html) {
  if (!to) return;
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html,
      attachments: [{
        filename: 'logo.png',
        path: path.join(__dirname, 'images', 'logo.png'),
        cid: 'logo'
      }]
    });
    console.log(`📧 Email enviado a ${to} (${info.messageId})`);
  } catch (err) {
    console.error(`❌ Error enviando email a ${to}:`, err.message);
  }
}

// ─────────────────────────────
// Enviar mensaje al chat
// ─────────────────────────────
async function sendChatMessage(userId, text) {
  if (!userId || !text) return;
  try {
    await conversationsCol.updateOne(
      { userId: new ObjectId(userId) },
      {
        $push: {
          messages: {
            sender: 'office',
            text,
            imageUrl: '',
            at: new Date()
          }
        }
      },
      { upsert: true }
    );

    const updatedConv = await conversationsCol.findOne({ userId: new ObjectId(userId) });
    if (updatedConv && socket?.connected) {
      socket.emit('conversation_update', updatedConv);
    }

    console.log(`💬 Chat enviado al usuario ${userId}`);
  } catch (err) {
    console.error(`❌ Error enviando chat a ${userId}:`, err.message);
  }
}

// ─────────────────────────────
// Crear contenido de notificación
// ─────────────────────────────
function buildNotification(schedule) {
  const name     = schedule.customerName || 'cliente';
  const date     = schedule.date || 'fecha';
  const time     = schedule.time || 'hora';
  const total    = schedule.total || 0;
  const type     = schedule.accountType || 'Customer';
  const vehicles = schedule.vehicles || [];
  const isFleet  = type === 'Fleet';

  const vehicleListText = vehicles.map(v => {
    const info = v.vehicleInfo || {};
    return `• ${info.brand || 'Marca'} ${info.model || ''} ${info.year || ''} - ${v.oilType || 'Aceite'} (Placa *${info.plateLast3 || '---'}*)`;
  }).join('\n');

  const text = isFleet
    ? `📋 Hola ${name}, hemos recibido tu cita para el ${date} a las ${time}.\n\n🚗 Vehículos:\n${vehicleListText}\n\n💰 Total estimado: $${total}\n\n🔄 Tu solicitud está *pendiente de aprobación*. Te notificaremos en breve.`
    : `✅ Hola ${name}, tu cita para el ${date} a las ${time} ha sido confirmada.\n\n🚗 Vehículos:\n${vehicleListText}\n\n💰 Total: $${total}\n\nGracias por agendar con Luber.`;

  const html = `<div style="font-family:sans-serif;padding:20px;"><h2>${text.replace(/\n/g, '<br>')}</h2></div>`;
  return { text, html };
}

// ─────────────────────────────
// Monitorear nuevas citas
// ─────────────────────────────
async function pollNewSchedules() {
  try {
    const newSchedules = await schedulesCol.find({
      createdAt: { $gt: lastCheck }
    }).toArray();

    if (newSchedules.length) {
      console.log(`📥 Detectadas ${newSchedules.length} cita(s) nueva(s)`);
    }

    for (const sched of newSchedules) {
      if (!sched.userId) continue;

      const { text, html } = buildNotification(sched);
      await sendChatMessage(sched.userId, text);

      const email = sched.customerEmail || sched.email;
      if (email) {
        const subject = sched.accountType === 'Fleet'
          ? '📋 Tu cita está pendiente de aprobación'
          : '✅ Tu cita fue confirmada';
        await sendEmail(email, subject, html);
      }

      console.log(`✅ Notificación completada para ${sched.customerName}`);
    }

    lastCheck = new Date();
  } catch (err) {
    console.error('❌ Error al hacer polling de citas:', err.message);
  }
}

// ─────────────────────────────
// Inicialización
// ─────────────────────────────
(async () => {
  try {
    const mongo = await MongoClient.connect(MONGO_URI);
    const db = mongo.db();
    schedulesCol     = db.collection('schedules');
    conversationsCol = db.collection('conversations');
    console.log('✅ Conectado a MongoDB');

    socket = io(SOCKET_URL, {
      transports: ['polling'], // Alternativa si websocket falla
      reconnection: true,
      timeout: 10000
    });

    socket.on('connect', () => {
      console.log('🔌 Conectado a Socket.IO ✅');
    });

    socket.on('connect_error', () => {
      // Silenciado: Error al conectar con Socket.IO (probablemente está offline)
    });
    

    console.log('🕵️ Monitoreando nuevas citas cada 5 segundos...');
    setInterval(pollNewSchedules, 5000);

  } catch (err) {
    console.error('❌ Error al iniciar scheduleNotifier:', err.message);
    process.exit(1);
  }
})();
