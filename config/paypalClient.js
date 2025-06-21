// config/paypalClient.js
const checkoutNodeJssdk = require('@paypal/checkout-server-sdk');

function environment() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Faltan las credenciales de PayPal en las variables de entorno.');
  }
  return new checkoutNodeJssdk.core.SandboxEnvironment(clientId, clientSecret);
  // Para producción, usa: new checkoutNodeJssdk.core.LiveEnvironment(...)
}

function client() {
  return new checkoutNodeJssdk.core.PayPalHttpClient(environment());
}

module.exports = { client };
