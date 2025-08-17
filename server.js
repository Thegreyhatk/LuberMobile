// —————————————————————————————————————————————————————————————
// 🌐 mainServer.js — Servidor principal de la app Luber
// Punto de entrada donde se configuran Express, MongoDB, Cloudinary, Socket.IO y rutas
// —————————————————————————————————————————————————————————————


// —————————————————————————————————————————————————————————————
// 📦 DEPENDENCIAS PRINCIPALES
// —————————————————————————————————————————————————————————————
require('dotenv').config(); // Variables de entorno (.env)
const express    = require('express');              // Framework principal del servidor
const mongoose   = require('mongoose');             // ODM para MongoDB
const bcrypt     = require('bcrypt');               // Hash de contraseñas
const session    = require('express-session');      // Manejo de sesiones
const multer     = require('multer');               // Middleware para subir archivos
const cors       = require('cors');                 // CORS para aceptar peticiones de otros orígenes
const http       = require('http');                 // Servidor HTTP nativo
const { Server } = require('socket.io');            // Websockets (chat y eventos en tiempo real)
const { MongoClient, ObjectId } = require('mongodb'); // Cliente MongoDB nativo
const path       = require('path');                 // Utilidades para rutas
const fs         = require('fs');                   // Sistema de archivos
const { fetch }  = require('undici');               // Fetch moderno para backend

// 📧 Email: módulo personalizado de envío de correos
const { sendWelcomeEmail } = require('./mailer');

// 📂 Modelos y rutas internas
const BotReply     = require('./models/BotReply');      // Respuestas automáticas del bot
const paypalRouter = require('./routes/paypal');        // Rutas relacionadas a PayPal


// —————————————————————————————————————————————————————————————
// 🚀 INICIALIZAR EXPRESS + HTTP + SOCKET.IO
// —————————————————————————————————————————————————————————————
const app    = express();            // Instancia de Express
const server = http.createServer(app); // Servidor HTTP
const io     = new Server(server, {    // Instancia de WebSocket con CORS habilitado
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: false
  }
});



// ✅ Socket.IO: conexión de cliente
io.on('connection', (socket) => {
  console.log(`📡 Cliente conectado al servidor Socket.IO: ${socket.id}`);
});


// —————————————————————————————————————————————————————————————
// ☁️ CONFIGURACIÓN DE CLOUDINARY PARA SUBIDA DE IMÁGENES
// —————————————————————————————————————————————————————————————
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configurar acceso a Cloudinary desde variables de entorno
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// 🖼️ Almacenamiento con multer + cloudinary
const cloudinaryStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const folder = file.fieldname === 'image' ? 'chat' : 'uploads'; // 📁 Carpeta destino según tipo
    return {
      folder,
      public_id: file.originalname.split('.')[0] + '-' + Date.now()
    };
  }
});
const upload = multer({ storage: cloudinaryStorage });


// —————————————————————————————————————————————————————————————
// 🔓 CONFIGURACIÓN CORS (Cross-Origin Resource Sharing)
// —————————————————————————————————————————————————————————————
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000', // Permitir frontend local
  credentials: true
}));


// —————————————————————————————————————————————————————————————
// 📁 ARCHIVOS ESTÁTICOS DEL FRONTEND Y CHAT
// —————————————————————————————————————————————————————————————
const UPLOADS_ROOT = path.join(__dirname, 'public/uploads');
const CHAT_ROOT    = path.join(UPLOADS_ROOT, 'chat');

// Crear carpetas si no existen (uploads/chat)
[UPLOADS_ROOT, CHAT_ROOT].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_ROOT));


// —————————————————————————————————————————————————————————————
// 🔌 CONEXIÓN A MONGODB CON MONGOOSE
// —————————————————————————————————————————————————————————————
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/LuberDB';

// Conectar con Mongoose (ODM)
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Confiar en cabeceras X-Forwarded-For (útil para proxies como NGINX)
app.set('trust proxy', true);


// —————————————————————————————————————————————————————————————
// 🧪 CLIENTE MONGODB NATIVO PARA ACCESO CRUD BAJO NIVEL
// —————————————————————————————————————————————————————————————
const mongoRawClient = new MongoClient(MONGO_URI);
let usersCollection, schedulesCollection;

mongoRawClient.connect()
  .then(() => {
    const rawDb = mongoRawClient.db(); // Base de datos por defecto
    usersCollection     = rawDb.collection('customerprofiles'); // Colección de clientes
    schedulesCollection = rawDb.collection('schedules');        // Colección de citas
    console.log('✅ Conectado a MongoDB para acceso directo');
  })
  .catch(err => console.error('❌ Error conectando con MongoDB:', err));





// —————————————————————————————————————————————————————————————
// 🧬 SCHEMAS & MODELOS DE MONGOOSE
// Define estructura de datos para vehículos, cancelaciones y clientes
// —————————————————————————————————————————————————————————————
// —————————————————————————————————————————————————————————————
// 🛻 VEHÍCULO INDIVIDUAL (Embebido en Customer)
// Datos técnicos, imágenes y configuración de mantenimiento
// —————————————————————————————————————————————————————————————
const vehicleSchema = new mongoose.Schema({
  brand:            String,             // Marca del vehículo
  year:             Number,             // Año de fabricación
  model:            String,             // Modelo
  engine:           String,             // Motor
  color:            String,             // Color exterior
  plateLast3:       String,             // Últimos 3 dígitos de la placa
  vin:              String,             // Número de serie (VIN)
  vinImageUrl:      String,             // Imagen del VIN
  vehicleImageUrl:  String,             // Imagen general del vehículo
  serviceIntervals: [Number],           // Intervalos configurados (e.g. 5000, 10000)
  interval:         Number,             // Intervalo actual
  baseInterval:     Number,             // Intervalo original (para restaurar)
  milage:           { type: Number, default: 0 } // 🔧 Kilometraje actual
});


// —————————————————————————————————————————————————————————————
// ❌ CANCELACIONES (Embebidas en Customer)
// Historial de servicios cancelados con su motivo y fecha
// —————————————————————————————————————————————————————————————
const cancellationSchema = new mongoose.Schema({
  date:        { type: Date, required: true },                         // Fecha de cancelación
  serviceName: { type: String, required: true },                       // Nombre del servicio cancelado
  vehicleInfo: {                                                      // Info del vehículo asociado
    brand:      String,
    model:      String,
    plateLast3: String
  },
  archived:    { type: Boolean, default: false }                      // Permite ocultar/mostrar en historial
}, { _id: false });


// —————————————————————————————————————————————————————————————
// 👤 CLIENTE (Customer o Fleet)
// Datos de usuario, contacto, vehículos, cancelaciones y estado
// —————————————————————————————————————————————————————————————
const customerSchema = new mongoose.Schema({
  accountType:       String,                // Tipo de cuenta: 'Customer' o 'Fleet'
  fullName:          String,                // Nombre completo del cliente
  address:           String,                // Dirección física
  phone:             String,                // Teléfono celular
  officePhone:       String,                // Teléfono de oficina (opcional)
  email:             { type: String, unique: true }, // Correo único
  passwordHash:      String,                // Contraseña hasheada con bcrypt
  profilePictureUrl: String,                // Foto de perfil del usuario
  vehicles:          [vehicleSchema],       // Lista de vehículos del cliente
  service:           mongoose.Schema.Types.Mixed, // Config extra (no estructurada)
  oilChanges:        [Number],              // Fechas o kilómetros de cambios de aceite anteriores
  points:            [Number],              // Sistema de puntos (si aplica)
  cancellations:     [cancellationSchema],  // Cancelaciones pasadas
  cancellationCount: { type: Number, default: 0 }, // Total acumulado de cancelaciones
  blocked:           { type: Boolean, default: false } // 🚫 Si está bloqueado por mal historial
}, { collection: 'customerprofiles' });

