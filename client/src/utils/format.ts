import type { Order } from '../types';

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
}

export function formatDateTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
}

export function generateWhatsAppMessage(order: Order, _storePhone?: string): string {
  const lines: string[] = [];

  lines.push(`💜 *PEDIDO ${order.id} - AÇAÍ DO KAYKY* 💜`);
  lines.push(`📅 *Horário:* ${formatDateTime(order.createdAt)}`);
  lines.push(`👤 *Cliente:* ${order.customerName}`);
  lines.push(`📱 *Telefone:* ${order.customerPhone}`);
  lines.push(``);
  lines.push(`📍 *Tipo:* ${order.orderType === 'ENTREGA' ? '🛵 Entrega' : '🏪 Retirada no Local'}`);
  
  if (order.orderType === 'ENTREGA' && order.address) {
    lines.push(`🏠 *Endereço:* ${order.address.street}, nº ${order.address.number}`);
    lines.push(`🏘️ *Bairro:* ${order.address.neighborhood}`);
    if (order.address.complement) lines.push(`ℹ️ *Compl:* ${order.address.complement}`);
    if (order.address.reference) lines.push(`🔍 *Ref:* ${order.address.reference}`);
  }
  
  lines.push(``);
  lines.push(`📋 *ITENS DO PEDIDO:*`);
  order.items.forEach(item => {
    lines.push(`---------------------------`);
    lines.push(`*${item.quantity}x ${item.size.name}* (${formatCurrency(item.unitPrice * item.quantity)})`);
    lines.push(`• *Base:* ${item.base.name}`);
    
    if (item.freeToppings.length > 0) {
      lines.push(`• *Acompanhamentos:* ${item.freeToppings.map(t => t.name).join(', ')}`);
    }
    
    if (item.premiumToppings.length > 0) {
      lines.push(`• *Adicionais:* ${item.premiumToppings.map(p => `${p.quantity > 1 ? `${p.quantity}x ` : ''}${p.item.name}`).join(', ')}`);
    }
    
    if (item.syrups.length > 0) {
      lines.push(`• *Caldas:* ${item.syrups.map(s => s.name).join(', ')}`);
    }
    
    if (item.notes) {
      lines.push(`• *Obs:* ${item.notes}`);
    }
  });

  lines.push(`---------------------------`);
  lines.push(`💵 *Subtotal:* ${formatCurrency(order.subtotal)}`);
  if (order.orderType === 'ENTREGA') {
    lines.push(`🛵 *Taxa de Entrega:* ${formatCurrency(order.deliveryFee)}`);
  }
  lines.push(`💰 *TOTAL:* *${formatCurrency(order.total)}*`);
  lines.push(``);
  
  let paymentText = '';
  if (order.paymentMethod === 'PIX') {
    paymentText = 'PIX (Chave enviada)';
  } else if (order.paymentMethod === 'CARTAO_ENTREGA') {
    paymentText = `Cartão na entrega (${order.paymentDetails?.cardType || 'Débito/Crédito'})`;
  } else {
    paymentText = order.paymentDetails?.needChange 
      ? `Dinheiro (Troco para ${formatCurrency(order.paymentDetails.changeFor || 0)})`
      : 'Dinheiro (Sem troco)';
  }
  lines.push(`💳 *Forma de Pagamento:* ${paymentText}`);

  return encodeURIComponent(lines.join('\n'));
}
