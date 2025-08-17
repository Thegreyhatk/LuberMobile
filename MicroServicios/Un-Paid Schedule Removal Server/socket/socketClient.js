const ioClient = require('socket.io-client');

const SOCKET_URL = process.env.SOCKET_URL || 'http://localhost:3000';
let socket;

function initSocket() {
  return new Promise((resolve, reject) => {
    socket = ioClient(SOCKET_URL, {
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000
    });

    socket.on('connect', () => {
      console.log('🔌 [Unpaid] Conectado a Socket.io en', SOCKET_URL);
      resolve();
    });

    socket.on('connect_error', (err) => {
      console.error('❌ Error conectando a Socket.io:', err.message);
      reject(err);
    });

    socket.on('disconnect', () => {
      console.warn('⚠️ Socket.io desconectado');
    });
  });
}

function getSocket() {
  return socket;
}

module.exports = initSocket;
module.exports.getSocket = getSocket;