const Customer = mongoose.model('Customer', customerSchema);

// —————————————————————————————————————————————————————————————
// 💬 CHAT DE SOPORTE (Modelo Conversation)
// Define estructura del historial de mensajes entre cliente y oficina
// —————————————————————————————————————————————————————————————
const conversationSchema = new mongoose.Schema({
  userId:   { type: mongoose.Types.ObjectId, ref: 'Customer' }, // Cliente asociado
  messages: [{
    sender:   { type: String, enum: ['customer','office'], required: true }, // Quién envió el mensaje
    text:     String,                                                        // Contenido del mensaje
    imageUrl: String,                                                        // Imagen adjunta (opcional)
    at:       { type: Date, default: Date.now }                              // Fecha de envío
  }],
  archived: { type: Boolean, default: false }                                // Archivado o activo
}, { timestamps: true });
const Conversation = mongoose.model('Conversation', conversationSchema, 'conversations');

// —————————————————————————————————————————————————————————————
// 🛠️ SERVICIOS DISPONIBLES (Modelo Service)
// Catálogo de servicios: aceite, frenos, etc.
// —————————————————————————————————————————————————————————————
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

// —————————————————————————————————————————————————————————————
// 📅 CITAS DE SERVICIO (Modelo Schedule)
// Citas registradas con vehículos, servicios y estado de ejecución
// —————————————————————————————————————————————————————————————
const scheduleSchema = new mongoose.Schema({
  userId:        { type: mongoose.Types.ObjectId, ref: 'Customer', required: true }, // Cliente que agendó
  accountType:   { type: String, enum: ['Customer','Fleet'], required: true },       // Tipo de cuenta
  date:          { type: String, required: true },                                   // Fecha programada
  time:          { type: String, required: true },                                   // Hora programada
  total:         { type: Number, default: 0 },                                       // Precio total
  clientAddress: String,                                                             // Dirección del cliente
  email:         String,                                                             // Correo asociado
  offerPrice:    { type: Number, default: 0 },                                       // Precio promocional
  secured:       { type: Boolean, default: false },                                  // Confirmada por sistema
  reserved:      { type: Boolean, default: false },                                  // Espacio reservado
  vehicles: [{                                                                       // Lista de vehículos en la cita
    vehicleId:       { type: mongoose.Types.ObjectId, required: true },
    serviceId:       { type: mongoose.Types.ObjectId, ref: 'Service', required: true },
    oilType:         { type: String, enum: ['Blend','Full Synthetic'], required: true },
    price:           { type: Number, required: true },
    airFilter:       { type: Boolean, default: false },
    cabinFilter:     { type: Boolean, default: false },
    serviceAddress:  String,
    cancelled:       { type: Boolean, default: false }, // Permite cancelar individualmente
    vehicleInfo: {
      brand:           String,
      year:            Number,
      engine:          String,
      model:           String,
      plateLast3:      String,
      vehicleImageUrl: String,
      vinImageUrl:     String
    }
  }],
  confirmed: { type: Boolean, default: false },   // Confirmada por oficina
  paid:      { type: Boolean, default: false },   // Pagada
  processed: { type: Boolean, default: false },   // Ya fue gestionada por el sistema

  // — Estado de servicio (en ruta, iniciado, etc.)
  OnRoad:    { type: Boolean, default: false },
  Arrived:   { type: Boolean, default: false },
  Started:   { type: Boolean, default: false },
  Completed: { type: Boolean, default: false }
}, { timestamps: true, collection: 'schedules' });

const Schedule = mongoose.model('Schedule', scheduleSchema);

// —————————————————————————————————————————————————————————————
// ⚙️ MIDDLEWARES BÁSICOS (body-parser + sesión)
// —————————————————————————————————————————————————————————————
app.use(express.urlencoded({ extended: true })); // Formatos tipo form-data
app.use(express.json());                         // Formatos tipo JSON

// — Sesiones de usuario (usado para autenticación)
app.use(session({
  secret: process.env.SESSION_SECRET || 'luber-secret', // 🔐 Clave secreta
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // true si usas HTTPS (para producción)
}));







// —————————————————————————————————————————————————————————————
// 💰 RUTAS DE PAGO CON PAYPAL
// Endpoint base: /api/paypal
// Función: Delegar todas las rutas de pago a paypalRouter
// —————————————————————————————————————————————————————————————
app.use('/api/paypal', paypalRouter);



// —————————————————————————————————————————————————————————————
// 🔐 MIDDLEWARE DE AUTENTICACIÓN
// Nombre: isAuthenticated
// Función: Verifica si el usuario tiene una sesión activa (req.session.userId)
// Si no está logueado, devuelve 401 (No autorizado)
// —————————————————————————————————————————————————————————————
function isAuthenticated(req, res, next) {
  if (req.session?.userId) next();             // ✅ Usuario autenticado → continuar
  else res.status(401).json({ error: 'No autorizado' }); // ❌ Sin sesión → bloquear acceso
}





// —————————————————————————————————————————————————————————————
// 🧾 REGISTRO DE USUARIO (Fleet o Customer)
// Endpoint: POST /api/register
// Función: Crea un nuevo usuario con uno o varios vehículos, sube imágenes, guarda sesión, y envía correo de bienvenida
// —————————————————————————————————————————————————————————————

app.post('/api/register', upload.any(), async (req, res) => {
  try {
    console.log('📨 BODY:', req.body);   // Mostrar datos del formulario
    console.log('📦 FILES:', req.files); // Mostrar archivos subidos

    const {
      accountType, fullName, address,
      phone, officePhone, email, password
    } = req.body;

    // 🚗 Procesar vehículos recibidos
    const rawVeh = req.body.vehicles
      ? Array.isArray(req.body.vehicles)
        ? req.body.vehicles
        : Object.values(req.body.vehicles)
      : [];

    // 🖼️ Procesar archivos subidos (desde Cloudinary o file system)
    const files = {};
    req.files.forEach(f => {
      console.log(`🖼️ Procesando archivo: ${f.fieldname} → ${f.path}`);
      files[f.fieldname] = f?.path?.startsWith('http')
        ? f.path
        : (f?.secure_url || f?.url || '');
    });

    // 🛠️ Estructurar array de vehículos del usuario
    const vehicles = rawVeh.map((v, i) => {
      if (typeof v === 'string') {
        try { v = JSON.parse(v); } catch (e) { v = {}; }
      }

      const serviceIntervals = Array.isArray(v.serviceIntervals)
        ? v.serviceIntervals.map(n => Number(n))
        : [Number(v.serviceIntervals || 0)];

      return {
        brand:           v.brand || '',
        year:            Number(v.year) || 0,
        engine:          v.engine || '',
        model:           v.model || '',
        color:           v.color || '',
        plateLast3:      v.plateLast3 || '',
        vin:             v.vin || '',
        vinImageUrl:     files[`vehicles[${i}][vinImage]`] || '',
        vehicleImageUrl: files[`vehicles[${i}][vehicleImage]`] || '',
        serviceIntervals,
        interval:        serviceIntervals[0] || 0,
        baseInterval:    serviceIntervals[0] || 0,
        milage:          0 // ⛽ Odómetro inicial
      };
    });

    // ✅ Crear nuevo usuario en MongoDB
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

    // ✉️ Enviar correo de bienvenida (no bloquear)
    sendWelcomeEmail(user.email, user.fullName)
      .catch(err => console.error('❌ Falló envío de correo:', err));

    // 💬 Inicializar conversación de chat vacía
    await Conversation.create({
      userId: user._id,
      messages: []
    });

    // 🧠 Iniciar sesión automáticamente tras registrarse
    req.session.userId      = user._id;
    req.session.accountType = user.accountType;

    console.log('✅ Usuario registrado correctamente:', user.email);
    res.json({ success: true, accountType: user.accountType });

  } catch (err) {
    // ⚠️ Manejo de error: correo duplicado
    if (err.code === 11000 && err.keyPattern?.email) {
      console.warn('⚠️ Correo ya registrado:', req.body.email);
      return res.status(400).json({ error: 'Este correo ya está registrado.' });
    }

    // ❌ Otros errores
    console.error('❌ Error en /api/register:\n', JSON.stringify(err, null, 2));
    res.status(400).json({ error: err.message || 'Error desconocido' });
  }
});

