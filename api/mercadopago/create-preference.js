// Vercel Serverless Function: Criação de Preferência de Pagamento Mercado Pago
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || process.env.VITE_MP_ACCESS_TOKEN || 'APP_USR-1227904041115821-102318-00a4c8bbdc1c3c078bb5c9d39b4069e0-2466476881';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

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

    const baseOrigin = origin || req.headers.origin || 'https://acai-do-luky.vercel.app';
    const total = Number(order.total) || 0;

    const items = (Array.isArray(order.items) ? order.items : []).map(item => ({
      id: item.id || `item-${Math.random().toString(36).substring(2, 7)}`,
      title: `${item.size?.name || 'Açaí'} (${item.base?.name || 'Tradicional'})`.substring(0, 120),
      description: 'Açaí artesanal montado com acompanhamentos',
      quantity: Number(item.quantity) || 1,
      currency_id: 'BRL',
      unit_price: Number(item.unitPrice) || 0
    }));

    if (order.deliveryFee && Number(order.deliveryFee) > 0) {
      items.push({
        id: 'delivery-fee',
        title: `Taxa de Entrega (${order.address?.neighborhood || 'Praia Grande'})`,
        description: 'Entrega rápida no endereço informado',
        quantity: 1,
        currency_id: 'BRL',
        unit_price: Number(order.deliveryFee)
      });
    }

    const calculatedTotal = items.reduce((acc, i) => acc + (i.unit_price * i.quantity), 0);
    const finalItems = Math.abs(calculatedTotal - total) < 0.05 ? items : [
      {
        id: order.id,
        title: `Pedido ${order.id} - Açaí do Luky`,
        description: 'Açaí artesanal montado com acompanhamentos',
        quantity: 1,
        currency_id: 'BRL',
        unit_price: total
      }
    ];

    const cleanPhone = (order.customerPhone || '').replace(/\D/g, '');
    const areaCode = cleanPhone.length >= 10 ? cleanPhone.substring(0, 2) : '13';
    const phoneNumber = cleanPhone.length >= 10 ? cleanPhone.substring(2) : cleanPhone;

    const preferencePayload = {
      items: finalItems,
      payer: {
        name: order.customerName || 'Cliente Açaí do Luky',
        phone: {
          area_code: areaCode,
          number: phoneNumber
        }
      },
      back_urls: {
        success: `${baseOrigin}/?mp_status=approved&order_id=${encodeURIComponent(order.id)}`,
        pending: `${baseOrigin}/?mp_status=pending&order_id=${encodeURIComponent(order.id)}`,
        failure: `${baseOrigin}/?mp_status=failure&order_id=${encodeURIComponent(order.id)}`
      },
      auto_return: 'approved',
      external_reference: order.id,
      statement_descriptor: 'ACAI DO LUKY',
      expires: false
    };

    const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
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
