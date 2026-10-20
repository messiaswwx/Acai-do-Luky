import React, { useMemo } from 'react';
import type { CartItem } from '../types';
import { formatCurrency } from '../utils/format';
import { X, Trash2, Plus, Minus, ShoppingBag, ArrowRight } from 'lucide-react';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQuantity: (itemId: string, delta: number) => void;
  onRemoveItem: (itemId: string) => void;
  onProceedToCheckout: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  items,
  onUpdateQuantity,
  onRemoveItem,
  onProceedToCheckout
}) => {
  if (!isOpen) return null;

  const subtotal = useMemo(
    () => items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0),
    [items]
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex justify-end">
      <div className="bg-white w-full max-w-md h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-purple-950 text-white">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-purple-300" />
            <h2 className="font-bold text-lg">Minha Sacola</h2>
            <span className="bg-purple-800 text-purple-200 text-xs px-2 py-0.5 rounded-full font-bold">
              {items.reduce((acc, i) => acc + i.quantity, 0)} {items.length === 1 ? 'item' : 'itens'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-purple-200 hover:text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <ShoppingBag className="w-16 h-16 stroke-1 mb-3 text-slate-300" />
              <p className="font-bold text-slate-600 text-base">Sua sacola está vazia</p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                Escolha o tamanho perfeito de açaí e monte do seu jeito!
              </p>
            </div>
          ) : (
            items.map(item => (
              <div
                key={item.id}
                className="p-3.5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-2 hover:border-purple-200 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-black text-slate-900 text-sm">{item.size.name}</h3>
                    <p className="text-xs font-semibold text-purple-700">{item.base.name}</p>
                  </div>
                  <div className="text-right font-black text-slate-900 text-sm">
                    {formatCurrency(item.unitPrice * item.quantity)}
                  </div>
                </div>

                {/* Toppings Details */}
                <div className="text-xs text-slate-600 space-y-0.5 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  {item.freeToppings.length > 0 && (
                    <p>
                      <span className="font-bold text-slate-700">Acompanhamentos:</span>{' '}
                      {item.freeToppings.map(t => t.name).join(', ')}
                    </p>
                  )}
                  {item.premiumToppings.length > 0 && (
                    <p>
                      <span className="font-bold text-amber-700">Adicionais:</span>{' '}
                      {item.premiumToppings
                        .map(p => `${p.quantity > 1 ? `${p.quantity}x ` : ''}${p.item.name}`)
                        .join(', ')}
                    </p>
                  )}
                  {item.syrups.length > 0 && (
                    <p>
                      <span className="font-bold text-purple-700">Caldas:</span>{' '}
                      {item.syrups.map(s => s.name).join(', ')}
                    </p>
                  )}
                  {item.notes && (
                    <p className="italic text-slate-500 pt-0.5 border-t border-slate-200/60 mt-1">
                      "{item.notes}"
                    </p>
                  )}
                </div>

                {/* Controls */}
                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={() => onRemoveItem(item.id)}
                    className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 font-semibold transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remover
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onUpdateQuantity(item.id, -1)}
                      className="w-7 h-7 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 flex items-center justify-center text-slate-700"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-5 text-center font-bold text-slate-800 text-sm">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => onUpdateQuantity(item.id, 1)}
                      className="w-7 h-7 rounded-lg bg-purple-600 hover:bg-purple-700 flex items-center justify-center text-white"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-3">
            <div className="flex items-center justify-between text-base">
              <span className="text-slate-600 font-medium">Subtotal dos produtos</span>
              <span className="font-black text-slate-900 text-lg">{formatCurrency(subtotal)}</span>
            </div>
            <p className="text-[11px] text-slate-400">
              * A taxa de entrega será calculada na próxima etapa.
            </p>

            <button
              onClick={onProceedToCheckout}
              className="w-full bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 text-white font-bold py-3.5 px-5 rounded-2xl shadow-lg shadow-purple-900/20 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Avançar para o Pagamento</span>
              <ArrowRight className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
