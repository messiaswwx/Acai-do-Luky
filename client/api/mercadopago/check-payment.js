// Vercel Serverless Function: Consulta de Status do Pedido no Mercado Pago
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

async function syncApprovedPaymentToSupabase(orderId, paymentId) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !orderId) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/rpc_confirm_order_payment`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_order_id: orderId,
        p_payment_id: paymentId ? String(paymentId) : null
      })
    });
  } catch {
    // Best-effort sync
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const orderId = req.query.orderId || req.query.id;
  if (!orderId) {
    return res.status(400).json({ error: 'orderId ausente' });
  }

  try {
    // 1. Consulta pagamentos diretos pela external_reference (busca até 10 tentativas e prioriza 'approved')
    const url = `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(orderId)}&sort=date_created&criteria=desc&limit=10`;
    const mpRes = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!mpRes.ok) {
      return res.status(502).json({ isPaid: false, status: 'error' });
    }

    const data = await mpRes.json();
    const results = Array.isArray(data.results) ? data.results : [];
    let payment = results.find(p => p && p.status === 'approved') || results[0] || null;

    // 2. Fallback: consulta merchant_orders caso o pagamento esteja vinculado à ordem comercial
    if (!payment || payment.status !== 'approved') {
      try {
        const moUrl = `https://api.mercadopago.com/merchant_orders/search?external_reference=${encodeURIComponent(orderId)}`;
        const moRes = await fetch(moUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          }
        });
        if (moRes.ok) {
          const moData = await moRes.json();
          const elements = Array.isArray(moData.elements) ? moData.elements : [];
          for (const mo of elements) {
            const moPayments = Array.isArray(mo.payments) ? mo.payments : [];
            const approvedMoPayment = moPayments.find(p => p && p.status === 'approved');
            if (approvedMoPayment) {
              payment = {
                id: approvedMoPayment.id,
                status: 'approved',
                status_detail: approvedMoPayment.status_detail || 'accredited',
                payment_method_id: approvedMoPayment.payment_method_id || 'mercadopago',
                date_approved: approvedMoPayment.date_approved || approvedMoPayment.last_modified,
                transaction_amount: approvedMoPayment.transaction_amount || mo.total_amount
              };
              break;
            }
          }
        }
      } catch {
        // Ignora erro de fallback de merchant_orders
      }
    }

    if (!payment) {
      return res.status(200).json({ isPaid: false, status: 'not_found' });
    }

    const isPaid = payment.status === 'approved';
    if (isPaid) {
      await syncApprovedPaymentToSupabase(orderId, payment.id);
    }

    return res.status(200).json({
      isPaid,
      status: payment.status,
      statusDetail: payment.status_detail,
      paymentId: payment.id,
      paymentMethodId: payment.payment_method_id,
      dateApproved: payment.date_approved,
      amount: payment.transaction_amount
    });
  } catch (err) {
    console.error('Erro ao consultar pagamento MP:', err);
    return res.status(500).json({ isPaid: false, status: 'error' });
  }
}
