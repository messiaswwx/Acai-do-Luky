import type { Order } from '../types';

export function formatCurrency(value?: number | null): string {
  const num = typeof value === 'number' && !isNaN(value) ? value : 0;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(num);
}

export function formatDateTime(isoString?: string | null): string {
  try {
    if (!isoString) return '--:--';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '--:--';
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
}

export function generateWhatsAppMessage(order: Order, _storePhone?: string): string {
  try {
    const lines: string[] = [];

    lines.push(`💜 *PEDIDO ${order?.id || '---'} - AÇAÍ DO LUKY* 💜`);
    lines.push(`📅 *Horário:* ${formatDateTime(order?.createdAt)}`);
    lines.push(`👤 *Cliente:* ${order?.customerName || 'Cliente'}`);
    lines.push(`📱 *Telefone:* ${order?.customerPhone || ''}`);
    lines.push(``);
    lines.push(`📍 *Tipo:* ${order?.orderType === 'ENTREGA' ? '🛵 Entrega' : '🏪 Retirada no Local'}`);
    
    if (order?.orderType === 'ENTREGA' && order?.address) {
      lines.push(`🏠 *Endereço:* ${order.address.street || ''}, nº ${order.address.number || 'S/N'}`);
      if (order.address.neighborhood) lines.push(`🏘️ *Bairro:* ${order.address.neighborhood}`);
      if (order.address.complement) lines.push(`ℹ️ *Compl:* ${order.address.complement}`);
      if (order.address.reference) lines.push(`🔍 *Ref:* ${order.address.reference}`);
    }
    
    lines.push(``);
    lines.push(`📋 *ITENS DO PEDIDO:*`);
    const items = Array.isArray(order?.items) ? order.items : [];
    items.forEach(item => {
      const sizeName = item?.size?.name || (typeof item?.size === 'string' ? item.size : 'Açaí');
      const baseName = item?.base?.name || (typeof item?.base === 'string' ? item.base : 'Tradicional');
      const unitPrice = Number(item?.unitPrice) || 0;
      const quantity = Number(item?.quantity) || 1;
      const premiumToppings = Array.isArray(item?.premiumToppings) ? item.premiumToppings : [];
      const syrups = Array.isArray(item?.syrups) ? item.syrups : [];
      const rawFree = Array.isArray(item?.freeToppings) ? item.freeToppings : [];
      const complements = rawFree.filter((t: any) => !String(t?.id || '').startsWith('fruit-'));
      const fruits = (Array.isArray(item?.fruits) && item.fruits.length > 0)
        ? item.fruits
        : rawFree.filter((t: any) => String(t?.id || '').startsWith('fruit-'));

      lines.push(`---------------------------`);
      lines.push(`*${quantity}x ${sizeName}* (${formatCurrency(unitPrice * quantity)})`);
      lines.push(`• *Base:* ${baseName}`);
      
      if (syrups.length > 0) {
        lines.push(`• *Calda:* ${syrups.map((s: any) => s?.name || s).filter(Boolean).join(', ')}`);
      }

      if (complements.length > 0) {
        lines.push(`• *Complementos:* ${complements.map((t: any) => t?.name || t).filter(Boolean).join(', ')}`);
      }

      if (fruits.length > 0) {
        lines.push(`• *Frutas:* ${fruits.map((f: any) => f?.name || f).filter(Boolean).join(', ')}`);
      }
      
      if (premiumToppings.length > 0) {
        lines.push(`• *Adicionais:* ${premiumToppings.map((p: any) => {
          const pName = p?.item?.name || p?.name || p;
          const pQty = p?.quantity > 1 ? `${p.quantity}x ` : '';
          return `${pQty}${pName}`;
        }).filter(Boolean).join(', ')}`);
      }
      
      lines.push(`• *Colher:* ${item?.needSpoon === false ? '🍃 Sem colher' : '🥄 Com colher'}`);
      
      const cleanItemNotes = (item?.notes || '').replace(/\[Frutas:[^\]]*\]\s*-?\s*/gi, '').trim();
      if (cleanItemNotes) {
        lines.push(`• *Obs:* ${cleanItemNotes}`);
      }
    });

    lines.push(`---------------------------`);
    lines.push(`🥄 *Colheres Descartáveis:* ${order?.needCutlery === false ? '🍃 Sem colher' : '🥄 Com colher'}`);
    lines.push(`💵 *Subtotal:* ${formatCurrency(order?.subtotal || 0)}`);
    if (order?.orderType === 'ENTREGA') {
      lines.push(`🛵 *Taxa de Entrega:* ${formatCurrency(order?.deliveryFee || 0)}`);
    }
    lines.push(`💰 *TOTAL:* *${formatCurrency(order?.total || 0)}*`);
    lines.push(``);
    
    let paymentText = '';
    if (
      order?.paymentDetails?.gateway === 'MERCADO_PAGO' ||
      order?.paymentMethod === 'MERCADO_PAGO' ||
      order?.paymentMethod === 'CARTAO_ONLINE'
    ) {
      paymentText = `💳 Mercado Pago Oficial${order?.paymentDetails?.isPaid ? ' (PAGO ✓)' : ' (Aguardando confirmação)'}`;
    } else if (order?.paymentMethod === 'PIX') {
      paymentText = `⚡ Pix Direto (Chave da Loja)${order?.paymentDetails?.isPaid ? ' (PAGO ✓)' : ''}`;
    } else if (order?.paymentMethod === 'CARTAO_ENTREGA') {
      paymentText = `Cartão (${order?.paymentDetails?.cardType || 'Débito/Crédito'})`;
    } else {
      paymentText = 'Dinheiro';
    }
    lines.push(`💳 *Forma de Pagamento:* ${paymentText}`);

    return encodeURIComponent(lines.join('\n'));
  } catch (err) {
    console.error('Erro ao gerar mensagem do WhatsApp:', err);
    return encodeURIComponent(`Olá! Gostaria de falar sobre o pedido ${order?.id || ''}`);
  }
}
