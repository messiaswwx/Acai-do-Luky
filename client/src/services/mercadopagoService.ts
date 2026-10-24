import type { Order } from '../types';

// Chave pública oficial do Mercado Pago (segura para uso no frontend)
export const MP_PUBLIC_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_MP_PUBLIC_KEY) ||
  'APP_USR-c062df6b-9d26-44b3-aa96-3595444a6ef7';

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
 * Cria a Preferência de Checkout Pro no Mercado Pago através do backend / Serverless Function.
 * O Access Token privado permanece protegido exclusivamente no servidor.
 */
export async function createMercadoPagoPreference(
  order: Order,
  customOrigin?: string
): Promise<PreferenceResult> {
  const origin =
    customOrigin ||
    (typeof window !== 'undefined' ? window.location.origin : 'https://acai-do-luky.vercel.app');

  const res = await fetch('/api/mercadopago/create-preference', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order, origin })
  });

  if (!res.ok) {
    throw new Error('Não foi possível gerar a tela de pagamento do Mercado Pago. Tente novamente.');
  }

  const data = await res.json();
  if (!data?.initPoint || !data?.preferenceId) {
    throw new Error('Resposta inválida ao gerar link de pagamento do Mercado Pago.');
  }

  return {
    preferenceId: data.preferenceId,
    initPoint: data.initPoint,
    sandboxInitPoint: data.sandboxInitPoint
  };
}

/**
 * Consulta em tempo real o status de pagamento de um pedido no Mercado Pago
 * via endpoint seguro compatível tanto com Vercel Serverless quanto Express.
 */
export async function checkOrderPaymentStatus(orderId: string): Promise<PaymentStatusResult> {
  if (!orderId) {
    return { isPaid: false, status: 'unknown' };
  }

  try {
    const res = await fetch(
      `/api/mercadopago/check-payment?orderId=${encodeURIComponent(orderId)}`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' }
      }
    );

    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        return {
          isPaid: Boolean(data?.isPaid),
          status: data?.status || 'unknown',
          statusDetail: data?.statusDetail,
          paymentId: data?.paymentId,
          paymentMethodId: data?.paymentMethodId,
          dateApproved: data?.dateApproved,
          amount: data?.amount
        };
      }
    }
  } catch (err) {
    console.warn('Erro ao consultar status de pagamento:', err);
  }

  return { isPaid: false, status: 'error' };
}
