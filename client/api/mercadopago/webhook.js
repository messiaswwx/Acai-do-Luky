// Vercel Serverless Function: Webhook Oficial Mercado Pago
const MP_ACCESS_TOKEN =
  process.env.MP_ACCESS_TOKEN ||
  'APP_USR-1227904041115821-102318-00a4c8bbdc1c3c078bb5c9d39b4069e0-2466476881';

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  'https://efwgevkgqeoenfpretrg.supabase.co';

const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmd2dldmtncWVvZW5mcHJldHJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1NDA3NDIsImV4cCI6MjEwODExNjc0Mn0.sKHLJxnjctSwCZAwrOOZNrpfsum3NAxGbW3ek_luhC4';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const topic = req.query.topic || req.body?.type;
    const id = req.query.id || req.query?.['data.id'] || req.body?.data?.id;

    if (
      (topic === 'payment' ||
        req.body?.action === 'payment.created' ||
        req.body?.action === 'payment.updated') &&
      id
    ) {
      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` }
      });

      if (mpRes.ok) {
        const payment = await mpRes.json();
        const orderId = payment.external_reference;
        console.log(
          `[Webhook MP] Pagamento ${id} - Status: ${payment.status} - Pedido: ${orderId}`
        );

        if (orderId && payment.status === 'approved' && SUPABASE_URL && SUPABASE_ANON_KEY) {
          await fetch(`${SUPABASE_URL}/rest/v1/rpc/rpc_confirm_order_payment`, {
            method: 'POST',
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              p_order_id: orderId,
              p_payment_id: String(payment.id)
            })
          });
        }
      }
    }

    return res.status(200).send('OK');
  } catch (err) {
    console.warn('Erro no webhook MP:', err);
    return res.status(200).send('OK');
  }
}
