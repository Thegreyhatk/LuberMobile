const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');
const { sendWelcomeEmail } = require('./mailer');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const mongoUrl = 'mongodb://localhost:27017/Luber.lcc';
const dbName  = 'Employees_DB';
const POLL_INTERVAL_MS = 10_000; // polling cada 10s

let customers, notifications;

async function startPolling() {
  // obtiene el último _id procesado
  const last = await customers
    .find({}, { projection: { _id: 1 } })
    .sort({ _id: -1 })
    .limit(1)
    .toArray();
  let lastMaxId = last.length ? last[0]._id : new ObjectId();

  console.log('Iniciando polling de nuevas cuentas cada 10s...');

  setInterval(async () => {
    try {
      const newAccounts = await customers
        .find({ _id: { $gt: lastMaxId } })
        .sort({ _id: 1 })
        .toArray();

      for (const acct of newAccounts) {
        console.log(`Detectada nueva cuenta: ${acct.email}`);
        try {
          const info = await sendWelcomeEmail(acct.email, acct.fullName);
          await notifications.insertOne({
            customerId: acct._id,
            email: acct.email,
            fullName: acct.fullName,
            subject: '¡Gracias por unirte a Luber!',
            sentAt: new Date(),
            messageId: info.messageId
          });
          console.log(`Email enviado a ${acct.email}`);
        } catch (err) {
          console.error(`Error enviando email a ${acct.email}:`, err);
        }
        lastMaxId = acct._id;
      }
    } catch (err) {
      console.error('Error durante polling:', err);
    }
  }, POLL_INTERVAL_MS);
}

// Conexión a Mongo y arranque de servidor + polling
MongoClient.connect(mongoUrl, { useUnifiedTopology: true })
  .then(client => {
    const db = client.db(dbName);
    customers    = db.collection('customerprofiles');
    notifications = db.collection('notifications');
    console.log('Conectado a MongoDB');

    // rutas API para admin.html
    app.get('/api/customers', async (req, res) => {
      const list = await customers.find({}, {
        projection: { passwordHash: 0, vehicles: 0, oilChanges: 0, points: 0, __v: 0 }
      }).toArray();
      res.json(list);
    });

    app.get('/api/notifications', async (req, res) => {
      const list = await notifications.find().sort({ sentAt: -1 }).toArray();
      res.json(list);
    });

    // inicia polling tras conexión
    startPolling();

    const PORT = 3002;
    app.listen(PORT, () => console.log(`Servidor iniciado en puerto ${PORT}`));
  })
  .catch(err => {
    console.error('Error conectando a MongoDB:', err);
    process.exit(1);
  });

// cierre limpio
process.on('SIGINT', () => {
  console.log('\nServidor detenido.');
  process.exit();
});
