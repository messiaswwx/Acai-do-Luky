// Vercel Serverless Function: Webhook Oficial Mercado Pago
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || process.env.VITE_MP_ACCESS_TOKEN || 'APP_USR-1227904041115821-102318-00a4c8bbdc1c3c078bb5c9d39b4069e0-2466476881';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const topic = req.query.topic || req.body?.type;
    const id = req.query.id || req.body?.data?.id;

    if ((topic === 'payment' || req.body?.action === 'payment.created' || req.body?.action === 'payment.updated') && id) {
      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
        headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` }
      });

      if (mpRes.ok) {
        const payment = await mpRes.json();
        console.log(`[Webhook MP] Pagamento ${id} - Status: ${payment.status} - Pedido: ${payment.external_reference}`);
      }
    }

    return res.status(200).send('OK');
  } catch (err) {
    console.warn('Erro no webhook MP:', err);
    return res.status(200).send('OK');
  }
}