// —————————————————————————————————————————————————————————————
// 🔐 LOGIN DEL CLIENTE (AUTENTICACIÓN BÁSICA)
// Endpoint: POST /api/login
// Función: Verifica credenciales y genera sesión activa
// —————————————————————————————————————————————————————————————

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body; // 📨 Datos enviados desde el frontend

    // 🔍 Buscar usuario por email
    const user = await Customer.findOne({ email });

    // ❌ Validar si existe y si la contraseña coincide (bcrypt)
    if (!user || !await bcrypt.compare(password, user.passwordHash)) {
      throw new Error('Credenciales inválidas');
    }

    // ✅ Iniciar sesión: guardar userId y tipo de cuenta en la sesión
    req.session.userId      = user._id;
    req.session.accountType = user.accountType;

    // 🌐 Capturar IP del usuario para registrar el login
    const ip = req.headers['x-forwarded-for']           // Si hay proxy
            || req.socket.remoteAddress                // IP directa
            || '';

    // 📝 Registrar log del login en una colección separada
    await mongoRawClient.db().collection('CustomerLOG').insertOne({
      userId:      user._id,
      fullName:    user.fullName,
      email,
      accountType: user.accountType,
      ip,
      at:          new Date()
    });

    // 🔓 Respuesta de éxito
    res.json({ success: true, accountType: user.accountType });

  } catch (err) {
    // ❌ Manejo de errores (credenciales inválidas u otro error)
    console.error('❌ Error en /api/login:', err.message);
    res.status(401).json({ error: err.message });
  }
});


 
// —————————————————————————————————————————————————————————————
// 👤 Obtener perfil completo del cliente autenticado
// Endpoint: GET /api/customer-profile
// Función: Devuelve todos los datos relevantes del perfil del cliente logueado
// —————————————————————————————————————————————————————————————

app.get('/api/customer-profile', async (req, res) => {
  // 🔐 Validar sesión activa
  if (!req.session.userId) return res.status(401).end();

  // 🔍 Buscar al cliente en la base de datos
  const u = await Customer.findById(req.session.userId).lean();
  if (!u) return res.status(404).end(); // ⛔ Usuario no encontrado

  // ✅ Devolver perfil completo (solo los campos necesarios)
  res.json({
    _id:               u._id,                // ID único del cliente
    accountType:       u.accountType,        // Tipo de cuenta (Customer / Fleet)
    fullName:          u.fullName,           // Nombre completo
    address:           u.address,            // Dirección registrada
    phone:             u.phone,              // Teléfono personal
    officePhone:       u.officePhone,        // Teléfono de oficina
    email:             u.email,              // Correo electrónico
    profilePictureUrl: u.profilePictureUrl,  // URL de la foto de perfil
    vehicles:          u.vehicles,           // Lista de vehículos registrados
    cancellations:     u.cancellations,      // Historial de cancelaciones
    oilChanges:        u.oilChanges          // 🛢️ Historial de cambios de aceite
  });
});


// —————————————————————————————————————————————————————————————
// 💬 Chat API (compat: no redeclarar ObjectId, mismas rutas/funciones)
// —————————————————————————————————————————————————————————————

// Helpers locales (nombres únicos para evitar choques) ——————————————
function _chat_isValidObjectId(id) {
  return mongoose?.Types?.ObjectId?.isValid(id);
}

