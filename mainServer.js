// mainServer.js

require('dotenv').config();

const express    = require('express');
const mongoose   = require('mongoose');
const bcrypt     = require('bcrypt');
const { sendWelcomeEmail } = require('./mailer');
const session    = require('express-session');
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const cors       = require('cors');
const http       = require('http');
const { Server } = require('socket.io');
const { MongoClient, ObjectId } = require('mongodb');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

// --- CORS ---
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

// --- Crear carpetas de uploads si no existen ---
const UPLOADS_ROOT = path.join(__dirname, 'public/uploads');
const CHAT_ROOT    = path.join(UPLOADS_ROOT, 'chat');
[UPLOADS_ROOT, CHAT_ROOT].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// --- Archivos estáticos ---
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_ROOT));

// --- Conexión a MongoDB ---
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/LuberDB';
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

app.set('trust proxy', true);

const mongoRawClient = new MongoClient(MONGO_URI);
let usersCollection, schedulesCollection;

mongoRawClient.connect()
  .then(() => {
    const rawDb = mongoRawClient.db();
    usersCollection    = rawDb.collection('customerprofiles');
    schedulesCollection = rawDb.collection('schedules');
    console.log('✅ Conectado a MongoDB para acceso directo');
  })
  .catch(err => console.error('❌ Error conectando con MongoDB:', err));

// --- Schemas y Modelos ---
const vehicleSchema = new mongoose.Schema({
  brand: String, year: Number, model: String, engine: String,
  color: String, plateLast3: String,
  vinImageUrl: String, vehicleImageUrl: String,
  vin: String, serviceIntervals: [Number],
  interval: Number, baseInterval: Number
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

function isAuthenticated(req, res, next) {
  if (req.session?.userId) next();
  else res.status(401).json({ error: 'No autorizado' });
}

const storage = multer.diskStorage({
  destination: (req,file,cb) =>
    cb(null, file.fieldname === 'image' ? CHAT_ROOT : UPLOADS_ROOT),
  filename: (req,file,cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g,'_');
    cb(null, Date.now() + '-' + safe);
  }
});
const upload = multer({ storage });

// --------------------------
// RUTAS DE AUTENTICACIÓN
// --------------------------
app.post('/api/register', upload.any(), async (req, res) => {
  try {
    const { accountType, fullName, address, phone, officePhone, email, password } = req.body;
    const rawVeh = req.body.vehicles
      ? (Array.isArray(req.body.vehicles) ? req.body.vehicles : Object.values(req.body.vehicles))
      : [];
    const files = {};
    req.files.forEach(f => {
      files[f.fieldname] = (f.fieldname==='image' ? '/uploads/chat/' : '/uploads/') + f.filename;
    });
    const vehicles = rawVeh.map((v,i) => {
      const arr = Array.isArray(v.serviceIntervals) ? v.serviceIntervals : [v.serviceIntervals];
      const nums = arr.map(n=>Number(n));
      return {
        brand:v.brand, year:+v.year, engine:v.engine, model:v.model,
        color:v.color, plateLast3:v.plateLast3,
        vinImageUrl: files[`vehicles[${i}][vinImage]`]||'',
        vehicleImageUrl: files[`vehicles[${i}][vehicleImage]`]||'',
        vin:v.vin||'', serviceIntervals:nums,
        interval:nums[0]||0, baseInterval:nums[0]||0
      };
    });

    const user = await Customer.create({
      accountType, fullName, address, phone, officePhone,
      email, profilePictureUrl: files.profilePicture||'',
      vehicles, service:{}, oilChanges:[], points:[], cancellations:[],
      passwordHash: await bcrypt.hash(password,10)
    });

    sendWelcomeEmail(user.email, user.fullName)
      .catch(err=>console.error('❌ Falló envío de correo:',err));

    await Conversation.create({ userId:user._id, messages:[] });
    req.session.userId = user._id;
    req.session.accountType = user.accountType;
    res.json({ success:true, accountType:user.accountType });
  } catch(err) {
    if (err.code===11000 && err.keyPattern?.email) {
      return res.status(400).json({ error:'Este correo ya está registrado.' });
    }
    console.error('Error en /api/register:',err);
    res.status(400).json({ error:err.message });
  }
});

app.post('/api/login', async (req,res) => {
  try {
    const { email,password } = req.body;
    const user = await Customer.findOne({ email });
    if (!user||!await bcrypt.compare(password,user.passwordHash)) {
      throw new Error('Credenciales inválidas');
    }
    req.session.userId = user._id;
    req.session.accountType = user.accountType;
    const ip = req.headers['x-forwarded-for']||req.socket.remoteAddress||'';
    await mongoRawClient.db().collection('CustomerLOG').insertOne({
      userId:user._id, fullName:user.fullName, email, accountType:user.accountType,
      ip, at:new Date()
    });
    res.json({ success:true, accountType:user.accountType });
  } catch(err) {
    console.error('Error en /api/login:',err.message);
    res.status(401).json({ error:err.message });
  }
});

app.get('/api/customer-profile', async (req,res) => {
  if (!req.session.userId) return res.status(401).end();
  const u = await Customer.findById(req.session.userId).lean();
  if (!u) return res.status(404).end();
  res.json({
    _id:u._id, accountType:u.accountType, fullName:u.fullName,
    address:u.address, phone:u.phone, officePhone:u.officePhone,
    email:u.email, profilePictureUrl:u.profilePictureUrl,
    vehicles:u.vehicles, cancellations:u.cancellations
  });
});

// --------------------------
// RUTAS DE CHAT
// --------------------------
app.post('/api/chat/send', upload.single('image'), async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'No autorizado' })
  const text = req.body.text || '';
  const imageUrl = req.file ? '/uploads/chat/' + req.file.filename : '';

  const conv = await Conversation.findOneAndUpdate(
    { userId: req.session.userId },
    {
      $push: { messages: { sender: 'customer', text, imageUrl } },
      $set:  { archived: false }       // ← desarchivar aquí
    },
    { new: true, upsert: true }
  ).populate('userId', 'fullName email').lean();

  io.emit('conversation_update', conv);
  res.json({ success: true, messages: conv.messages });
});

