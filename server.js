// mainServer.js

require('dotenv').config();
const express    = require('express');
const mongoose   = require('mongoose');
const bcrypt     = require('bcrypt');
const { sendWelcomeEmail } = require('./mailer');
const session    = require('express-session');
const multer     = require('multer');
const cors       = require('cors');
const http       = require('http');
const { Server } = require('socket.io');
const { MongoClient, ObjectId } = require('mongodb');
const paypalRouter = require('./routes/paypal');
const BotReply   = require('./models/BotReply');
const path       = require('path');
const fs         = require('fs');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

// --- CONFIGURACIÓN CLOUDINARY ---
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const cloudinaryStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const folder = file.fieldname === 'image' ? 'chat' : 'uploads';
    return {
      folder,
      format: 'jpg',
      public_id: file.originalname.split('.')[0] + '-' + Date.now()
    };
  }
});

const upload = multer({ storage: cloudinaryStorage });

// --- CORS ---
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

// --- Archivos estáticos (si tienes contenido en public)
const UPLOADS_ROOT = path.join(__dirname, 'public/uploads');
const CHAT_ROOT    = path.join(UPLOADS_ROOT, 'chat');
[UPLOADS_ROOT, CHAT_ROOT].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_ROOT));

// --- Conexión a MongoDB ---
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/LuberDB';
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});
app.set('trust proxy', true);

// --- Cliente raw de Mongo para operaciones directas ---
const mongoRawClient = new MongoClient(MONGO_URI);
let usersCollection, schedulesCollection;
mongoRawClient.connect()
  .then(() => {
    const rawDb = mongoRawClient.db();
    usersCollection     = rawDb.collection('customerprofiles');
    schedulesCollection = rawDb.collection('schedules');
    console.log('✅ Conectado a MongoDB para acceso directo');
  })
  .catch(err => console.error('❌ Error conectando con MongoDB:', err));


// --- Schemas y Modelos ---
const vehicleSchema = new mongoose.Schema({
  brand: String,
  year: Number,
  model: String,
  engine: String,
  color: String,
  plateLast3: String,
  vinImageUrl: String,
  vehicleImageUrl: String,
  vin: String,
  serviceIntervals: [Number],
  interval: Number,
  baseInterval: Number,
  milage: { type: Number, default: 0 } // ✅ Aquí está la magia
});

const cancellationSchema = new mongoose.Schema({
  date:        { type: Date, required: true },
  serviceName: { type: String, required: true },
  vehicleInfo: { brand: String, model: String, plateLast3: String },
  archived:    { type: Boolean, default: false }
}, { _id: false });

const customerSchema = new mongoose.Schema({
  accountType:      String,
  fullName:         String,
  address:          String,
  phone:            String,
  officePhone:      String,
  email:            { type: String, unique: true },
  passwordHash:     String,
  profilePictureUrl:String,
  vehicles:         [vehicleSchema],
  service:          mongoose.Schema.Types.Mixed,
  oilChanges:       [Number],
  points:           [Number],
  cancellations:    [cancellationSchema]
}, { collection: 'customerprofiles' });
const Customer = mongoose.model('Customer', customerSchema);

const conversationSchema = new mongoose.Schema({
  userId:   { type: mongoose.Types.ObjectId, ref: 'Customer' },
  messages: [{
    sender:   { type: String, enum: ['customer','office'], required: true },
    text:     String,
    imageUrl: String,
    at:       { type: Date, default: Date.now }
  }],
  archived: { type: Boolean, default: false }
}, { timestamps: true });
const Conversation = mongoose.model('Conversation', conversationSchema, 'conversations');

const serviceSchema = new mongoose.Schema({
  name:            String,
  description:     String,
  description2:    String,
  details:         String,
  notes:           String,
  priceFrom:       Number,
  priceTo:         Number,
  oilCapacityFrom: Number,
  oilCapacityTo:   Number,
  category:        String,
  imagePath:       String,
  createdAt:       Date
}, { collection: 'servicios' });
const Service = mongoose.model('Service', serviceSchema);

