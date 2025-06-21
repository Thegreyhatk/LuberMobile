require('dotenv').config();
const express        = require('express');
const { MongoClient } = require('mongodb');
const cron           = require('node-cron');
const ioClient       = require('socket.io-client');
const nodemailer     = require('nodemailer');

const app           = express();
const PORT          = process.env.PORT || 5001;
const MONGO_URI     = process.env.MONGODB_URI || 'mongodb://localhost:27017/LuberDB';
const SOCKET_URL    = process.env.SOCKET_URL || 'http://localhost:3006';

let schedulesCol, conversationsCol, socket;

// 🧪 Log de diagnóstico del .env
console.log('📦 ENV:', {
  EMAIL_USER: process.env.EMAIL_USER,
  EMAIL_PASS: process.env.EMAIL_PASS ? '****' : undefined,
  EMAIL_FROM: process.env.EMAIL_FROM
});

// Validación de credenciales
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !process.env.EMAIL_FROM) {
  console.error('❌ Faltan credenciales de email en el archivo .env');
  process.exit(1);
}

// Configuración del transporte de nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/**
 * Envía email de cancelación
 */
async function sendCancellationEmail(to, date, time) {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to,
    subject: 'Cita cancelada por falta de pago',
    text: `Tu cita programada para el ${date} a las ${time} ha sido cancelada automáticamente por falta de pago. Si crees que esto fue un error, por favor contáctanos.`
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Email enviado a ${to}`);
  } catch (err) {
    console.error(`❌ Error enviando email a ${to}:`, err.message);
  }
}

/**
 * Elimina citas impagas y notifica por socket a los clientes
 */
async function cleanUnpaid() {
  if (!schedulesCol || !conversationsCol || !socket?.connected) {
    console.error('❌ [Unpaid] Aún no inicializado completamente o socket desconectado.');
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
    console.log(`🗑️ [Unpaid] Eliminadas ${deletedCount} citas impagas de tipo Customer`);

  } catch (err) {
    console.error('❌ [Unpaid] Error limpiando y notificando:', err);
  }
}

(async () => {
  try {
    const client = await MongoClient.connect(MONGO_URI);
    const db = client.db();

    schedulesCol     = db.collection('schedules');
    conversationsCol = db.collection('conversations');

    console.log('✅ [Unpaid] Conectado a MongoDB');

    socket = ioClient(SOCKET_URL, {
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000
    });

    socket.on('connect', () => {
      console.log('🔌 [Unpaid] Conectado a Socket.io en', SOCKET_URL);
    });

    socket.on('connect_error', (err) => {
      console.error('❌ [Unpaid] Error conectando a Socket.io:', err.message);
    });

    socket.on('disconnect', () => {
      console.warn('⚠️ [Unpaid] Socket.io desconectado');
    });

    await cleanUnpaid();

    cron.schedule('0 * * * * *', cleanUnpaid, {
      timezone: 'America/New_York'
    });
    console.log('⏰ [Unpaid] Cron programado cada minuto (segundo 0)');

    app.get('/', (req, res) => {
      res.send('🗑️ Unpaid Cleanup & Notifier está OK');
    });

    app.listen(PORT, () => {
      console.log(`🚀 [Unpaid] Servidor escuchando en puerto ${PORT}`);
    });

  } catch (err) {
    console.error('❌ [Unpaid] Error arrancando servicio:', err);
    process.exit(1);
  }
})();
