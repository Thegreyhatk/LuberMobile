// mailer.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: 'jorge.ramosdavid87@gmail.com',
    pass: 'mvbipegaznxvgael'  // contraseña de aplicación sin espacios
  }
});

/**
 * Envía un email de bienvenida al nuevo usuario.
 * @param {string} toEmail Email del destinatario.
 * @param {string} fullName Nombre completo del usuario.
 */
async function sendWelcomeEmail(toEmail, fullName) {
  const mailOptions = {
    from: '"Luber" <jorge.ramosdavid87@gmail.com>',
    to: toEmail,
    subject: '¡Gracias por unirte a Luber!',
    html: `
      <p>woooopa <strong>${fullName}</strong>,</p>
      <p>¡Gracias por crear tu cuenta en <strong>Luber</strong>!</p>
      <p>Ahora puedes gestionar tus vehículos y programar servicios de aceite desde nuestra plataforma.</p>
      <p>¡Bienvenido a la familia Luber!</p>
      <br>
      <p>Saludos,<br>El equipo de Luber</p>
    `
  };

  return transporter.sendMail(mailOptions);
}

module.exports = { sendWelcomeEmail };
