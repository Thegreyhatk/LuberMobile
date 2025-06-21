require('dotenv').config();
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cron = require('node-cron');
const ioClient = require('socket.io-client');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 5003;
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/LuberDB';
const SOCKET_URL = process.env.SOCKET_URL || 'http://localhost:3006';

let schedulesCol, conversationsCol, socket;

// ────────────────────────────────
// ENV: Validación
// ────────────────────────────────
console.log('📦 ENV:', {
  EMAIL_USER: process.env.EMAIL_USER,
  EMAIL_PASS: process.env.EMAIL_PASS ? '****' : undefined,
  EMAIL_FROM: process.env.EMAIL_FROM
});

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !process.env.EMAIL_FROM) {
  console.error('❌ Faltan credenciales de email en el archivo .env');
  process.exit(1);
}

// ────────────────────────────────
// TRANSPORTADOR DE EMAIL
// ────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ────────────────────────────────
// Enviar email genérico
// ────────────────────────────────
async function sendGenericEmail(to, subject, html) {
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html
    });
    console.log(`📧 Email enviado a ${to}. ID: ${info.messageId}`);
  } catch (err) {
    console.error(`❌ Error enviando email a ${to}:`, err.message);
  }
}

// ────────────────────────────────
// Enviar mensaje por socket/chat
// ────────────────────────────────
async function sendMessage(userId, text) {
  await conversationsCol.updateOne(
    { userId },
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
  const updatedConv = await conversationsCol.findOne({ userId });
  socket.emit('conversation_update', updatedConv);
}

// ────────────────────────────────
// Notificar factura
// ────────────────────────────────
async function notifyFleetInvoiceSent() {
  const invoices = await schedulesCol.find({
    accountType: 'Fleet',
    invoiceId: { $exists: true, $ne: '' },
    invoiceSentNotified: { $ne: true }
  }).toArray();

  for (const sched of invoices) {
    const link = `https://www.paypal.com/invoice/p/#${sched.invoiceId}`;
    const msgText = `💳 Se ha generado tu factura de PayPal.\n\n🔗 Factura: *${sched.invoiceId}*\n📎 Puedes pagar directamente aquí:\n${link}\n\nTienes 30 días para completar el pago.`;
    const emailText = `
      <h2>Hola ${sched.customerName},</h2>
      <p>Tu cita fue procesada y ya tienes una factura disponible.</p>
      <p><strong>Factura:</strong> ${sched.invoiceId}</p>
      <p><a href="${link}">Haz clic aquí para pagar ahora</a></p>
      <p>Recuerda que tienes 30 días para realizar el pago.</p>
      <br><p>Gracias por usar Luber Fleet.</p>
    `;

    await sendMessage(sched.userId, msgText);

    const email = sched.customerEmail || sched.email;
    if (email) {
      await sendGenericEmail(email, '💳 Tu factura de PayPal está lista', emailText);
    }

    await schedulesCol.updateOne(
      { _id: new ObjectId(sched._id) },
      { $set: { invoiceSentNotified: true } }
    );

    console.log(`📨 Notificada FACTURA enviada de ${sched.customerName}`);
  }
}

// ────────────────────────────────
// Notificar cita pendiente
// ────────────────────────────────
async function notifyFleetPendingApproval() {
  const pending = await schedulesCol.find({
    accountType: 'Fleet',
    fleetNotified: { $ne: true }
  }).toArray();

  for (const sched of pending) {
    const vehicle = sched.vehicles?.[0] || {};
    const vehicleDesc = vehicle.oilType || 'vehículo sin detalles';
    const address = vehicle.serviceAddress || sched.clientAddress || 'Dirección no especificada';

    const msgText = `📋 Hola ${sched.customerName}, hemos recibido tu cita para el ${sched.date} a las ${sched.time}.\n🛠 Servicio: ${vehicleDesc}\n📍 Dirección: ${address}\n💰 Total estimado: $${sched.total}\n\n🔄 Tu solicitud está *pendiente de aprobación*. Te notificaremos en breve.`;

    const emailText = `
      <h2>Hola ${sched.customerName},</h2>
      <p>Hemos recibido tu cita:</p>
      <ul>
        <li><strong>Fecha:</strong> ${sched.date}</li>
        <li><strong>Hora:</strong> ${sched.time}</li>
        <li><strong>Servicio:</strong> ${vehicleDesc}</li>
        <li><strong>Dirección:</strong> ${address}</li>
        <li><strong>Total estimado:</strong> $${sched.total}</li>
      </ul>
      <p>Tu solicitud está <strong>pendiente de aprobación</strong>. Te notificaremos pronto.</p>
    `;

    await sendMessage(sched.userId, msgText);

    const email = sched.customerEmail || sched.email;
    if (email) {
      await sendGenericEmail(email, '📋 Tu cita está pendiente de aprobación', emailText);
    }

    await schedulesCol.updateOne(
      { _id: new ObjectId(sched._id) },
      { $set: { fleetNotified: true } }
    );

    console.log(`📨 Notificada cita PENDIENTE de ${sched.customerName}`);
  }
}

// ────────────────────────────────
// Notificar cita procesada
// ────────────────────────────────
async function notifyFleetProcessed() {
  const processed = await schedulesCol.find({
    accountType: 'Fleet',
    processed: true,
    fleetProcessedNotified: { $ne: true }
  }).toArray();

  for (const sched of processed) {
    const msg = `✅ Tu cita ha sido procesada. En breve recibirás una factura de PayPal. Tienes 30 días para realizar el pago.`;
    const emailText = `
      <h2>Hola ${sched.customerName},</h2>
      <p>Tu cita ha sido <strong>procesada exitosamente</strong>.</p>
      <p>En breve recibirás una factura de PayPal y tendrás 30 días para realizar el pago.</p>
      <br><p>Gracias por usar Luber Fleet.</p>
    `;

    await sendMessage(sched.userId, msg);

    const email = sched.customerEmail || sched.email;
    if (email) {
      await sendGenericEmail(email, '✅ Tu cita ha sido procesada', emailText);
    }

    await schedulesCol.updateOne(
      { _id: new ObjectId(sched._id) },
      { $set: { fleetProcessedNotified: true } }
    );

    console.log(`📨 Notificada cita PROCESADA de ${sched.customerName}`);
  }
}

// ────────────────────────────────
// Ejecutar todas las notificaciones
// ────────────────────────────────
async function runFleetNotifiers() {
  if (!schedulesCol || !conversationsCol || !socket) {
    console.error('❌ Módulo aún no inicializado completamente.');
    return;
  }

  try {
    await notifyFleetPendingApproval();
    await notifyFleetProcessed();
    await notifyFleetInvoiceSent();
  } catch (err) {
    console.error('❌ Error ejecutando notificaciones:', err);
  }
}

// ────────────────────────────────
// Inicialización principal
// ────────────────────────────────
(async () => {
  try {
    const client = await MongoClient.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    const db = client.db();
    schedulesCol = db.collection('schedules');
    conversationsCol = db.collection('conversations');
    console.log('✅ Conectado a MongoDB');

    socket = ioClient(SOCKET_URL, { transports: ['websocket'] });
    socket.on('connect', () => {
      console.log('🔌 Conectado a Socket.io');
    });
    socket.on('connect_error', err => {
      console.error('❌ Error conectando a Socket.io:', err);
    });

    await runFleetNotifiers();

    cron.schedule('*/30 * * * * *', runFleetNotifiers, {
      timezone: 'America/New_York'
    });

    console.log('⏰ Cron activo cada 30 segundos');

    app.get('/', (_, res) => {
      res.send('📨 Fleet Notifier activo y monitoreando...');
    });

    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    });
  } catch (err) {
    console.error('❌ Error al iniciar el servicio:', err);
    process.exit(1);
  }
})();
