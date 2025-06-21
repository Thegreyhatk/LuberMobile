require('dotenv').config();
const express = require('express');
const { MongoClient } = require('mongodb');
const cron = require('node-cron');
const ioClient = require('socket.io-client');

const app = express();
const PORT = process.env.PORT || 5012;
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/LuberDB';
const SOCKET_URL = process.env.SOCKET_URL || 'http://localhost:3006';

let schedulesCol, conversationsCol, socket;

/**
 * Enviar mensaje al usuario
 */
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

/**
 * Notifica nuevas citas de tipo Fleet
 */
async function notifyFleetPendingApproval() {
  const fleetSchedules = await schedulesCol.find({
    accountType: 'Fleet',
    fleetNotified: { $ne: true }
  }).toArray();

  for (const sched of fleetSchedules) {
    const vehicle = sched.vehicles?.[0] || {};
    const vehicleDesc = vehicle.oilType || 'vehículo sin detalles';
    const address = vehicle.serviceAddress || sched.clientAddress || 'Dirección no especificada';

    const msgText = `📋 Hola ${sched.customerName}, hemos recibido tu cita para el ${sched.date} a las ${sched.time}.
🛠 Servicio: ${vehicleDesc}
📍 Dirección: ${address}
💰 Total estimado: $${sched.total}

🔄 Tu solicitud está *pendiente de aprobación*. Te notificaremos en breve.`;

    await sendMessage(sched.userId, msgText);

    await schedulesCol.updateOne(
      { _id: sched._id },
      { $set: { fleetNotified: true } }
    );

    console.log(`📨 [Fleet] Notificada cita PENDIENTE de ${sched.customerName}`);
  }
}

/**
 * Notifica cuando una cita Fleet ha sido procesada
 */
async function notifyFleetProcessed() {
  const processedSchedules = await schedulesCol.find({
    accountType: 'Fleet',
    processed: true,
    fleetProcessedNotified: { $ne: true }
  }).toArray();

  for (const sched of processedSchedules) {
    const msgText = `✅ Tu cita ha sido procesada. En breve recibirás una factura de PayPal. Tienes 30 días para realizar el pago.`;

    await sendMessage(sched.userId, msgText);

    await schedulesCol.updateOne(
      { _id: sched._id },
      { $set: { fleetProcessedNotified: true } }
    );

    console.log(`📨 [Fleet] Notificada cita PROCESADA de ${sched.customerName}`);
  }
}

/**
 * Notifica cuando ya hay un invoiceId y se puede pagar
 */
async function notifyFleetInvoiceSent() {
  const invoices = await schedulesCol.find({
    accountType: 'Fleet',
    invoiceId: { $exists: true, $ne: '' },
    invoiceSentNotified: { $ne: true }
  }).toArray();

  for (const sched of invoices) {
    const invoiceLink = `https://www.paypal.com/invoice/p/#${sched.invoiceId}`;
    const msgText = `💳 Se ha generado tu factura de PayPal.

🔗 Factura: *${sched.invoiceId}*
📎 Puedes pagar directamente aquí:
${invoiceLink}

Tienes 30 días para completar el pago.`;

    await sendMessage(sched.userId, msgText);

    await schedulesCol.updateOne(
      { _id: sched._id },
      { $set: { invoiceSentNotified: true } }
    );

    console.log(`📨 [Fleet] Notificada FACTURA enviada de ${sched.customerName}`);
  }
}

/**
 * Ejecutar todas las verificaciones
 */
async function runFleetNotifiers() {
  if (!schedulesCol || !conversationsCol || !socket) {
    console.error('❌ [Fleet] Módulo aún no inicializado completamente.');
    return;
  }

  try {
    await notifyFleetPendingApproval();
    await notifyFleetProcessed();
    await notifyFleetInvoiceSent();
  } catch (err) {
    console.error('❌ [Fleet] Error notificando:', err);
  }
}

// ── Inicialización ─────────────────────────────────────────────────────────────
(async () => {
  try {
    const client = await MongoClient.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    const db = client.db();
    schedulesCol = db.collection('schedules');
    conversationsCol = db.collection('conversations');
    console.log('✅ [Fleet] Conectado a MongoDB');

    socket = ioClient(SOCKET_URL, { transports: ['websocket'] });
    socket.on('connect', () => {
      console.log('🔌 [Fleet] Conectado a Socket.io en', SOCKET_URL);
    });
    socket.on('connect_error', err => {
      console.error('❌ [Fleet] Error conectando a Socket.io:', err);
    });

    await runFleetNotifiers();

    cron.schedule('*/30 * * * * *', runFleetNotifiers, {
      timezone: 'America/New_York'
    });

    console.log('⏰ [Fleet] Cron activo cada 30 segundos');

    app.get('/', (req, res) => {
      res.send('📨 Fleet Notifier activo y monitoreando...');
    });

    app.listen(PORT, () => {
      console.log(`🚀 [Fleet] Servidor corriendo en puerto ${PORT}`);
    });
  } catch (err) {
    console.error('❌ [Fleet] Error al iniciar el servicio:', err);
    process.exit(1);
  }
})();
