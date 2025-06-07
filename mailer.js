// mailer.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function sendWelcomeEmail(toEmail, fullName) {
  const mailOptions = {
    from: `"Luber" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: '¡Gracias por unirte a Luber!',
    html: `
      <p>¡Hola <strong>${fullName}</strong>!</p>
      <p>Gracias por crear tu cuenta en <strong>Luber</strong>. Ya puedes gestionar tus vehículos y programar servicios de aceite desde nuestra plataforma.</p>
      <p>¡Bienvenido a la familia!</p>
      <br>
      <p>Saludos,<br>El equipo de Luber</p>
    `
  };
  return transporter.sendMail(mailOptions);
}

module.exports = { sendWelcomeEmail };
