// Vercel Serverless Function: Webhook Oficial Mercado Pago
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || '';

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  '';

const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  '';

async function fetchOfficialOrder(orderId) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !orderId) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/rpc_get_order`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_order_id: orderId })
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // fallback
  }
  return null;
}

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
          // Validação antifraude: confere se o valor pago é correspondente ao pedido
          let isAmountValid = true;
          if (payment.transaction_amount !== undefined) {
            const dbOrder = await fetchOfficialOrder(orderId);
            if (dbOrder && dbOrder.total !== undefined) {
              const expectedTotal = Number(dbOrder.total) || 0;
              const paidAmount = Number(payment.transaction_amount) || 0;
              if (paidAmount < expectedTotal - 0.10) {
                console.warn(`[Webhook MP] Fraude detectada para pedido ${orderId}: esperado R$ ${expectedTotal}, pago R$ ${paidAmount}`);
                isAmountValid = false;
              }
            }
          }

          if (isAmountValid) {
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
    }

    return res.status(200).send('OK');
  } catch (err) {
    console.warn('Erro no webhook MP:', err);
    return res.status(200).send('OK');
  }
}
