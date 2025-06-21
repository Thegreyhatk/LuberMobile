const express = require('express');
const router = express.Router();
const { MongoClient, ObjectId } = require('mongodb');

const uri = 'mongodb://localhost:27017'; // cambia si tu DB es remota
const dbName = 'chatbot';
const collectionName = 'replies';

router.get('/replies', async (req, res) => {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const collection = client.db(dbName).collection(collectionName);
    const replies = await collection.find({}).toArray();
    const formatted = replies.map(r => ({
      question: r.question,
      answer: r.answer,
      type: r.type || 'partial' // evita undefined
    }));
    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener respuestas' });
  } finally {
    await client.close();
  }
});

router.post('/replies', async (req, res) => {
  const client = new MongoClient(uri);
  const { question, answer, type } = req.body;
  if (!question || !answer || !type) {
    return res.status(400).json({ success: false, error: 'Faltan campos' });
  }

  try {
    await client.connect();
    const collection = client.db(dbName).collection(collectionName);
    await collection.insertOne({ question, answer, type });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error al guardar respuesta' });
  } finally {
    await client.close();
  }
});

module.exports = router;
