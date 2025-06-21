const express = require('express');
const router = express.Router();
const { MongoClient, ObjectId } = require('mongodb');

const uri = 'mongodb://localhost:27017';
const dbName = 'chatbot';
const collectionName = 'messages';

router.post('/send', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Texto requerido' });

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const collection = client.db(dbName).collection(collectionName);
    await collection.insertOne({ text, sender: 'customer', createdAt: new Date() });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al guardar mensaje' });
  } finally {
    await client.close();
  }
});

router.post('/reply', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Texto requerido' });

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const collection = client.db(dbName).collection(collectionName);
    await collection.insertOne({ text, sender: 'office', createdAt: new Date() });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al guardar respuesta' });
  } finally {
    await client.close();
  }
});

router.get('/history', async (req, res) => {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const collection = client.db(dbName).collection(collectionName);
    const history = await collection.find().sort({ createdAt: 1 }).toArray();
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener historial' });
  } finally {
    await client.close();
  }
});

module.exports = router;