function _chat_normalizeText(s = '') {
  return String(s)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function _chat_escapeRegex(str = '') {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function _chat_buildPatternFromQuestion(questionRaw = '', type = 'pattern') {
  // Soporta templates {{a|b|c}} -> (a|b|c) sin escaparlos
  const TOKEN_OPEN = '__OPEN__';
  const TOKEN_CLOSE = '__CLOSE__';

  let marked = String(questionRaw).replace(/{{([^}]+)}}/g, (_, opts) => {
    const inner = opts.split('|').map(o => o.trim()).join('|');
    return `${TOKEN_OPEN}${inner}${TOKEN_CLOSE}`;
  });

  marked = _chat_escapeRegex(marked)
    .replace(new RegExp(_chat_escapeRegex(TOKEN_OPEN), 'g'), '(')
    .replace(new RegExp(_chat_escapeRegex(TOKEN_CLOSE), 'g'), ')');

  return type === 'exact' ? `^${marked}$` : marked;
}

function _chat_emitConversation(conv) {
  try { io.emit('conversation_update', conv); } catch { /* no-op */ }
}

// —————————————————————————————————————————————————————————————
// 💬 Chat: Enviar mensaje desde el cliente
// Endpoint: POST /api/chat/send
// Función: Agrega un mensaje del usuario al chat, con respuesta automática del bot si aplica
// —————————————————————————————————————————————————————————————

let firstMessageReplied = {}; // 🧠 Memoria temporal por sesión (anti-spam bot)

// —————————————————————————————————————————————————————————————
// 💬 Chat: Enviar mensaje desde el cliente
// —————————————————————————————————————————————————————————————
app.post('/api/chat/send', upload.single('image'), async (req, res) => {
  try {
    const userId = req.session.userId;

    // 🔐 Verificar si está logueado y el ID es válido
    if (!userId || !_chat_isValidObjectId(userId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 📝 Limpiar el texto recibido y generar URL de la imagen si se subió una
    const rawText = (req.body.text || '').trim();
    const imageUrl = req.file ? '/uploads/chat/' + req.file.filename : '';

    // 🔤 Normalizar texto para evitar problemas de acentos o mayúsculas
    const normalizedText = _chat_normalizeText(rawText);

    // —————————————————————————————————————————————————————————————
    // 0️⃣ Siempre guardar el mensaje del cliente en la conversación
    // —————————————————————————————————————————————————————————————
    let conv = await Conversation.findOneAndUpdate(
      { userId },
      {
        $push: { messages: { sender: 'customer', text: rawText, imageUrl } },
        $set:  { archived: false }
      },
      { new: true, upsert: true }
    ).lean();

    // 🔁 Recargar populateado ANTES de emitir
    let convPop = await Conversation.findById(conv._id)
      .populate('userId', 'fullName email')
      .lean();

    // Emitir conversación actualizada por WebSocket (ya populateada)
    _chat_emitConversation(convPop);

    // —————————————————————————————————————————————————————————————
    // 1️⃣ Comandos especiales: "bot on" o "bot off"
    // —————————————————————————————————————————————————————————————
    if (normalizedText === 'bot off' || normalizedText === 'bot on') {
      const isOff = normalizedText === 'bot off';
      req.session.autoReplyDisabled = isOff;
      await new Promise(r => req.session.save(r));

      const confirmation = isOff
        ? '🤖 Bot turned off. I will stop replying until you say "bot on".'
        : '🤖 Bot turned on. I’m back!';

      conv = await Conversation.findOneAndUpdate(
        { userId },
        { $push: { messages: { sender: 'office', text: confirmation, imageUrl: '' } } },
        { new: true }
      ).lean();

      const convPop2 = await Conversation.findById(conv._id)
        .populate('userId', 'fullName email')
        .lean();

      _chat_emitConversation(convPop2);
      return res.json({ success: true, messages: convPop2.messages });
    }

    // —————————————————————————————————————————————————————————————
    // 2️⃣ Si el bot está desactivado por sesión, salir sin responder
    // —————————————————————————————————————————————————————————————
    if (req.session.autoReplyDisabled) {
      return res.json({ success: true, messages: convPop.messages });
    }

    // —————————————————————————————————————————————————————————————
    // 3️⃣ Si el bot ya respondió lo mismo, preguntar si quiere verlo otra vez
    // —————————————————————————————————————————————————————————————
    const SEE_AGAIN = '🤖 I’ve already shown you that response. Would you like to see it again?';
    const lastOffice = convPop.messages.slice().reverse().find(m => m.sender === 'office');

    if (lastOffice?.text === SEE_AGAIN) {
      const ans = normalizedText;
      let followUp;

      if (['yes','y','sure','of course','yeah'].includes(ans)) {
        const idx = convPop.messages.findIndex(m => m.text === SEE_AGAIN);
        const original = convPop.messages[idx - 1];
        followUp = original?.text || '🤖 Sorry, I can’t retrieve that right now.';
      } else if (['no','n','no thanks','nah','not now'].includes(ans)) {
        followUp = '🤖 Got it. I won’t show it again.';
        req.session.autoReplyDisabled = true;
        await new Promise(r => req.session.save(r));
      } else {
        followUp = '🤖 Please reply “yes” or “no.”';

        conv = await Conversation.findOneAndUpdate(
          { userId },
          { $push: { messages: { sender: 'office', text: followUp, imageUrl: '' } } },
          { new: true }
        ).lean();

        const convPop3 = await Conversation.findById(conv._id)
          .populate('userId', 'fullName email')
          .lean();

        _chat_emitConversation(convPop3);
        return res.json({ success: true, messages: convPop3.messages });
      }

      conv = await Conversation.findOneAndUpdate(
        { userId },
        { $push: { messages: { sender: 'office', text: followUp, imageUrl: '' } } },
        { new: true }
      ).lean();

      const convPop4 = await Conversation.findById(conv._id)
        .populate('userId', 'fullName email')
        .lean();

      _chat_emitConversation(convPop4);
      return res.json({ success: true, messages: convPop4.messages });
    }

    // —————————————————————————————————————————————————————————————
    // 4️⃣ Lógica normal de respuesta automática
    // —————————————————————————————————————————————————————————————
    const botReplies = await BotReply.find({}, { question: 1, answer: 1, type: 1 }).lean();
    let matched = null;

    // Buscar coincidencias con las respuestas configuradas (exacta o por patrón)
    for (const r of botReplies) {
      const q = String(r.question || '');

      // Exact: comparación en espacio normalizado (simétrica)
      if (r.type === 'exact' && _chat_normalizeText(q) === normalizedText) {
        matched = r;
        break;
      }

      // Pattern: regex seguro (template-friendly)
      const pattern = _chat_buildPatternFromQuestion(q, r.type);
      const regex = new RegExp(pattern, 'i');
      if (regex.test(normalizedText)) {
        matched = r;
        break;
      }
    }

    // Determinar respuesta automática a enviar
    const custCount = convPop.messages.filter(m => m.sender === 'customer').length;
    let replyText = matched?.answer
      ? `🤖 ${matched.answer}`
      : (custCount === 1
          ? '🤖 Thank you for your message. An agent will assist you shortly.'
          : null);

    if (!replyText) {
      return res.json({ success: true, messages: convPop.messages });
    }

    // —————————————————————————————————————————————————————————————
    // 5️⃣ Si ya se envió esta misma respuesta, preguntar si quiere verla de nuevo
    // —————————————————————————————————————————————————————————————
    if (lastOffice?.text === replyText) {
      conv = await Conversation.findOneAndUpdate(
        { userId },
        { $push: { messages: { sender: 'office', text: SEE_AGAIN, imageUrl: '' } } },
        { new: true }
      ).lean();

      const convPop5 = await Conversation.findById(conv._id)
        .populate('userId', 'fullName email')
        .lean();

      _chat_emitConversation(convPop5);
      return res.json({ success: true, messages: convPop5.messages });
    }

    // —————————————————————————————————————————————————————————————
    // 6️⃣ Enviar respuesta automática final del bot
    // —————————————————————————————————————————————————————————————
    conv = await Conversation.findOneAndUpdate(
      { userId },
      { $push: { messages: { sender: 'office', text: replyText, imageUrl: '' } } },
      { new: true }
    ).lean();

    const convPop6 = await Conversation.findById(conv._id)
      .populate('userId', 'fullName email')
      .lean();

    _chat_emitConversation(convPop6);
    res.json({ success: true, messages: convPop6.messages });
  } catch (err) {
    console.error('POST /api/chat/send error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});



// —————————————————————————————————————————————————————————————
// 📜 Obtener historial de chat del usuario actual
// Endpoint: GET /api/chat/history
// Función: Devuelve todos los mensajes del chat para el usuario logueado
// —————————————————————————————————————————————————————————————
app.get('/api/chat/history', async (req, res) => {
  try {
    // 🔐 Validar sesión activa
    if (!req.session.userId || !_chat_isValidObjectId(req.session.userId)) {
      return res.status(401).end(); // ⛔ No autorizado
    }

    // 🔎 Buscar conversación por userId
    const conv = await Conversation
      .findOne({ userId: req.session.userId }, { messages: 1, _id: 0 })
      .lean();

    // 📤 Enviar solo los mensajes, o array vacío si no hay conversación
    res.json(conv?.messages || []);
  } catch (err) {
    console.error('GET /api/chat/history error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});



// —————————————————————————————————————————————————————————————
// 👥 Obtener todas las conversaciones activas (no archivadas)
// Endpoint: GET /api/chat/all
// Función: Devuelve todas las conversaciones visibles del sistema
// —————————————————————————————————————————————————————————————
app.get('/api/chat/all', async (req, res) => {
  try {
    // 🔍 Buscar conversaciones donde archived = false
    const list = await Conversation.find(
      { archived: false },
      { messages: 1, userId: 1, archived: 1, createdAt: 1, updatedAt: 1 }
    )
      .sort({ updatedAt: -1 })
      .limit(500)
      .populate('userId', 'fullName email') // 👤 Incluir nombre y correo del usuario
      .lean();

    // 📤 Enviar lista al frontend
    res.json(list);
  } catch (err) {
    console.error('GET /api/chat/all error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});



// —————————————————————————————————————————————————————————————
// 📦 Archivar conversación por ID
// Endpoint: POST /api/chat/archive
// Función: Marca como archivada una conversación específica (convId)
// Al finalizar, emite una actualización en tiempo real vía WebSocket
// —————————————————————————————————————————————————————————————
app.post('/api/chat/archive', async (req, res) => {
  try {
    const { convId } = req.body;

    // ⛔ Validar que venga el ID de conversación
    if (!convId || !_chat_isValidObjectId(convId)) {
      return res.status(400).json({ error: 'Falta convId válido' });
    }

    // 🗃️ Actualizar la conversación para marcarla como archivada
    const updated = await Conversation.findByIdAndUpdate(
      convId,
      { archived: true },
      { new: true }
    )
      .populate('userId', 'fullName email')
      .lean();

    if (!updated) return res.status(404).json({ error: 'Conversación no encontrada' });

    // 📡 Emitir evento de actualización por WebSocket a los clientes
    _chat_emitConversation(updated);

    // ✅ Confirmar al cliente que se archivó correctamente
    res.json({ success: true });
  } catch (err) {
    console.error('POST /api/chat/archive error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});



// —————————————————————————————————————————————————————————————
// 💬 Responder a una conversación desde la oficina
// Endpoint: POST /api/chat/reply
// Función: Agrega un nuevo mensaje (texto + opcional imagen) al historial del chat
// Subida de archivos: Se permite una imagen (campo 'image'), que se guarda en /uploads/chat/
// —————————————————————————————————————————————————————————————
app.post('/api/chat/reply', upload.single('image'), async (req, res) => {
  try {
    const { convId, text } = req.body;

    // ⛔ Validar que se haya enviado el ID de la conversación
    if (!convId || !_chat_isValidObjectId(convId)) {
      return res.status(400).json({ error: 'Falta convId válido' });
    }

    // 🖼️ Si se subió imagen, construir la ruta donde se guardó
    const imageUrl = req.file ? '/uploads/chat/' + req.file.filename : '';

    // 📥 Agregar el nuevo mensaje al array de mensajes de la conversación
    const conv = await Conversation.findByIdAndUpdate(
      convId,
      {
        $push: {
          messages: {
            sender: 'office',                 // Remitente: oficina
            text: String(text || '').trim(),  // Texto enviado
            imageUrl                          // Imagen (vacía si no hay)
          }
        }
      },
      { new: true } // Devolver documento actualizado
    ).populate('userId', 'fullName email').lean(); // Cargar datos del usuario

    // ⚠️ Si no existe la conversación, enviar error 404
    if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' });

    // 📡 Emitir actualización vía WebSocket a todos los clientes conectados
    _chat_emitConversation(conv);

    // ✅ Devolver la nueva lista de mensajes al cliente
    res.json({ success: true, messages: conv.messages });
  } catch (err) {
    console.error('POST /api/chat/reply error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});





// —————————————————————————————————————————————————————————————
// 🚗 Obtener vehículos del usuario autenticado
// Endpoint: GET /api/vehicles
// Función: Devuelve el array de vehículos asociados al usuario actual
// Seguridad: Requiere sesión activa (middleware de sesión habilitado)
// —————————————————————————————————————————————————————————————
app.get('/api/vehicles', async (req, res) => {
  // ⛔ Si no hay sesión activa, rechazar con error 401
  if (!req.session.userId) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  // 🔍 Buscar al usuario autenticado y extraer solo el campo "vehicles"
  const u = await Customer.findById(req.session.userId, 'vehicles').lean();

  // 🚚 Devolver el array de vehículos del perfil
  res.json(u.vehicles);
});
// —————————————————————————————————————————————————————————————
// 🛠️ Obtener lista de servicios disponibles
// Endpoint: GET /api/services
// Función: Devuelve todos los servicios definidos en la base de datos
// Seguridad: Público (puede usarse en formularios sin autenticación)
// —————————————————————————————————————————————————————————————
app.get('/api/services', async (req, res) => {
  // 🔍 Consultar todos los documentos de la colección "services"
  const list = await Service.find({}).lean();

  // 📦 Devolver lista completa al cliente (array de servicios)
  res.json(list);
});





// —————————————————————————————————————————————————————————————
// 📅 Obtener horarios disponibles para un día específico
// Endpoint: GET /api/availability?date=YYYY-MM-DD
// Función: Devuelve los horarios aún libres para el usuario autenticado
// Seguridad: Solo usuarios con sesión activa
// —————————————————————————————————————————————————————————————
app.get('/api/availability', async (req, res) => {
  // 🔐 Validar sesión activa
  if (!req.session.userId) return res.status(401).json({ error: 'No autorizado' });

  const { date } = req.query; // 🗓️ Fecha enviada por el cliente (formato: YYYY-MM-DD)
  const slots = [];

  // 🕘 Generar listado de horarios base: 9:00 AM hasta 9:00 PM
  for (let h = 9; h <= 21; h++) {
    const h12 = h === 12 ? 12 : (h > 12 ? h - 12 : h); // convertir a 12h
    const suf = h < 12 ? 'AM' : 'PM';                 // sufijo AM/PM
    slots.push(`${String(h12).padStart(2, '0')}:00 ${suf}`);
  }

  let available = slots; // Inicialmente asumimos que todo está disponible

  try {
    // 🔍 Buscar citas del usuario autenticado en esa fecha
    const taken = (await Schedule.find({
      userId: req.session.userId,
      date
    }).lean()).map(d => d.time); // Obtener sólo el campo de hora (`time`)

    // 🟢 Filtrar los horarios que no han sido tomados
    available = slots.filter(slot => !taken.includes(slot));
  } catch (e) {
    // ❌ Error inesperado durante consulta
    console.error('❌ Error al consultar disponibilidad:', e);
  }

  // ✅ Devolver la lista final de horarios libres
  res.json(available);
});




// —————————————————————————————————————————————————————————————
// 📆 Crear nueva cita + integración con PayPal
// Endpoint: POST /api/schedule
// Función: Crea una nueva cita con los datos del cliente y vehículos seleccionados
//          Si el usuario es tipo "Fleet", se omite PayPal
//          Si es "Customer", se genera orden en PayPal
// Seguridad: Solo usuarios autenticados
// —————————————————————————————————————————————————————————————
app.post('/api/schedule', isAuthenticated, async (req, res) => {
  try {
    const { date, time, total, clientAddress, vehicles } = req.body;

    // 🔍 Buscar el perfil del usuario actual
    const user = await Customer.findById(req.session.userId).lean();
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    // ⛔ Rechazar si el usuario ha sido bloqueado por cancelar muchas veces
    if (user.blocked) {
      return res.status(403).json({
        error: 'Tu cuenta ha sido bloqueada por exceder el límite de cancelaciones permitidas. Puedes comunicarte con nosotros vía chat para una solución.'
      });
    }

    // 🚫 Verificar si ya existe una cita para ese día y hora
    const conflict = await schedulesCollection.findOne({ date, time });
    if (conflict) {
      return res.status(400).json({ error: 'Este horario ya está ocupado. Por favor elige otra hora.' });
    }

    // 🛠️ Enriquecer los datos de cada vehículo con la info guardada del usuario
    const enrichedVehicles = vehicles
      .filter(v =>
        v.serviceId && ObjectId.isValid(v.serviceId) &&
        v.vehicleId && ObjectId.isValid(v.vehicleId)
      )
      .map(v => {
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

    // 📋 Documento completo de la cita que se insertará
    const scheduleDoc = {
      userId:       user._id,
      accountType:  user.accountType || 'Customer',
      customerName: user.fullName,
      email:        user.email,
      date,
      time,
      total,
      clientAddress,
      offerPrice:   Math.round(
        enrichedVehicles.reduce((sum, v) => sum + (parseFloat(v.price) * 0.25), 0) * 100
      ) / 100, // 🧮 Oferta del 25% para oficina (backoffice)
      secured:      false,
      reserved:     false,
      vehicles:     enrichedVehicles,
      confirmed:    false,
      paid:         false,
      processed:    user.accountType === 'Customer',
      createdAt:    new Date(),
      updatedAt:    new Date(),
      OnRoad:       false,
      Arrived:      false,
      Started:      false,
      Completed:    false
    };

    // 💾 Insertar la cita en MongoDB
    const result = await schedulesCollection.insertOne(scheduleDoc);

    // 🏢 Si es cuenta tipo Fleet, no necesita pago
    if (user.accountType === 'Fleet') {
      return res.json({ success: true, insertedId: result.insertedId });
    }

    // 💳 Si es Customer, crear orden en PayPal
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const orderRes = await fetch(`${baseUrl}/api/paypal/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        total: total,
        scheduleId: result.insertedId.toString()
      })
    });

    // 📦 Extraer datos de la respuesta de PayPal
    const orderData = await orderRes.json();

    // ❌ Validar si hubo error creando la orden
    if (!orderRes.ok) {
      console.error('❌ PayPal create-order error:', orderData);
      return res.status(500).json({ error: 'Fallo creando orden PayPal' });
    }

    // ✅ Todo bien: devolver ID insertado + datos de PayPal
    res.json({
      success: true,
      insertedId: result.insertedId,
      paypal: orderData
    });

  } catch (err) {
    // ❌ Error inesperado
    console.error('Error en POST /api/schedule:', err);
    res.status(500).json({ error: 'Error al guardar la cita' });
  }
});




// —————————————————————————————————————————————————————————————
// 📅 Obtener todas las citas del usuario autenticado
// Endpoint: GET /api/schedule?userId=xxx
// Función: Devuelve todas las citas del usuario logueado
// Seguridad: Solo permite obtener citas si el userId coincide con la sesión
// —————————————————————————————————————————————————————————————
app.get('/api/schedule', async (req, res) => {
  // 🔐 Verificar sesión activa
  if (!req.session.userId) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const { userId } = req.query; // 🧾 userId proporcionado por el frontend

  // 🛑 Prevenir acceso a otros usuarios: comparar con session.userId
  if (String(req.session.userId) !== userId) {
    return res.status(403).json({ error: 'Prohibido' });
  }

  // 📥 Buscar todas las citas asociadas al usuario autenticado
  const list = await Schedule.find({ userId }).lean();

  // 📤 Devolver la lista de citas al frontend
  res.json(list);
});


// —————————————————————————————————————————————————————————————
// 🚛 Obtener todas las citas de cuentas tipo Fleet
// Endpoint: GET /api/fleet-schedules
// Función: Devuelve todas las citas creadas por usuarios con cuenta Fleet
// Uso: Panel administrativo para monitoreo masivo
// —————————————————————————————————————————————————————————————
app.get('/api/fleet-schedules', async (req, res) => {
  try {
    // 📊 Consultar y enriquecer datos mediante aggregation pipeline
    const list = await schedulesCollection.aggregate([
      // 1️⃣ Filtrar solo las citas de cuentas tipo Fleet
      { $match: { accountType: 'Fleet' } },

      // 2️⃣ Unir con datos del cliente (nombre, etc.)
      {
        $lookup: {
          from: 'customerprofiles',           // ← nombre real de la colección
          localField: 'userId',               // campo local en la cita
          foreignField: '_id',                // campo en customerprofiles
          as: 'userInfo'                      // nombre temporal para los datos unidos
        }
      },

      // 3️⃣ Aplanar el arreglo resultante (si existe) o dejarlo vacío
      { $unwind: { path: '$userInfo', preserveNullAndEmptyArrays: true } },

      // 4️⃣ Agregar el nombre del cliente como campo directo
      { $addFields: { customerName: '$userInfo.fullName' } },

      // 5️⃣ Excluir el bloque completo userInfo del resultado final
      { $project: { userInfo: 0 } },

      // 6️⃣ Ordenar por fecha de creación descendente (más reciente primero)
      { $sort: { createdAt: -1 } }
    ]).toArray();

    // ✅ Devolver la lista enriquecida
    res.json(list);

  } catch (err) {
    // ❌ Log de errores y respuesta de fallo
    console.error('❌ Error en fleet-schedules:', err);
    res.status(500).json({ error: 'Error al obtener fleet schedules' });
  }
});




// —————————————————————————————————————————————————————————————
// ❌ Eliminar una cita con penalización automática
// Endpoint: DELETE /api/schedule/:id
// Función: Elimina una cita si el usuario la cancela con anticipación
//          y registra la cancelación en su historial, aplicando bloqueo si excede el límite.
// —————————————————————————————————————————————————————————————
app.delete('/api/schedule/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params; // 🔑 ID de la cita a cancelar

    // 🚫 Validar que el ID sea válido
    if (!ObjectId.isValid(id)) {
      return res.status(400).send('ID inválido.');
    }

    // 1️⃣ Buscar la cita en la colección
    const sched = await schedulesCollection.findOne({ _id: new ObjectId(id) });
    if (!sched) return res.status(404).send('Cita no encontrada.');

    // 🔐 Validar que la cita le pertenezca al usuario autenticado
    if (String(sched.userId) !== String(req.session.userId)) {
      return res.status(403).send('No tienes permiso.');
    }

    // 2️⃣ Validar que la cancelación se realice al menos un día antes
    const apptDate = new Date(sched.date + 'T00:00:00');
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const diffDays = (apptDate - today) / (1000 * 60 * 60 * 24);
    if (diffDays < 1) {
      return res.status(400).send('Cancela con un día de anticipación.');
    }

    // 3️⃣ Obtener el perfil del cliente
    const customer = await Customer.findById(sched.userId).lean();
    if (!customer) return res.status(404).send('Cliente no encontrado.');

    // 4️⃣ Crear entradas de cancelación para cada vehículo agendado
    const cancelEntries = [];

    for (const veh of sched.vehicles) {
      const vehProfile = customer.vehicles.find(v =>
        String(v._id) === String(veh.vehicleId)
      ) || {};

      const svc = await Service.findById(veh.serviceId).lean();

      cancelEntries.push({
        date: new Date(), // Fecha actual
        serviceName: svc?.name || 'Servicio desconocido',
        vehicleInfo: {
          brand:      vehProfile.brand || 'Desconocido',
          model:      vehProfile.model || 'Desconocido',
          plateLast3: vehProfile.plateLast3 || ''
        },
        archived: false // Por defecto, no archivado
      });
    }

    // 5️⃣ Actualizar el cliente: registrar cancelaciones y sumar conteo
    const updates = {
      $push: { cancellations: { $each: cancelEntries } },
      $inc:  { cancellationCount: 1 }
    };

    // 🔒 Si llega a 3 cancelaciones y aún no está bloqueado → bloquear
    const newTotal = (customer.cancellationCount || 0) + 1;
    if (newTotal >= 3 && !customer.blocked) {
      updates.$set = { blocked: true };
    }

    await Customer.updateOne({ _id: sched.userId }, updates);

    // 6️⃣ Eliminar la cita de la base de datos
    await schedulesCollection.deleteOne({ _id: new ObjectId(id) });

    // ✅ Respuesta exitosa
    res.json({ success: true });

  } catch (err) {
    // ❌ Error inesperado
    console.error('❌ Error al cancelar cita:', err);
    res.status(500).send('Error interno.');
  }
});




// —————————————————————————————————————————————————————————————
// 🗂️ Ruta para archivar o desarchivar una cancelación de cita
// Endpoint: PUT /api/customer-cancellation-archive
// Objetivo: Alternar el estado `archived` de una cancelación específica
// —————————————————————————————————————————————————————————————
app.put('/api/customer-cancellation-archive', isAuthenticated, async (req, res) => {
  try {
    const { date } = req.body; // 📅 Fecha exacta de la cancelación que se desea archivar/desarchivar

    // 🚫 Validación: Si no viene fecha, rechazar
    if (!date) return res.status(400).send('Fecha requerida.');

    const custId = new ObjectId(req.session.userId); // 🧑‍💼 ID del cliente autenticado
    const dt     = new Date(date);                   // 🗓️ Parsear la fecha

    // 🔍 Obtener el perfil del cliente completo
    const customer = await Customer.findById(custId).lean();
    if (!customer) return res.status(404).send('Usuario no encontrado.');

    // 🔎 Buscar índice de la cancelación por coincidencia exacta de fecha
    const idx = customer.cancellations.findIndex(c =>
      new Date(c.date).getTime() === dt.getTime()
    );

    // ❌ Si no se encuentra la cancelación, rechazar
    if (idx < 0) return res.status(404).send('Cancelación no encontrada.');

    // 🔁 Alternar estado actual (si está archivada, desarchivar y viceversa)
    const current = customer.cancellations[idx].archived;

    await Customer.updateOne(
      { _id: custId },
      { $set: { [`cancellations.${idx}.archived`]: !current } }
    );

    // ✅ Respuesta exitosa
    res.json({ success: true });

  } catch (err) {
    // ❌ Manejo de errores inesperados
    console.error(err);
    res.status(500).send('Error interno.');
  }
});



// —————————————————————————————————————————————————————————————
// 🔄 Escuchar cambios en la colección de Schedules (Change Stream)
// Objetivo: Notificar automáticamente al cliente por chat cuando 
// su cita sea marcada como "confirmada" (confirmed: true)
// —————————————————————————————————————————————————————————————
mongoose.connection.once('open', () => { // ✅ Cuando se abre la conexión con MongoDB
  try {
    const cs = Schedule.watch(); // 👀 Activar Change Stream en la colección "Schedule"

    // —————————————————————————————————————————————————————————————
    // 📡 Escuchar cambios en tiempo real
    // —————————————————————————————————————————————————————————————
    cs.on('change', async change => {
      // 🧪 Solo actuar si el cambio fue una actualización que incluye "confirmed"
      if (
        change.operationType === 'update' &&
        change.updateDescription.updatedFields.confirmed
      ) {
        // 🔍 Obtener la cita actualizada desde MongoDB
        const s = await Schedule.findById(change.documentKey._id).lean();

        // ✉️ Armar mensaje de confirmación para el cliente
        const msg = `✅ Tu cita con ${s.vehicles.length} vehículo(s) el ${s.date} a las ${s.time} ha sido confirmada.`;

        // 💬 Insertar el mensaje en la conversación del cliente (o crearla si no existe)
        const conv = await Conversation.findOneAndUpdate(
          { userId: s.userId }, // Buscar conversación por ID de usuario
          {
            $push: {
              messages: {
                sender: 'office',
                text: msg,
                imageUrl: '' // No hay imagen en este mensaje automático
              }
            }
          },
          { new: true, upsert: true } // Crear si no existe, devolver la nueva versión
        ).lean();

        // 📤 Emitir evento por WebSocket para actualizar la UI en tiempo real
        io.emit('conversation_update', conv);
      }
    });

    // —————————————————————————————————————————————————————————————
    // ⚠️ Si ocurre un error en el stream, cerrarlo para evitar fugas
    // —————————————————————————————————————————————————————————————
    cs.on('error', () => cs.close());

  } catch {} // 🧯 Ignorar errores de inicialización silenciosamente
});








// ————————————————————————————————————————————————————————
// 🤖 Obtener todas las respuestas automáticas del bot
// ————————————————————————————————————————————————————————
app.get('/api/bot/replies', async (req, res) => {
  // 🔍 1. Buscar todos los documentos en la colección BotReply
  const list = await BotReply.find({}).lean();  // .lean() devuelve objetos planos (más rápido)

  // 📤 2. Enviar al cliente la lista completa de respuestas
  res.json(list);
});


// ————————————————————————————————————————————————————————
// 🤖 Crear una nueva respuesta automática o actualizar una existente
// ————————————————————————————————————————————————————————
app.post('/api/bot/replies', async (req, res) => {
  // 📥 1. Extraer los datos enviados desde el cliente
  const { question, answer, type } = req.body;

  // ⚠️ 2. Validar que los tres campos estén presentes (obligatorios)
  if (!question || !answer || !type) {
    return res.status(400).json({ error: 'Falta question, answer o type' });
  }

  // 🧹 3. Limpiar la pregunta: quitar espacios y pasar a minúsculas
  const q = question.trim().toLowerCase();

  // 🧩 4. Preparar el objeto que será guardado o actualizado
  const existing = {
    question: q,  // Pregunta normalizada (clave única)
    answer,       // Respuesta que el bot enviará
    type          // Tipo de coincidencia ('exact' o 'contains', etc.)
  };

  // 🔁 5. Si ya existe una pregunta igual, se actualiza; si no, se inserta
  const result = await BotReply.findOneAndUpdate(
    { question: q },        // Búsqueda por pregunta (ya normalizada)
    existing,               // Datos nuevos o actualizados
    { upsert: true, new: true } // upsert = crea si no existe, new = devuelve el nuevo doc
  );

  // 📤 6. Devolver al cliente el resultado con éxito y los datos nuevos
  res.json({ success: true, data: result });
});



// ————————————————————————————————————————————————————————
// 🔁 Actualizar el kilometraje (milage) de un vehículo específico
// El cliente puede modificar solo sus propios vehículos
// ————————————————————————————————————————————————————————
app.put('/api/vehicles/:id/milage', isAuthenticated, async (req, res) => {
  try {
    // 🆔 1. Extraer ID del vehículo desde los parámetros de la ruta
    const { id } = req.params;

    // 📍 2. Extraer el nuevo kilometraje desde el cuerpo de la solicitud
    const { milage } = req.body;

    // 🔐 3. Validar que el ID del vehículo tenga un formato correcto (ObjectId o string)
    if (!ObjectId.isValid(id) && typeof id !== 'string') {
      return res.status(400).json({ error: 'ID de vehículo inválido' });
    }

    // 🧮 4. Validar que el nuevo kilometraje sea un número válido y positivo
    if (typeof milage !== 'number' || isNaN(milage) || milage < 0) {
      return res.status(400).json({ error: 'Kilometraje inválido' });
    }

    // 📋 5. Registrar en consola los datos del intento de actualización (debug)
    console.log('🔧 Actualizando kilometraje', {
      user: req.session.userId,
      vehicleId: id,
      milage
    });

    // 🔄 6. Buscar el usuario autenticado y aplicar el update sobre el vehículo deseado
    const result = await Customer.updateOne(
      {
        _id: req.session.userId,  // Solo afecta al usuario autenticado
        $or: [
          { 'vehicles._id': new ObjectId(id) },  // ID como ObjectId (normal)
          { 'vehicles._id': id }                // fallback si está como string
        ]
      },
      {
        $set: { 'vehicles.$.milage': milage }  // Positional operator $ para apuntar al vehículo correcto
      }
    );

    // ⚠️ 7. Validar si el update fue exitoso (si no se encontró el vehículo o no pertenece al usuario)
    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: 'Vehículo no encontrado o no autorizado' });
    }

    // ✅ 8. Todo bien, se responde con éxito
    res.json({ success: true });

  } catch (err) {
    // 💥 9. Manejo de errores inesperados
    console.error('❌ Error al actualizar kilometraje:', err);
    res.status(500).json({ error: 'Error interno al actualizar kilometraje' });
  }
});


// ——————————————————————————————————————————————————————————————
// 🚫 Cancelar un vehículo específico dentro de una cita (schedule)
// Se marca como `cancelled: true` dentro del arreglo `vehicles` de la cita
// ——————————————————————————————————————————————————————————————
app.put('/api/schedule/:scheduleId/cancel-vehicle/:vehicleId', isAuthenticated, async (req, res) => {
  try {
    // 🧾 1. Extraer los parámetros de la URL
    const { scheduleId, vehicleId } = req.params;

    // 🔍 2. Validar que ambos IDs tengan formato ObjectId válido
    if (!ObjectId.isValid(scheduleId) || !ObjectId.isValid(vehicleId)) {
      return res.status(400).json({ error: 'IDs inválidos' });  // 🚫 No se puede continuar si alguno es inválido
    }

    // 📄 3. Buscar el documento de la cita en la base de datos
    const schedule = await Schedule.findById(scheduleId);
    if (!schedule) {
      return res.status(404).json({ error: 'Cita no encontrada' });  // 🚫 ID de cita no existe
    }

    // 🔐 4. Verificar que el usuario actual sea el dueño de la cita
    if (String(schedule.userId) !== String(req.session.userId)) {
      return res.status(403).json({ error: 'No autorizado' });  // 🚫 No puede editar citas de otros usuarios
    }

    // 🔍 5. Buscar el vehículo dentro del array `vehicles` de la cita
    const veh = schedule.vehicles.find(v => String(v.vehicleId) === vehicleId);
    if (!veh) {
      return res.status(404).json({ error: 'Vehículo no encontrado en la cita' });  // 🚫 ID válido pero no está en esta cita
    }

    // 🚫 6. Verificar si ese vehículo ya fue cancelado previamente
    if (veh.cancelled) {
      return res.status(400).json({ error: 'Ya cancelado' });  // 🚫 Nada que hacer si ya estaba cancelado
    }

    // ✅ 7. Actualizar la cita: marcar ese vehículo como cancelado
    await Schedule.updateOne(
      {
        _id: scheduleId,                          // Cita específica
        'vehicles.vehicleId': new ObjectId(vehicleId)  // Subdocumento dentro del array de vehículos
      },
      {
        $set: { 'vehicles.$.cancelled': true }    // Usamos $ positional operator para encontrar el vehículo correcto
      }
    );

    // ✅ 8. Todo bien, responder con éxito
    res.json({ success: true });

  } catch (err) {
    // 💥 9. Error inesperado, log y respuesta genérica
    console.error('❌ Error cancelando vehículo individual:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});


// ——————————————————————————————————————————————————————————————
// 🛻 Endpoint para añadir un nuevo vehículo al perfil del cliente
// Ruta protegida con autenticación de sesión (`isAuthenticated`)
// También usa `multer` con Cloudinary para subir imágenes del VIN y del vehículo
// ——————————————————————————————————————————————————————————————
app.post('/api/vehicles', isAuthenticated, upload.fields([
  { name: 'vehicleImage', maxCount: 1 },  // Campo de imagen del vehículo (máx 1)
  { name: 'vinImage',     maxCount: 1 }   // Campo de imagen del VIN del vehículo (máx 1)
]), async (req, res) => {
  try {
    // 🧾 1. Extraer campos enviados por el cliente desde req.body
    const {
      brand, year, model, engine, color,
      plateLast3, vin, serviceIntervals
    } = req.body;

    // 🔢 2. Validar y convertir el campo `serviceIntervals` a un array de números
    const intervals = Array.isArray(serviceIntervals)
      ? serviceIntervals.map(Number)                         // si ya es array, convertir cada valor a Number
      : [Number(serviceIntervals || 0)];                     // si es string o null, envolver en array

    // 🖼️ 3. Obtener las URLs de las imágenes subidas desde Cloudinary (Multer ya las subió)
    const files = req.files || {};
    const vehicleImage = files.vehicleImage?.[0]?.path || '';  // path Cloudinary de imagen del vehículo
    const vinImage     = files.vinImage?.[0]?.path || '';      // path Cloudinary de imagen del VIN

    // 🚗 4. Construir el objeto del nuevo vehículo con todos los campos esperados
    const newVehicle = {
      brand: brand || '',
      year: Number(year) || 0,
      model: model || '',
      engine: engine || '',
      color: color || '',
      plateLast3: plateLast3 || '',
      vin: vin || '',
      vehicleImageUrl: vehicleImage,
      vinImageUrl: vinImage,
      serviceIntervals: intervals,          // array completo de intervalos definidos
      interval: intervals[0] || 0,          // intervalo actual (puede actualizarse luego)
      baseInterval: intervals[0] || 0,      // intervalo base (referencia inicial)
      milage: 0                             // nuevo vehículo comienza con kilometraje 0
    };

    // 📥 5. Insertar el vehículo dentro del arreglo `vehicles` del cliente logueado
    const result = await Customer.updateOne(
      { _id: req.session.userId },          // buscar por ID del usuario logueado (desde sesión)
      { $push: { vehicles: newVehicle } }   // push al array de vehículos
    );

    // 🚫 6. Verificar si realmente se modificó el documento
    if (result.modifiedCount === 0) {
      return res.status(400).json({ error: 'No se pudo agregar el vehículo' });
    }

    // 📡 7. Enviar notificación a microservicio (en otro puerto, por ejemplo: backend de chat o monitoreo)
    await fetch('http://localhost:5003/notify-vehicle-added', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: req.session.userId,  // ID del cliente
        brand,                       // marca del vehículo
        model,                       // modelo
        plateLast3                   // últimos 3 dígitos de la placa
      })
    }).catch(err => {
      // ⚠️ 8. Si falla, solo loguea el warning (no detiene el flujo)
      console.warn('⚠️ No se pudo notificar a AddVehicleMessage.js:', err.message);
    });

    // ✅ 9. Todo salió bien, responder al frontend
    res.json({ success: true });

  } catch (err) {
    // 💥 10. Error inesperado (catch global)
    console.error('❌ Error al agregar vehículo:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});



// ——— Emitir la lista de chats activos a los sockets conectados ———
io.on('connection', async socket => {
  const list = await Conversation.find({ archived:false })
    .populate('userId','fullName email').lean();
  socket.emit('conversation_list', list);
});


// ——— Iniciar el servidor HTTP ———
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor iniciado en puerto ${PORT}`));
