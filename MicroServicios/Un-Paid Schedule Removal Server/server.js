require('dotenv').config();
const app = require('./app');
const { connectToDB } = require('./config/db');
const initSocket = require('./socket/socketClient');
const scheduleCleanUnpaid = require('./cron/scheduleJob');

const PORT = process.env.PORT || 4001;

(async () => {
  try {
    // Conexión a MongoDB
    await connectToDB();

    // Inicializar socket cliente conectado al mainServer
    await initSocket(); // <- ahora devuelve promesa y espera conexión

    // Agendar limpieza de citas impagas
    scheduleCleanUnpaid();

    // Arrancar servidor Express
    app.listen(PORT, () => {
      console.log(`🚀 [Unpaid] Servidor escuchando en puerto ${PORT}`);
    });

  } catch (err) {
    console.error('❌ Error iniciando el servidor:', err);
    process.exit(1);
  }
})();
