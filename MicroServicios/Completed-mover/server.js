// server.js
const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'LuberDB';
const SOURCE_COLLECTION = 'schedules';
const TARGET_COLLECTION = 'schedulesCompleted';

const movedHistory = []; // Historial para mostrar en HTML

app.use(express.static('public'));

async function moveCompletedSchedules() {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const sourceCol = db.collection(SOURCE_COLLECTION);
    const targetCol = db.collection(TARGET_COLLECTION);

    // Buscar todos los schedules marcados como Completed
    const completed = await sourceCol.find({ Completed: true }).toArray();

    if (completed.length === 0) {
      console.log('⏳ No completed schedules found at this time.');
      return;
    }

    for (const doc of completed) {
      const exists = await targetCol.findOne({ _id: doc._id });

      if (!exists) {
        // Insertar el documento completo (incluye serviceMilage)
        await targetCol.insertOne(doc);
        // Eliminar de la colección original
        await sourceCol.deleteOne({ _id: doc._id });

        // Añadir al historial, incluyendo serviceMilage
        movedHistory.unshift({
          _id:           doc._id,
          customerName:  doc.customerName,
          email:         doc.email,
          completedBy:   doc.completedBy,
          date:          doc.date,
          time:          doc.time,
          serviceMilage: doc.serviceMilage ?? null,
          movedAt:       new Date().toISOString()
        });

        // Limita historial a 50 entradas
        if (movedHistory.length > 50) movedHistory.pop();

        console.log(`✅ Moved schedule _id: ${doc._id}, serviceMilage: ${doc.serviceMilage}`);
      }
    }
  } catch (err) {
    console.error('❌ Error in moveCompletedSchedules:', err.message);
  } finally {
    await client.close();
  }
}

// Ejecutar cada 10 segundos
setInterval(moveCompletedSchedules, 10_000);

app.get('/moved-schedules', (req, res) => {
  res.json(movedHistory);
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
