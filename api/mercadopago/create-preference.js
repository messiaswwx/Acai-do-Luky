// Vercel Serverless Function: Criação de Preferência de Pagamento Mercado Pago
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
      const data = await res.json();
      return data || null;
    }
  } catch {
    // fallback seguro
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { order, origin } = req.body || {};
    if (!order || !order.id) {
      return res.status(400).json({ error: 'Dados do pedido ausentes' });
    }

    // Busca o pedido oficial salvo no banco de dados para evitar manipulação de valores
    const dbOrder = await fetchOfficialOrder(order.id);
    const targetOrder = dbOrder || order;

    const baseOrigin = (origin || req.headers.origin || 'https://acai-do-luky.vercel.app').replace(/\/+$/, '');
    const webhookOrigin = baseOrigin.startsWith('https://')
      ? baseOrigin
      : 'https://acai-do-luky.vercel.app';

    const officialTotal = Number(targetOrder.total) || Number(order.total) || 0;
    const rawItems = Array.isArray(targetOrder.items) ? targetOrder.items : (Array.isArray(order.items) ? order.items : []);

    const items = rawItems.map(item => ({
      id: item.id || `item-${Math.random().toString(36).substring(2, 7)}`,
      title: `${item.size?.name || 'Açaí'} (${item.base?.name || 'Tradicional'})`.substring(0, 120),
      description: 'Açaí artesanal montado com acompanhamentos',
      quantity: Number(item.quantity) || 1,
      currency_id: 'BRL',
      unit_price: Number(item.unitPrice) || 0
    }));

    const deliveryFee = Number(targetOrder.delivery_fee ?? targetOrder.deliveryFee ?? 0);
    if (deliveryFee > 0) {
      items.push({
        id: 'delivery-fee',
        title: `Taxa de Entrega (${targetOrder.neighborhood || targetOrder.address?.neighborhood || 'Praia Grande'})`,
        description: 'Entrega refrigerada no endereço informado',
        quantity: 1,
        currency_id: 'BRL',
        unit_price: deliveryFee
      });
    }

    const calculatedSum = Number(items.reduce((acc, i) => acc + i.unit_price * i.quantity, 0).toFixed(2));
    const finalItems = (items.length > 0 && Math.abs(calculatedSum - officialTotal) < 0.05)
      ? items
      : [
          {
            id: targetOrder.id || order.id,
            title: `Pedido ${targetOrder.id || order.id} - Açaí do Luky`,
            description: 'Açaí artesanal montado com acompanhamentos',
            quantity: 1,
            currency_id: 'BRL',
            unit_price: officialTotal
          }
        ];

    const customerPhone = String(targetOrder.customer_phone || targetOrder.customerPhone || order.customerPhone || '').replace(/\D/g, '');
    const customerName = String(targetOrder.customer_name || targetOrder.customerName || order.customerName || 'Cliente Açaí do Luky');
    const areaCode = customerPhone.length >= 10 ? customerPhone.substring(0, 2) : '13';
    const phoneNumber = customerPhone.length >= 10 ? customerPhone.substring(2) : customerPhone;

    const preferencePayload = {
      items: finalItems,
      payer: {
        name: customerName,
        phone: {
          area_code: areaCode,
          number: phoneNumber
        }
      },
      back_urls: {
        success: `${baseOrigin}/?mp_status=approved&order_id=${encodeURIComponent(targetOrder.id || order.id)}`,
        pending: `${baseOrigin}/?mp_status=pending&order_id=${encodeURIComponent(targetOrder.id || order.id)}`,
        failure: `${baseOrigin}/?mp_status=failure&order_id=${encodeURIComponent(targetOrder.id || order.id)}`
      },
      auto_return: 'approved',
      notification_url: `${webhookOrigin}/api/mercadopago/webhook`,
      external_reference: targetOrder.id || order.id,
      statement_descriptor: 'ACAI DO LUKY',
      expires: false
    };

    const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(preferencePayload)
    });

    if (!mpRes.ok) {
      const errText = await mpRes.text();
      console.error('Erro Mercado Pago API:', errText);
      return res.status(502).json({ error: 'Erro ao gerar preferência no Mercado Pago' });
    }

    const mpData = await mpRes.json();
    return res.status(200).json({
      preferenceId: mpData.id,
      initPoint: mpData.init_point,
      sandboxInitPoint: mpData.sandbox_init_point
    });
  } catch (err) {
    console.error('Exceção ao criar preferência:', err);
    return res.status(500).json({ error: 'Erro interno ao processar Mercado Pago' });
  }
}
