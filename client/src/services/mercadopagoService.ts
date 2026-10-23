import type { Order } from '../types';

// Credenciais oficiais fornecidas do Mercado Pago
export const MP_PUBLIC_KEY = 
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_MP_PUBLIC_KEY) || 
  'APP_USR-c062df6b-9d26-44b3-aa96-3595444a6ef7';

export const MP_ACCESS_TOKEN = 
  (typeof import.meta !== 'undefined' && (import.meta.env?.VITE_MP_ACCESS_TOKEN || import.meta.env?.MP_ACCESS_TOKEN)) || 
  'APP_USR-1227904041115821-102318-00a4c8bbdc1c3c078bb5c9d39b4069e0-2466476881';

export interface PreferenceResult {
  preferenceId: string;
  initPoint: string;
  sandboxInitPoint?: string;
}

export interface PaymentStatusResult {
  isPaid: boolean;
  status: string;
  statusDetail?: string;
  paymentId?: string | number;
  paymentMethodId?: string;
  dateApproved?: string;
  amount?: number;
}

/**
 * Cria a Preferência de Checkout Pro no Mercado Pago.
 * Tenta primeiro via endpoint seguro de backend; caso indisponível,
 * executa a chamada REST oficial diretamente via API do Mercado Pago.
 */
export async function createMercadoPagoPreference(
  order: Order, 
  customOrigin?: string
): Promise<PreferenceResult> {
  const origin = customOrigin || (typeof window !== 'undefined' ? window.location.origin : 'https://acai-do-luky.vercel.app');
  
  // 1. Tenta criar através do backend (se estiver ativo)
  try {
    const res = await fetch('/api/mercadopago/create-preference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order, origin })
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.initPoint && data?.preferenceId) {
        return {
          preferenceId: data.preferenceId,
          initPoint: data.initPoint,
          sandboxInitPoint: data.sandboxInitPoint
        };
      }
    }
  } catch {
    // Backend local indisponível, avança para fallback direto
  }

  // 2. Fallback: Chamada direta à API Oficial do Mercado Pago
  const items = (order.items || []).map(item => {
    const title = `${item.size?.name || 'Açaí'} (${item.base?.name || 'Tradicional'})`;
    const complements = [
      ...(item.freeToppings || []).map(t => t.name),
      ...(item.fruits || []).map(f => f.name),
      ...(item.syrups || []).map(s => s.name),
      ...(item.premiumToppings || []).map(p => `${p.quantity}x ${p.item?.name}`)
    ].filter(Boolean).join(', ');

    return {
      id: item.id || `item-${Math.random().toString(36).substring(2, 7)}`,
      title: title.substring(0, 120),
      description: complements ? complements.substring(0, 200) : 'Açaí artesanal montado com acompanhamentos',
      quantity: Number(item.quantity) || 1,
      currency_id: 'BRL',
      unit_price: Number(item.unitPrice) || 0
    };
  });

  // Se houver taxa de entrega, adiciona como item de frete
  if (order.deliveryFee && Number(order.deliveryFee) > 0) {
    items.push({
      id: 'delivery-fee',
      title: `Taxa de Entrega (${order.address?.neighborhood || 'Praia Grande'})`,
      description: 'Entrega rápida e refrigerada no endereço informado',
      quantity: 1,
      currency_id: 'BRL',
      unit_price: Number(order.deliveryFee)
    });
  }

  // Se os itens somados não baterem o total exato, consolida em item único para evitar divergência
  const calculatedTotal = items.reduce((acc, i) => acc + (i.unit_price * i.quantity), 0);
  const finalItems = Math.abs(calculatedTotal - order.total) < 0.05 ? items : [
    {
      id: order.id,
      title: `Pedido ${order.id} - Açaí do Luky`,
      description: `${order.items?.length || 1} item(ns) artesanais montados`,
      quantity: 1,
      currency_id: 'BRL',
      unit_price: Number(order.total)
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
      success: `${origin}/?mp_status=approved&order_id=${encodeURIComponent(order.id)}`,
      pending: `${origin}/?mp_status=pending&order_id=${encodeURIComponent(order.id)}`,
      failure: `${origin}/?mp_status=failure&order_id=${encodeURIComponent(order.id)}`
    },
    auto_return: 'approved',
    external_reference: order.id,
    statement_descriptor: 'ACAI DO LUKY',
    expires: false
  };

  const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(preferencePayload)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Erro na API Mercado Pago:', errorBody);
    throw new Error('Não foi possível gerar a tela de pagamento do Mercado Pago. Tente novamente.');
  }

  const data = await response.json();
  return {
    preferenceId: data.id,
    initPoint: data.init_point,
    sandboxInitPoint: data.sandbox_init_point
  };
}

/**
 * Consulta em tempo real o status de pagamento de um pedido no Mercado Pago
 * utilizando a API oficial de busca de pagamentos por external_reference.
 */
export async function checkOrderPaymentStatus(orderId: string): Promise<PaymentStatusResult> {
  if (!orderId) {
    return { isPaid: false, status: 'unknown' };
  }

  // 1. Tenta consultar via backend se disponível
  try {
    const res = await fetch(`/api/mercadopago/check-payment/${encodeURIComponent(orderId)}`);
    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch {
    // Fallback para API direta
  }

  // 2. Fallback direto para a API oficial do Mercado Pago
  try {
    const url = `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(orderId)}&sort=date_created&criteria=desc&limit=1`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      return { isPaid: false, status: 'error' };
    }

    const data = await response.json();
    const payment = data.results && data.results[0];

    if (!payment) {
      return { isPaid: false, status: 'not_found' };
    }

    const isPaid = payment.status === 'approved';
    return {
      isPaid,
      status: payment.status,
      statusDetail: payment.status_detail,
      paymentId: payment.id,
      paymentMethodId: payment.payment_method_id,
      dateApproved: payment.date_approved,
      amount: payment.transaction_amount
    };
  } catch (err) {
    console.warn('Erro ao consultar pagamento no Mercado Pago:', err);
    return { isPaid: false, status: 'error' };
  }
}