const scheduleSchema = new mongoose.Schema({
  userId:        { type: mongoose.Types.ObjectId, ref: 'Customer', required: true },
  accountType:   { type: String, enum: ['Customer','Fleet'], required: true },
  date:          { type: String, required: true },
  time:          { type: String, required: true },
  total:         { type: Number, default: 0 },
  clientAddress: String,
  email:         String,
  offerPrice:    [Number],
  secured:       { type: Boolean, default: false },
  reserved:      { type: Boolean, default: false },
  vehicles: [{
    vehicleId:       { type: mongoose.Types.ObjectId, required: true },
    serviceId:       { type: mongoose.Types.ObjectId, ref: 'Service', required: true },
    oilType:         { type: String, enum: ['Blend','Full Synthetic'], required: true },
    price:           { type: Number, required: true },
    airFilter:       { type: Boolean, default: false },
    cabinFilter:     { type: Boolean, default: false },
    serviceAddress:  String,
    vehicleInfo: {
      brand: String, year: Number, engine: String,
      model: String, plateLast3: String,
      vehicleImageUrl: String, vinImageUrl: String
    }
  }],
  confirmed: { type: Boolean, default: false },
  paid:      { type: Boolean, default: false },   // <--- Nuevo campo
  processed: { type: Boolean, default: false }
}, { timestamps: true, collection: 'schedules' });
const Schedule = mongoose.model('Schedule', scheduleSchema);

// --- Middlewares ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'luber-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// Montar rutas PayPal
app.use('/api/paypal', paypalRouter);

function isAuthenticated(req, res, next) {
  if (req.session?.userId) next();
  else res.status(401).json({ error: 'No autorizado' });
}

// --------------------------
// RUTAS DE AUTENTICACIÓN
// --------------------------
app.post('/api/register', upload.any(), async (req, res) => {
  try {
    console.log('📨 BODY:', req.body);
    console.log('📦 FILES:', req.files);

    const {
      accountType, fullName, address, phone,
      officePhone, email, password
    } = req.body;

    const rawVeh = req.body.vehicles
      ? Array.isArray(req.body.vehicles)
        ? req.body.vehicles
        : Object.values(req.body.vehicles)
      : [];

    // 🔁 Usar las URLs públicas de Cloudinary
    const files = {};
    req.files.forEach(f => {
      console.log(`🖼️ Procesando archivo: ${f.fieldname} → ${f.path}`);
      files[f.fieldname] = f?.path?.startsWith('http') ? f.path : (f?.secure_url || f?.url || '');

    });

    const vehicles = rawVeh.map((v, i) => {
      if (typeof v === 'string') {
        try { v = JSON.parse(v); } catch (e) { v = {}; }
      }

      const serviceIntervals = Array.isArray(v.serviceIntervals)
        ? v.serviceIntervals.map(n => Number(n))
        : [Number(v.serviceIntervals || 0)];

      return {
        brand: v.brand || '',
        year: Number(v.year) || 0,
        engine: v.engine || '',
        model: v.model || '',
        color: v.color || '',
        plateLast3: v.plateLast3 || '',
        vin: v.vin || '',
        vinImageUrl: files[`vehicles[${i}][vinImage]`] || '',
        vehicleImageUrl: files[`vehicles[${i}][vehicleImage]`] || '',
        serviceIntervals,
        interval: serviceIntervals[0] || 0,
        baseInterval: serviceIntervals[0] || 0,
        milage: 0
      };
    });

    const user = await Customer.create({
      accountType,
      fullName,
      address,
      phone,
      officePhone,
      email,
      profilePictureUrl: files.profilePicture || '',
      vehicles,
      service: {},
      oilChanges: [],
      points: [],
      cancellations: [],
      passwordHash: await bcrypt.hash(password, 10)
    });

    sendWelcomeEmail(user.email, user.fullName)
      .catch(err => console.error('❌ Falló envío de correo:', err));

    await Conversation.create({ userId: user._id, messages: [] });
    req.session.userId      = user._id;
    req.session.accountType = user.accountType;

    console.log('✅ Usuario registrado correctamente:', user.email);
    res.json({ success: true, accountType: user.accountType });

  } catch (err) {
    if (err.code === 11000 && err.keyPattern?.email) {
      console.warn('⚠️ Correo ya registrado:', req.body.email);
      return res.status(400).json({ error: 'Este correo ya está registrado.' });
    }
    console.error('❌ Error en /api/register:\n', JSON.stringify(err, null, 2));
    res.status(400).json({ error: err.message || 'Error desconocido' });
  }
});


