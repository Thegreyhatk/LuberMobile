// routes/paypal.js

const express = require('express');
const router  = express.Router();
const { MongoClient, ObjectId } = require('mongodb');

// Variables de entorno
const {
  PAYPAL_CLIENT_ID,
  PAYPAL_SECRET,
  PAYPAL_MODE   = 'sandbox',
  MONGODB_URI   = 'mongodb://localhost:27017/LuberDB'
} = process.env;

// Base URL según entorno
const PAYPAL_BASE = PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

// Cliente nativo de MongoDB
const mongoClient = new MongoClient(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});
let db;
mongoClient.connect()
  .then(() => {
    db = mongoClient.db();
    console.log('✅ Conectado a MongoDB en paypal.js');
  })
  .catch(err => console.error('❌ Error conectando con MongoDB en paypal.js:', err));

// Obtiene token OAuth2 de PayPal
async function getPayPalToken() {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString('base64');
  const res  = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method:  'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type':  'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`No se obtuvo token PayPal: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

// POST /api/paypal/create-order
router.post('/create-order', async (req, res) => {
  const { total, scheduleId } = req.body;
  if (total == null || !scheduleId) {
    return res.status(400).json({ error: 'Faltan total o scheduleId' });
  }

  try {
    const token = await getPayPalToken();

    const orderRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json'
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: scheduleId,
          amount: {
            currency_code: 'USD',
            value: total.toFixed(2)
          }
        }],
        application_context: {
          return_url: `${req.protocol}://${req.get('host')}/api/paypal/capture-order`,
          cancel_url: `${req.protocol}://${req.get('host')}/customer.html`
        }
      })
    });

    const orderData = await orderRes.json();
    if (!orderRes.ok) {
      throw orderData;
    }

    const approveLink = orderData.links.find(l => l.rel === 'approve')?.href;
    res.json({ orderID: orderData.id, approveLink });

  } catch (err) {
    console.error('❌ PayPal create-order error:', err);
    res.status(500).json({ error: 'Error creando orden PayPal' });
  }
});

// GET /api/paypal/capture-order
router.get('/capture-order', async (req, res) => {
  const { token: orderID } = req.query;
  if (!orderID) {
    return res.status(400).send('Falta token de PayPal');
  }
  if (!db) {
    return res.status(500).send('Base de datos no inicializada');
  }

  try {
    const access = await getPayPalToken();
    const capRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderID}/capture`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${access}`,
        'Content-Type':  'application/json'
      }
    });
    const capData = await capRes.json();
    if (!capRes.ok) {
      throw capData;
    }

    // ─── MARCAR SCHEDULE COMO PAGADO ───
    const pu = capData.purchase_units?.[0];
    const scheduleId = pu?.reference_id;
    if (scheduleId) {
      await db.collection('schedules').updateOne(
        { _id: new ObjectId(scheduleId) },
        { $set: { paid: true, updatedAt: new Date() } }
      );
      console.log(`✅ Schedule ${scheduleId} marcado como paid: true`);
    }
    // ───────────────────────────────────

    // Redirige al perfil de cliente
    res.redirect('/customer.html');

  } catch (err) {
    console.error('❌ PayPal capture-order error:', err);
    res.status(500).send('Error capturando pago con PayPal');
  }
});

module.exports = router;