app.get('/api/chat/history', async (req,res) => {
  if (!req.session.userId) return res.status(401).end();
  const conv = await Conversation.findOne({ userId:req.session.userId }).lean();
  res.json(conv?.messages||[]);
});

app.get('/api/chat/all', async (req,res) => {
  const list = await Conversation.find({ archived:false })
    .populate('userId','fullName email').lean();
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

  const conv = await Conversation.findByIdAndUpdate(
    convId,
    { $push: { messages: { sender: 'office', text: text || '', imageUrl } } },
    { new: true }
  ).populate('userId', 'fullName email').lean();

  if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' });
  io.emit('conversation_update', conv);
  res.json({ success: true, messages: conv.messages });
});

// --------------------------
// RUTAS VEHÍCULOS, SERVICIOS, CITAS
// --------------------------
app.get('/api/vehicles', async (req,res) => {
  if (!req.session.userId) return res.status(401).json({ error:'No autorizado' });
  const user = await Customer.findById(req.session.userId,'vehicles').lean();
  res.json(user.vehicles);
});

app.get('/api/services', async (req,res) => {
  const servicios = await Service.find({}).lean();
  res.json(servicios);
});

app.get('/api/availability', async (req,res) => {
  if (!req.session.userId) return res.status(401).json({ error:'No autorizado' });
  const { date } = req.query;
  const slots = [];
  for (let h=9; h<=21; h++) {
    const hour12 = h===12?12:(h>12? h-12:h);
    const suffix = h<12?'AM':'PM';
    slots.push(`${hour12.toString().padStart(2,'0')}:00 ${suffix}`);
  }
  let available = slots;
  try {
    const takenDocs = await Schedule.find({ userId:req.session.userId, date }).lean();
    const taken = takenDocs.map(d=>d.time);
    available = slots.filter(s=>!taken.includes(s));
  } catch(err) {
    console.error('Error al consultar schedules:',err);
  }
  res.json(available);
});

app.post('/api/schedule', isAuthenticated, async (req,res) => {
  try {
    const { date, time, total, clientAddress, vehicles } = req.body;
    const user = await Customer.findById(req.session.userId).lean();
    if (!user) return res.status(404).json({ error:'Usuario no encontrado' });

    const offerArray = vehicles.map(v=>{
      const basePrice = parseFloat(v.price)||0;
      return parseFloat((basePrice*0.30).toFixed(2));
    });

    const schedule = {
      userId: user._id,
      accountType: user.accountType||'Customer',
      customerName: user.fullName,
      email: user.email,
      date, time, total, clientAddress,
      offerPrice: offerArray,
      secured:false, reserved:false, reason:'awaiting Reason',
      onRoute:false, started:false, finished:false,
      vehicles: vehicles.map((v,idx)=>{
        const vehMaster = user.vehicles.find(x=>String(x._id)===String(v.vehicleId));
        return {
          vehicleId: new ObjectId(v.vehicleId),
          serviceId: new ObjectId(v.serviceId),
          oilType: v.oilType, price: v.price,
          airFilter:!!v.airFilter, cabinFilter:!!v.cabinFilter,
          serviceAddress: v.serviceAddress||clientAddress,
          vehicleInfo: {
            brand:v.vehicleInfo.brand,
            year:vehMaster?.year||null,
            engine:vehMaster?.engine||'',
            model:v.vehicleInfo.model,
            plateLast3:v.vehicleInfo.plateLast3,
            vehicleImageUrl:v.vehicleInfo.vehicleImageUrl||null,
            vinImageUrl:v.vehicleInfo.vinImageUrl||null
          }
        };
      }),
      confirmed:false, processed:false,
      createdAt:new Date(), updatedAt:new Date()
    };

    const result = await schedulesCollection.insertOne(schedule);
    res.json({ success:true, insertedId:result.insertedId });
  } catch(err) {
    console.error('Error al guardar schedule:',err);
    res.status(500).json({ error:'Error al guardar la cita' });
  }
});

