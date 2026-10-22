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

    lines.push(`💜 *PEDIDO ${order?.id || '---'} - AÇAÍ DO KAYKY* 💜`);
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
      const freeToppings = Array.isArray(item?.freeToppings) ? item.freeToppings : [];
      const premiumToppings = Array.isArray(item?.premiumToppings) ? item.premiumToppings : [];
      const syrups = Array.isArray(item?.syrups) ? item.syrups : [];

      lines.push(`---------------------------`);
      lines.push(`*${quantity}x ${sizeName}* (${formatCurrency(unitPrice * quantity)})`);
      lines.push(`• *Base:* ${baseName}`);
      
      if (freeToppings.length > 0) {
        lines.push(`• *Acompanhamentos:* ${freeToppings.map((t: any) => t?.name || t).filter(Boolean).join(', ')}`);
      }
      
      if (premiumToppings.length > 0) {
        lines.push(`• *Adicionais:* ${premiumToppings.map((p: any) => {
          const pName = p?.item?.name || p?.name || p;
          const pQty = p?.quantity > 1 ? `${p.quantity}x ` : '';
          return `${pQty}${pName}`;
        }).filter(Boolean).join(', ')}`);
      }
      
      if (syrups.length > 0) {
        lines.push(`• *Caldas:* ${syrups.map((s: any) => s?.name || s).filter(Boolean).join(', ')}`);
      }
      
      if (item?.notes) {
        lines.push(`• *Obs:* ${item.notes}`);
      }
    });

    lines.push(`---------------------------`);
    lines.push(`💵 *Subtotal:* ${formatCurrency(order?.subtotal || 0)}`);
    if (order?.orderType === 'ENTREGA') {
      lines.push(`🛵 *Taxa de Entrega:* ${formatCurrency(order?.deliveryFee || 0)}`);
    }
    lines.push(`💰 *TOTAL:* *${formatCurrency(order?.total || 0)}*`);
    lines.push(``);
    
    let paymentText = '';
    if (order?.paymentMethod === 'PIX') {
      paymentText = 'PIX (Chave enviada)';
    } else if (order?.paymentMethod === 'CARTAO_ENTREGA') {
      paymentText = `Cartão na entrega (${order?.paymentDetails?.cardType || 'Débito/Crédito'})`;
    } else {
      paymentText = order?.paymentDetails?.needChange 
        ? `Dinheiro (Troco para ${formatCurrency(order?.paymentDetails?.changeFor || 0)})`
        : 'Dinheiro (Sem troco)';
    }
    lines.push(`💳 *Forma de Pagamento:* ${paymentText}`);

    return encodeURIComponent(lines.join('\n'));
  } catch (err) {
    console.error('Erro ao gerar mensagem do WhatsApp:', err);
    return encodeURIComponent(`Olá! Gostaria de falar sobre o pedido ${order?.id || ''}`);
  }
}
