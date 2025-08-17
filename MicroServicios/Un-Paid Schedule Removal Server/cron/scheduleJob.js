const cron = require('node-cron');
const { cleanUnpaid } = require('../services/unpaidService');

function scheduleCleanUnpaid() {
  cleanUnpaid(); // Ejecutar al iniciar

  // 🔁 Ejecutar cada 3 minutos
  cron.schedule('*/3 * * * *', cleanUnpaid, {
    timezone: 'America/New_York'
  });

  console.log('⏰ Cron programado para ejecutarse cada 3 minutos (EST)');
}

module.exports = scheduleCleanUnpaid;
