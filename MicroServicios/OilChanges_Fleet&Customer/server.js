// scripts/updateOilChanges.js

require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('🟢 Conectado a MongoDB');
}).catch(err => {
  console.error('🔴 Error al conectar a MongoDB:', err);
  process.exit(1);
});

// MODELOS (strict: false para leer campos dinámicos)
const ScheduleSchema = new mongoose.Schema({}, { strict: false });
const Schedule = mongoose.model('schedulesCompleted', ScheduleSchema, 'schedulesCompleted');

const CustomerSchema = new mongoose.Schema({}, { strict: false });
const Customer = mongoose.model('customerprofiles', CustomerSchema, 'customerprofiles');

async function updateOilChanges() {
  try {
    const schedules = await Schedule.find({ Completed: true });
    if (!schedules.length) return;

    for (const schedule of schedules) {
      const userId = schedule.userId?.toString();
      if (!userId) continue;

      const customer = await Customer.findOne({ _id: userId });
      if (!customer) continue;

      const yaExiste = customer.oilChanges?.some(entry =>
        entry.scheduleId?.toString() === schedule._id.toString()
      );
      if (yaExiste) continue;

      const oilChangeEntry = {
        scheduleId:    schedule._id,
        date:          schedule.date,
        time:          schedule.time,
        total:         schedule.total,
        offerPrice:    schedule.offerPrice,
        clientAddress: schedule.clientAddress,
        completedAt:   schedule.completedAt,
        completedBy:   schedule.completedBy,
        serviceMilage: schedule.serviceMilage, // incluido ✅
        vehicle:       schedule.vehicles?.[0] || {}
      };

      await Customer.updateOne(
        { _id: userId },
        { $push: { oilChanges: oilChangeEntry } }
      );

      console.log(`✅ OilChange agregado para userId: ${userId}`);
    }
  } catch (err) {
    console.error("❌ Error en updateOilChanges:", err);
  }
}

// Ejecutar cada 1 minuto
setInterval(updateOilChanges, 60 * 1000);

console.log("🛠️ Servicio activo y en silencio... solo reporta éxito.");
