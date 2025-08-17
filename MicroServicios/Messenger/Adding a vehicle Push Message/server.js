// AddVehicleMessage.js
require('dotenv').config();
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const { io } = require('socket.io-client');

const PORT        = 5003;
const MONGO_URI   = process.env.MONGODB_URI || 'mongodb://localhost:27017/LuberDB';
const SOCKET_URL  = process.env.SOCKET_URL || 'http://localhost:3000'; // ✅ corregido

const app = express();
app.use(express.json());

let conversationsCol, socket;

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

    console.log(`🚗 Chat notificado por nuevo vehículo de ${userId}`);
  } catch (err) {
    console.error('❌ Error enviando mensaje de vehículo:', err.message);
  }
}

// ─────────────────────────────
// Ruta para recibir evento de nuevo vehículo
// ─────────────────────────────
app.post('/notify-vehicle-added', async (req, res) => {
  const { userId, brand, model, plateLast3 } = req.body;
  if (!userId || !brand || !model || !plateLast3) {
    return res.status(400).json({ error: 'Faltan datos' });
  }

  const text = `🚗 Se añadió un nuevo vehículo: ${brand} ${model} (Placa *${plateLast3}*)`;
  await sendChatMessage(userId, text);

  res.json({ success: true });
});

// ─────────────────────────────
// Inicialización
// ─────────────────────────────
(async () => {
  try {
    const mongo = await MongoClient.connect(MONGO_URI);
    conversationsCol = mongo.db().collection('conversations');
    console.log('✅ Conectado a MongoDB');

    const shownErrors = new Set();

    socket = io(SOCKET_URL, {
      transports: ['websocket'], // o quitarlo si querés permitir polling
      reconnection: true
    });

    socket.on('connect', () => console.log('🔌 Conectado a Socket.IO'));

    socket.on('connect_error', err => {
      const message = err.message;
      if (!shownErrors.has(message)) {
        shownErrors.add(message);
        console.error('❌ Socket.IO error:', message);
      }
    });

    app.listen(PORT, () => console.log(`🚀 AddVehicleMessage.js escuchando en puerto ${PORT}`));
  } catch (err) {
    console.error('❌ Error al iniciar AddVehicleMessage.js:', err.message);
    process.exit(1);
  }
})();