app.post('/api/login', async (req,res) => {
  try {
    const { email, password } = req.body;
    const user = await Customer.findOne({ email });
    if (!user || !await bcrypt.compare(password, user.passwordHash)) {
      throw new Error('Credenciales inválidas');
    }
    req.session.userId      = user._id;
    req.session.accountType = user.accountType;
    const ip = req.headers['x-forwarded-for']
             || req.socket.remoteAddress
             || '';
    await mongoRawClient.db().collection('CustomerLOG').insertOne({
      userId: user._id, fullName: user.fullName,
      email, accountType: user.accountType, ip, at: new Date()
    });
    res.json({ success: true, accountType: user.accountType });
  } catch(err) {
    console.error('Error en /api/login:', err.message);
    res.status(401).json({ error: err.message });
  }
});

app.get('/api/customer-profile', async (req,res) => {
  if (!req.session.userId) return res.status(401).end();
  const u = await Customer.findById(req.session.userId).lean();
  if (!u) return res.status(404).end();
  res.json({
    _id: u._id,
    accountType: u.accountType,
    fullName: u.fullName,
    address: u.address,
    phone: u.phone,
    officePhone: u.officePhone,
    email: u.email,
    profilePictureUrl: u.profilePictureUrl,
    vehicles: u.vehicles,
    cancellations: u.cancellations
  });
});

// mainServer.js (continuación)

// --------------------------
// RUTAS DE CHAT
// --------------------------
let firstMessageReplied = {};

app.post('/api/chat/send', upload.single('image'), async (req, res) => {
  const userId = req.session.userId;
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const text = req.body.text || '';
  const imageUrl = req.file ? '/uploads/chat/' + req.file.filename : '';

  const conv = await Conversation.findOneAndUpdate(
    { userId },
    {
      $push: { messages: { sender: 'customer', text, imageUrl } },
      $set: { archived: false }
    },
    { new: true, upsert: true }
  ).populate('userId', 'fullName email').lean();

  io.emit('conversation_update', conv);

  // 🔥 BOT AUTORESPUESTA 🔥
  const botReplies = await BotReply.find({}).lean();
  const clean = text.trim().toLowerCase();

  let matched = null;
  for (const r of botReplies) {
    const pattern = r.question
      .replace(/{{([^}]+)}}/g, (_, opts) => `(${opts.split('|').join('|')})`)
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // escapa regex
    const regex = new RegExp(r.type === 'exact' ? `^${pattern}$` : pattern, 'i');
    if (regex.test(clean)) {
      matched = r;
      break;
    }
  }

  let replyText = matched?.answer;
  const isFirstMessage = (conv?.messages?.filter(m => m.sender === 'customer').length || 0) === 1;

  if (!replyText && isFirstMessage) {
    replyText = '🤖 Gracias por tu mensaje. Un asesor te atenderá pronto.';
  } else if (replyText) {
    replyText = '🤖 ' + replyText;
  }

  if (replyText) {
    const updated = await Conversation.findOneAndUpdate(
      { userId },
      {
        $push: { messages: { sender: 'office', text: replyText, imageUrl: '' } }
      },
      { new: true }
    ).populate('userId', 'fullName email').lean();

    io.emit('conversation_update', updated);
  }

  res.json({ success: true, messages: conv.messages });
});




