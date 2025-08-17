const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/LuberDB';

let db;
let schedulesCol;
let conversationsCol;

async function connectToDB() {
  const client = await MongoClient.connect(MONGO_URI);
  db = client.db();
  schedulesCol = db.collection('schedules');
  conversationsCol = db.collection('conversations');
  console.log('✅ Conectado a MongoDB');
}

module.exports = {
  connectToDB,
  getDB: () => db,
  getSchedulesCol: () => schedulesCol,
  getConversationsCol: () => conversationsCol
};
