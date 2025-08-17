const nodemailer = require('nodemailer');

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !process.env.EMAIL_FROM) {
  console.error('❌ Faltan credenciales de email');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function sendCancellationEmail(to, date, time) {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to,
    subject: 'Cita cancelada por falta de pago',
    text: `Tu cita programada para el ${date} a las ${time} ha sido cancelada automáticamente por falta de pago.`
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Email enviado a ${to}`);
  } catch (err) {
    console.error(`❌ Error enviando email a ${to}:`, err.message);
  }
}

module.exports = { sendCancellationEmail };