app.get('/api/chat/history', async (req, res) => {
  if (!req.session.userId) return res.status(401).end();
  const conv = await Conversation.findOne({ userId: req.session.userId }).lean();
  res.json(conv?.messages || []);
});

app.get('/api/chat/all', async (req, res) => {
  const list = await Conversation.find({ archived: false })
    .populate('userId', 'fullName email').lean();
  res.json(list);
});

app.post('/api/chat/archive', async (req, res) => {
  const { convId } = req.body;
  if (!convId) return res.status(400).json({ error: 'Falta convId' });
  await Conversation.findByIdAndUpdate(convId, { archived: true });
  const conv = await Conversation.findById(convId)
    .populate('userId', 'fullName email').lean();
  io.emit('conversation_update', conv);
  res.json({ success: true });
});

app.post('/api/chat/reply', upload.single('image'), async (req, res) => {
  const { convId, text } = req.body;
  if (!convId) return res.status(400).json({ error: 'Falta convId' });
  const imageUrl = req.file ? '/uploads/chat/' + req.file.filename : '';
  const conv     = await Conversation.findByIdAndUpdate(
    convId,
    { $push: { messages: { sender: 'office', text, imageUrl } } },
    { new: true }
  ).populate('userId', 'fullName email').lean();
  if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' });
  io.emit('conversation_update', conv);
  res.json({ success: true, messages: conv.messages });
});

// --------------------------
// RUTAS VEHÍCULOS, SERVICIOS, CITAS
// --------------------------
app.get('/api/vehicles', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'No autorizado' });
  const u = await Customer.findById(req.session.userId, 'vehicles').lean();
  res.json(u.vehicles);
});

app.get('/api/services', async (req, res) => {
  const list = await Service.find({}).lean();
  res.json(list);
});

app.get('/api/availability', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'No autorizado' });
  const { date } = req.query;
  const slots = [];
  for (let h = 9; h <= 21; h++) {
    const h12 = h === 12 ? 12 : (h > 12 ? h - 12 : h);
    const suf = h < 12 ? 'AM' : 'PM';
    slots.push(`${String(h12).padStart(2, '0')}:00 ${suf}`);
  }
  let available = slots;
  try {
    const taken = (await Schedule.find({ userId: req.session.userId, date }).lean())
      .map(d => d.time);
    available = slots.filter(s => !taken.includes(s));
  } catch (e) {
    console.error(e);
  }
  res.json(available);
});

