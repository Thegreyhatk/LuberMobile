require('dotenv').config();
const nodemailer = require('nodemailer');

(async () => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: process.env.EMAIL_USER, // te lo envías a vos mismo para verificar
    subject: '📧 Test de correo desde Luber',
    text: 'Este es un test directo del servidor Luber.'
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email enviado con éxito: ${info.messageId}`);
  } catch (err) {
    console.error(`❌ FALLO al enviar email: ${err.message}`);
  }
})();
