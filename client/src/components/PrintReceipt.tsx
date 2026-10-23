import React from 'react';
import type { Order, StoreSettings } from '../types';
import { formatCurrency, formatDateTime } from '../utils/format';
import { Printer, X } from 'lucide-react';

interface PrintReceiptProps {
  order: Order;
  settings: StoreSettings;
  onClose: () => void;
}

export const PrintReceipt: React.FC<PrintReceiptProps> = ({ order, settings, onClose }) => {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Actions bar (hidden in print) */}
        <div className="p-3 bg-slate-900 text-white flex items-center justify-between print:hidden">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Visualizar Impressão</span>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Ticket Area */}
        <div className="p-6 overflow-y-auto font-mono text-xs text-black leading-tight space-y-3 bg-white">
          <div className="text-center space-y-1 border-b border-dashed border-black pb-3">
            <img src="/logo.png" alt="Logo" className="w-14 h-14 rounded-full mx-auto mb-2 object-contain" />
            <h1 className="font-bold text-base uppercase">{settings.storeName}</h1>
            <p className="text-[10px]">DELIVERY & BALCÃO</p>
            <p className="text-[10px]">WhatsApp: {settings.whatsapp}</p>
          </div>

          <div className="border-b border-dashed border-black pb-2 space-y-1">
            <div className="flex justify-between font-bold text-sm">
              <span>{order.id}</span>
              <span>{formatDateTime(order.createdAt)}</span>
            </div>
            <p>
              <span className="font-bold">CLIENTE:</span> {order.customerName}
            </p>
            <p>
              <span className="font-bold">TEL:</span> {order.customerPhone}
            </p>
            <p>
              <span className="font-bold">TIPO:</span>{' '}
              {order.orderType === 'ENTREGA' ? '--- ENTREGA ---' : '--- RETIRADA BALCÃO ---'}
            </p>
            {order.orderType === 'ENTREGA' && order.address && (
              <div className="pt-1">
                <p className="font-bold">ENDEREÇO:</p>
                <p>
                  {order.address.street}, {order.address.number}
                </p>
                <p>Bairro: {order.address.neighborhood}</p>
                {order.address.complement && <p>Compl: {order.address.complement}</p>}
                {order.address.reference && <p>Ref: {order.address.reference}</p>}
              </div>
            )}
          </div>

          {/* Items */}
          <div className="border-b border-dashed border-black pb-3 space-y-2">
            <p className="font-bold text-center">ITENS DO PEDIDO</p>
            {order.items.map((item, i) => (
              <div key={i} className="space-y-0.5">
                <div className="flex justify-between font-bold">
                  <span>{item.quantity}X {item.size.name}</span>
                  <span>{formatCurrency(item.unitPrice * item.quantity)}</span>
                </div>
                <p>• Base: {item.base.name}</p>
                {item.syrups.length > 0 && (
                  <p>• Calda: {item.syrups.map(s => s.name).join(', ')}</p>
                )}
                {item.freeToppings.length > 0 && (
                  <p>• Comp: {item.freeToppings.filter(t => !t.id?.startsWith('fruit-')).map(t => t.name).join(', ')}</p>
                )}
                {((item.fruits && item.fruits.length > 0) || (item.freeToppings && item.freeToppings.some(t => t.id?.startsWith('fruit-')))) && (
                  <p>• Frutas: {((item.fruits && item.fruits.length > 0) ? item.fruits : item.freeToppings.filter(t => t.id?.startsWith('fruit-'))).map(f => f.name).join(', ')}</p>
                )}
                {item.premiumToppings.length > 0 && (
                  <p>• Extras: {item.premiumToppings.map(p => `${p.quantity > 1 ? `${p.quantity}x ` : ''}${p.item.name}`).join(', ')}</p>
                )}
                {item.notes && <p className="font-bold italic">Obs: {item.notes}</p>}
              </div>
            ))}
          </div>

          {/* Totals & Payment */}
          <div className="space-y-1 border-b border-dashed border-black pb-3">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>{formatCurrency(order.subtotal)}</span>
            </div>
            {order.orderType === 'ENTREGA' && (
              <div className="flex justify-between">
                <span>Taxa Entrega:</span>
                <span>{formatCurrency(order.deliveryFee)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-sm pt-1">
              <span>TOTAL:</span>
              <span>{formatCurrency(order.total)}</span>
            </div>
          </div>

          <div className="pt-1 space-y-1">
            <p>
              <span className="font-bold">PAGAMENTO:</span>{' '}
              {order.paymentMethod === 'PIX'
                ? 'PIX'
                : order.paymentMethod === 'CARTAO_ENTREGA'
                ? `CARTÃO (${order.paymentDetails?.cardType || 'MÁQUINA'})`
                : order.paymentDetails?.needChange
                ? `DINHEIRO (Troco p/ ${formatCurrency(order.paymentDetails.changeFor || 0)})`
                : 'DINHEIRO (Sem Troco)'}
            </p>
          </div>

          <div className="text-center pt-3 text-[10px] space-y-0.5">
            <p>*** Obrigado pela preferência! ***</p>
            <p>Feito artesanalmente com carinho 💜</p>
          </div>
        </div>
      </div>
    </div>
  );
};