app.get('/api/schedule', async (req,res) => {
  if (!req.session.userId) return res.status(401).json({ error:'No autorizado' });
  const { userId } = req.query;
  if (String(req.session.userId)!==userId) {
    return res.status(403).json({ error:'Prohibido' });
  }
  const schedules = await Schedule.find({ userId }).lean();
  res.json(schedules);
});

app.get('/api/fleet-schedules', async (req,res) => {
  try {
    const fleetSchedules = await schedulesCollection.aggregate([
      { $match:{ accountType:'Fleet' } },
      { $lookup:{
          from: 'customerprofiles',
          localField: 'userId',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      { $unwind:{ path:'$userInfo', preserveNullAndEmptyArrays:true } },
      { $addFields:{ customerName:'$userInfo.fullName' } },
      { $project:{ userInfo:0 } },
      { $sort:{ createdAt:-1 } }
    ]).toArray();
    res.json(fleetSchedules);
  } catch(err) {
    console.error('Error al obtener fleet schedules:',err);
    res.status(500).json({ error:'Error al obtener citas de flotas' });
  }
});

app.delete('/api/schedule/:id', isAuthenticated, async (req,res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).send('ID inválido.');
    const sched = await schedulesCollection.findOne({_id:new ObjectId(id)});
    if (!sched) return res.status(404).send('Cita no encontrada.');
    if (String(sched.userId)!==String(req.session.userId)) {
      return res.status(403).send('No tienes permiso.');
    }

    const apptDate = new Date(sched.date+'T00:00:00');
    const today = new Date(); today.setHours(0,0,0,0);
    if ((apptDate - today)/(1000*60*60*24) < 1) {
      return res.status(400).send('Cancela con un día de anticipación.');
    }

    for (const veh of sched.vehicles) {
      const svc = await Service.findById(veh.serviceId).lean();
      const entry = {
        date:new Date(), serviceName:svc?.name||'Servicio desconocido',
        vehicleInfo:{
          brand:veh.vehicleInfo.brand,
          model:veh.vehicleInfo.model,
          plateLast3:veh.vehicleInfo.plateLast3
        },
        archived:false
      };
      await Customer.updateOne({_id:sched.userId},{$push:{cancellations:entry}});
    }

    await schedulesCollection.deleteOne({_id:new ObjectId(id)});
    res.json({ success:true });
  } catch(err) {
    console.error('Error al cancelar cita:',err);
    res.status(500).send('Error interno.');
  }
});

app.put('/api/customer-cancellation-archive', isAuthenticated, async (req,res) => {
  try {
    const { date } = req.body;
    if (!date) return res.status(400).send('Fecha requerida.');
    const custId = new ObjectId(req.session.userId);
    const dt = new Date(date);
    const customer = await Customer.findById(custId).lean();
    if (!customer) return res.status(404).send('Usuario no encontrado.');

    const idx = customer.cancellations.findIndex(c=>new Date(c.date).getTime()===dt.getTime());
    if (idx<0) return res.status(404).send('Cancelación no encontrada.');

    const current = customer.cancellations[idx].archived;
    await Customer.updateOne(
      { _id:custId },
      { $set:{[`cancellations.${idx}.archived`]:!current} }
    );
    res.json({ success:true });
  } catch(err) {
    console.error('Error actualizando archived:',err);
    res.status(500).send('Error interno.');
  }
});

// Notificar confirmación de cita vía ChangeStream
mongoose.connection.once('open', () => {
  try {
    const cs = Schedule.watch();
    cs.on('change', async change => {
      if (change.operationType==='update'
          && change.updateDescription.updatedFields.confirmed) {
        const s = await Schedule.findById(change.documentKey._id).lean();
        const msg = `✅ Tu cita con ${s.vehicles.length} vehículo(s) el ${s.date} a las ${s.time} ha sido confirmada.`;
        const conv = await Conversation.findOneAndUpdate(
          { userId:s.userId },
          { $push:{messages:{sender:'office',text:msg,imageUrl:''}} },
          { new:true, upsert:true }
        ).lean();
        io.emit('conversation_update', conv);
      }
    });
    cs.on('error',()=>cs.close());
  } catch{}
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