// --------------------------
// CREAR SCHEDULE + PAYPAL
// --------------------------
app.post('/api/schedule', isAuthenticated, async (req, res) => {
  try {
    const { date, time, total, clientAddress, vehicles } = req.body;
    const user = await Customer.findById(req.session.userId).lean();
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    // 🔍 Obtener la información del vehículo desde el perfil del usuario
    const enrichedVehicles = vehicles.map(v => {
      const veh = user.vehicles.find(x => String(x._id) === String(v.vehicleId)) || {};
      return {
        vehicleId:      new ObjectId(v.vehicleId),
        serviceId:      new ObjectId(v.serviceId),
        oilType:        v.oilType,
        price:          v.price,
        airFilter:      v.airFilter,
        cabinFilter:    v.cabinFilter,
        serviceAddress: v.serviceAddress,
        vehicleInfo: {
          brand:           veh.brand || '',
          model:           veh.model || '',
          year:            veh.year || 0,
          engine:          veh.engine || '',
          plateLast3:      veh.plateLast3 || '',
          vehicleImageUrl: veh.vehicleImageUrl || '',
          vinImageUrl:     veh.vinImageUrl || ''
        }
      };
    });

    // 🧾 Construir el documento de schedule
    const scheduleDoc = {
      userId:       user._id,
      accountType:  user.accountType || 'Customer',
      customerName: user.fullName,
      email:        user.email,
      date,
      time,
      total,
      clientAddress,
      offerPrice:   enrichedVehicles.map(v => parseFloat(v.price) * 0.30),
      secured:      false,
      reserved:     false,
      vehicles:     enrichedVehicles,
      confirmed:    true,
      paid:         false,
      processed:    false,
      createdAt:    new Date(),
      updatedAt:    new Date()
    };

    // 💾 Guardar en MongoDB
    const result = await schedulesCollection.insertOne(scheduleDoc);

    // 🚛 Si es Fleet, no se necesita PayPal
    if (user.accountType === 'Fleet') {
      return res.json({
        success: true,
        insertedId: result.insertedId
      });
    }

    // 💳 Si es Customer → crear orden en PayPal
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const orderRes = await fetch(`${baseUrl}/api/paypal/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        total: total,
        scheduleId: result.insertedId.toString()
      })
    });

    const orderData = await orderRes.json();
    if (!orderRes.ok) {
      console.error('❌ PayPal create-order error:', orderData);
      return res.status(500).json({ error: 'Fallo creando orden PayPal' });
    }

    // ✅ Todo listo
    res.json({
      success: true,
      insertedId: result.insertedId,
      paypal: orderData // { orderID, approveLink }
    });

  } catch (err) {
    console.error('Error en POST /api/schedule:', err);
    res.status(500).json({ error: 'Error al guardar la cita' });
  }
});


app.get('/api/schedule', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'No autorizado' });
  const { userId } = req.query;
  if (String(req.session.userId) !== userId) return res.status(403).json({ error: 'Prohibido' });
  const list = await Schedule.find({ userId }).lean();
  res.json(list);
});

app.get('/api/fleet-schedules', async (req, res) => {
  try {
    const list = await schedulesCollection.aggregate([
      { $match: { accountType:'Fleet' } },
      { $lookup: {
          from: 'customerprofiles',
          localField: 'userId',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      { $unwind: { path:'$userInfo', preserveNullAndEmptyArrays:true } },
      { $addFields: { customerName:'$userInfo.fullName' } },
      { $project: { userInfo:0 } },
      { $sort: { createdAt:-1 } }
    ]).toArray();
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener fleet schedules' });
  }
});

app.delete('/api/schedule/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).send('ID inválido.');
    }

    // 1) Obtener la cita
    const sched = await schedulesCollection.findOne({ _id: new ObjectId(id) });
    if (!sched) {
      return res.status(404).send('Cita no encontrada.');
    }
    if (String(sched.userId) !== String(req.session.userId)) {
      return res.status(403).send('No tienes permiso.');
    }

    // 2) Validar plazo
    const apptDate = new Date(sched.date + 'T00:00:00');
    const today   = new Date(); today.setHours(0,0,0,0);
    if ((apptDate - today) / (1000*60*60*24) < 1) {
      return res.status(400).send('Cancela con un día de anticipación.');
    }

    // 3) Leer perfil del cliente para datos del vehículo
    const customer = await Customer.findById(sched.userId).lean();
    if (!customer) {
      return res.status(404).send('Cliente no encontrado.');
    }

    // 4) Para cada vehículo en la cita, agregar registro de cancelación
    for (const veh of sched.vehicles) {
      // Buscar datos reales del vehículo según vehicleId
      const vehProfile = customer.vehicles.find(v =>
        String(v._id) === String(veh.vehicleId)
      ) || {};

      // Buscar nombre de servicio
      const svc = await Service.findById(veh.serviceId).lean();

      const entry = {
        date:        new Date(),
        serviceName: svc?.name || 'Servicio desconocido',
        vehicleInfo: {
          brand:      vehProfile.brand      || 'Desconocido',
          model:      vehProfile.model      || 'Desconocido',
          plateLast3: vehProfile.plateLast3 || ''
        },
        archived:    false
      };

      await Customer.updateOne(
        { _id: sched.userId },
        { $push: { cancellations: entry } }
      );
    }

    // 5) Eliminar la cita
    await schedulesCollection.deleteOne({ _id: new ObjectId(id) });
    res.json({ success: true });

  } catch (err) {
    console.error('Error al cancelar cita:', err);
    res.status(500).send('Error interno.');
  }
});


app.put('/api/customer-cancellation-archive', isAuthenticated, async (req, res) => {
  try {
    const { date } = req.body;
    if (!date) return res.status(400).send('Fecha requerida.');
    const custId = new ObjectId(req.session.userId);
    const dt     = new Date(date);
    const customer = await Customer.findById(custId).lean();
    if (!customer) return res.status(404).send('Usuario no encontrado.');
    const idx = customer.cancellations.findIndex(c => new Date(c.date).getTime() === dt.getTime());
    if (idx < 0) return res.status(404).send('Cancelación no encontrada.');
    const current = customer.cancellations[idx].archived;
    await Customer.updateOne(
      { _id: custId },
      { $set: { [`cancellations.${idx}.archived`]: !current } }
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error interno.');
  }
});

// Notificar confirmación de cita vía ChangeStream
mongoose.connection.once('open', () => {
  try {
    const cs = Schedule.watch();
    cs.on('change', async change => {
      if (change.operationType === 'update'
          && change.updateDescription.updatedFields.confirmed) {
        const s = await Schedule.findById(change.documentKey._id).lean();
        const msg = `✅ Tu cita con ${s.vehicles.length} vehículo(s) el ${s.date} a las ${s.time} ha sido confirmada.`;
        const conv = await Conversation.findOneAndUpdate(
          { userId: s.userId },
          { $push: { messages: { sender:'office', text: msg, imageUrl: '' } } },
          { new: true, upsert: true }
        ).lean();
        io.emit('conversation_update', conv);
      }
    });
    cs.on('error', () => cs.close());
  } catch {}
});


// Obtener todas las respuestas
app.get('/api/bot/replies', async (req, res) => {
  const list = await BotReply.find({}).lean();
  res.json(list);
});

// Crear o actualizar una respuesta
app.post('/api/bot/replies', async (req, res) => {
  const { question, answer, type } = req.body;
  if (!question || !answer || !type) {
    return res.status(400).json({ error: 'Falta question, answer o type' });
  }
  const q = question.trim().toLowerCase();
  const existing = { question: q, answer, type };
  const result = await BotReply.findOneAndUpdate(
    { question: q },
    existing,
    { upsert: true, new: true }
  );
  res.json({ success: true, data: result });
});


// ——— Actualizar kilometraje del vehículo ———
app.put('/api/vehicles/:id/milage', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const { milage } = req.body;

    if (!ObjectId.isValid(id) && typeof id !== 'string') {
      return res.status(400).json({ error: 'ID de vehículo inválido' });
    }

    if (typeof milage !== 'number' || isNaN(milage) || milage < 0) {
      return res.status(400).json({ error: 'Kilometraje inválido' });
    }

    console.log('🔧 Actualizando kilometraje', {
      user: req.session.userId,
      vehicleId: id,
      milage
    });

    const result = await Customer.updateOne(
      {
        _id: req.session.userId,
        $or: [
          { 'vehicles._id': new ObjectId(id) },
          { 'vehicles._id': id }
        ]
      },
      { $set: { 'vehicles.$.milage': milage } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: 'Vehículo no encontrado o no autorizado' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error al actualizar kilometraje:', err);
    res.status(500).json({ error: 'Error interno al actualizar kilometraje' });
  }
});

// Ruta base para comprobar si el servidor está vivo
app.get('/', (req, res) => {
  res.send('🟢 Luber backend corriendo en Render');
});

// Socket.io: al conectar
io.on('connection', async socket => {
  const list = await Conversation.find({ archived:false })
    .populate('userId','fullName email').lean();
  socket.emit('conversation_list', list);
});

// --------------------------
// Arrancar servidor
// --------------------------
const PORT = process.env.PORT || 3006;
server.listen(PORT, () => console.log(`🚀 Servidor iniciado en puerto ${PORT}`));
