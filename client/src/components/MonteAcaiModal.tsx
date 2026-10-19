import React, { useState } from 'react';
import type { SizeItem, BaseItem, FreeToppingItem, PremiumToppingItem, SyrupItem, CartItem, MenuData } from '../types';
import { formatCurrency } from '../utils/format';
import { X, Check, Plus, Minus, Sparkles } from 'lucide-react';

interface MonteAcaiModalProps {
  size: SizeItem;
  menu: MenuData;
  onClose: () => void;
  onAddToCart: (item: CartItem) => void;
}

export const MonteAcaiModal: React.FC<MonteAcaiModalProps> = ({ size, menu, onClose, onAddToCart }) => {
  // Base selection (default to first available)
  const availableBases = menu.bases.filter(b => b.available);
  const [selectedBase, setSelectedBase] = useState<BaseItem>(availableBases[0] || menu.bases[0]);

  // Free toppings selection (array of selected items, limit = size.maxFreeToppings)
  const [selectedFreeToppings, setSelectedFreeToppings] = useState<FreeToppingItem[]>([]);

  // Premium toppings selection (map of itemId -> quantity)
  const [premiumToppingCounts, setPremiumToppingCounts] = useState<{ [id: string]: number }>({});

  // Syrups selection
  const [selectedSyrups, setSelectedSyrups] = useState<SyrupItem[]>([]);

  // Notes
  const [notes, setNotes] = useState('');

  // Handle free topping toggle
  const toggleFreeTopping = (topping: FreeToppingItem) => {
    if (selectedFreeToppings.some(t => t.id === topping.id)) {
      setSelectedFreeToppings(selectedFreeToppings.filter(t => t.id !== topping.id));
    } else {
      if (selectedFreeToppings.length < size.maxFreeToppings) {
        setSelectedFreeToppings([...selectedFreeToppings, topping]);
      }
    }
  };

  // Handle premium topping quantity change
  const updatePremiumCount = (toppingId: string, delta: number) => {
    setPremiumToppingCounts(prev => {
      const current = prev[toppingId] || 0;
      const next = Math.max(0, current + delta);
      if (next === 0) {
        const copy = { ...prev };
        delete copy[toppingId];
        return copy;
      }
      return { ...prev, [toppingId]: next };
    });
  };

  // Handle syrup toggle
  const toggleSyrup = (syrup: SyrupItem) => {
    if (selectedSyrups.some(s => s.id === syrup.id)) {
      setSelectedSyrups(selectedSyrups.filter(s => s.id !== syrup.id));
    } else {
      setSelectedSyrups([...selectedSyrups, syrup]);
    }
  };

  // Calculate total price
  const premiumTotal = Object.entries(premiumToppingCounts).reduce((acc, [id, qty]) => {
    const item = menu.premiumToppings.find(p => p.id === id);
    return acc + (item ? item.price * qty : 0);
  }, 0);

  const unitPrice = size.price + premiumTotal;

  const handleConfirm = () => {
    const premiumItems = Object.entries(premiumToppingCounts)
      .map(([id, quantity]) => {
        const item = menu.premiumToppings.find(p => p.id === id);
        return item ? { item, quantity } : null;
      })
      .filter((p): p is { item: PremiumToppingItem; quantity: number } => p !== null);

    const cartItem: CartItem = {
      id: `${size.id}-${Date.now()}`,
      size,
      base: selectedBase,
      freeToppings: selectedFreeToppings,
      premiumToppings: premiumItems,
      syrups: selectedSyrups,
      notes,
      unitPrice,
      quantity: 1
    };

    onAddToCart(cartItem);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="relative bg-gradient-to-r from-purple-900 via-purple-800 to-indigo-900 text-white p-5 flex items-start justify-between">
          <div>
            <span className="text-purple-300 text-xs font-semibold uppercase tracking-wider">Montando seu açaí</span>
            <h2 className="text-2xl font-black text-white">{size.name}</h2>
            <p className="text-purple-200 text-sm mt-0.5">{size.description}</p>
          </div>
          <button 
            onClick={onClose}
            className="bg-white/10 hover:bg-white/20 p-2 rounded-full text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 p-5 space-y-6">
          {/* 1. Escolha a Base */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <span className="bg-purple-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">1</span>
                Escolha a Base
              </h3>
              <span className="text-xs text-purple-700 bg-purple-50 font-medium px-2 py-0.5 rounded-full">Obrigatório</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {menu.bases.map(base => (
                <button
                  key={base.id}
                  disabled={!base.available}
                  onClick={() => setSelectedBase(base)}
                  className={`text-left p-3 rounded-xl border-2 transition-all flex items-center justify-between ${
                    !base.available 
                      ? 'border-slate-200 bg-slate-100 opacity-50 cursor-not-allowed'
                      : selectedBase.id === base.id
                        ? 'border-purple-600 bg-purple-50 text-purple-950 font-semibold shadow-xs'
                        : 'border-slate-200 hover:border-purple-200 text-slate-700'
                  }`}
                >
                  <span className="text-sm">{base.name}</span>
                  {selectedBase.id === base.id && (
                    <div className="w-5 h-5 rounded-full bg-purple-600 text-white flex items-center justify-center">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  )}
                  {!base.available && (
                    <span className="text-[10px] uppercase font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Esgotado</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Acompanhamentos Gratuitos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <span className="bg-purple-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">2</span>
                Acompanhamentos Grátis
              </h3>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                selectedFreeToppings.length === size.maxFreeToppings 
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-purple-100 text-purple-800'
              }`}>
                {selectedFreeToppings.length} de {size.maxFreeToppings} inclusos
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-2.5">
              Escolha até {size.maxFreeToppings} itens sem nenhum custo adicional.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {menu.freeToppings.map(topping => {
                const isSelected = selectedFreeToppings.some(t => t.id === topping.id);
                const isLimitReached = !isSelected && selectedFreeToppings.length >= size.maxFreeToppings;

                return (
                  <button
                    key={topping.id}
                    disabled={!topping.available || isLimitReached}
                    onClick={() => toggleFreeTopping(topping)}
                    className={`p-2.5 rounded-xl border text-left text-xs font-medium transition-all flex items-center justify-between ${
                      !topping.available
                        ? 'border-slate-200 bg-slate-100 opacity-50 cursor-not-allowed'
                        : isSelected
                          ? 'border-purple-600 bg-purple-50 text-purple-900 font-semibold'
                          : isLimitReached
                            ? 'border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed'
                            : 'border-slate-200 hover:border-purple-300 text-slate-700'
                    }`}
                  >
                    <span className="truncate mr-1">{topping.name}</span>
                    {isSelected ? (
                      <Check className="w-4 h-4 text-purple-600 shrink-0" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Adicionais Premium (Pagos) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <span className="bg-amber-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">3</span>
                Adicionais Especiais
              </h3>
              <span className="text-xs text-amber-700 bg-amber-50 font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Opcional
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-2.5">
              Deixe seu açaí ainda mais irresistível com doses extras e chocolates.
            </p>
            <div className="space-y-2">
              {menu.premiumToppings.map(item => {
                const count = premiumToppingCounts[item.id] || 0;
                return (
                  <div
                    key={item.id}
                    className={`p-2.5 rounded-xl border flex items-center justify-between transition-colors ${
                      !item.available
                        ? 'border-slate-200 bg-slate-50 opacity-60'
                        : count > 0
                          ? 'border-amber-400 bg-amber-50/50'
                          : 'border-slate-200'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-slate-800 text-sm">{item.name}</div>
                      <div className="text-xs font-bold text-amber-600">+{formatCurrency(item.price)}</div>
                    </div>

                    {!item.available ? (
                      <span className="text-[10px] text-slate-400 font-semibold">Indisponível</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        {count > 0 && (
                          <>
                            <button
                              onClick={() => updatePremiumCount(item.id, -1)}
                              className="w-7 h-7 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 flex items-center justify-center text-slate-700 shadow-xs"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-4 text-center font-bold text-slate-900 text-sm">{count}</span>
                          </>
                        )}
                        <button
                          onClick={() => updatePremiumCount(item.id, 1)}
                          className="w-7 h-7 rounded-lg bg-amber-500 hover:bg-amber-600 flex items-center justify-center text-white shadow-xs"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. Caldas / Coberturas */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <span className="bg-purple-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">4</span>
                Caldas & Coberturas
              </h3>
              <span className="text-xs text-purple-700 bg-purple-50 font-medium px-2 py-0.5 rounded-full">Grátis</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {menu.syrups.map(syrup => {
                const isSelected = selectedSyrups.some(s => s.id === syrup.id);
                return (
                  <button
                    key={syrup.id}
                    disabled={!syrup.available}
                    onClick={() => toggleSyrup(syrup)}
                    className={`p-2 rounded-xl border text-left text-xs font-medium transition-all flex items-center justify-between ${
                      !syrup.available
                        ? 'border-slate-200 bg-slate-100 opacity-50 cursor-not-allowed'
                        : isSelected
                          ? 'border-purple-600 bg-purple-50 text-purple-900 font-semibold'
                          : 'border-slate-200 hover:border-purple-200 text-slate-700'
                    }`}
                  >
                    <span className="truncate">{syrup.name}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-purple-600 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. Observações */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Alguma observação para o Kayky?
            </label>
            <input
              type="text"
              placeholder="Ex: Leite condensado no fundo, capricha na paçoca..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full text-sm p-3 rounded-xl border border-slate-200 focus:outline-hidden focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
              maxLength={120}
            />
          </div>
        </div>

        {/* Modal Footer with Live Price & Add Button */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-4">
          <div>
            <div className="text-xs text-slate-500 font-medium">Total deste item</div>
            <div className="text-2xl font-black text-purple-950">{formatCurrency(unitPrice)}</div>
          </div>

          <button
            onClick={handleConfirm}
            className="flex-1 bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 text-white font-bold py-3.5 px-6 rounded-2xl shadow-lg shadow-purple-900/20 active:scale-98 transition-all flex items-center justify-center gap-2 text-base cursor-pointer"
          >
            <Plus className="w-5 h-5 stroke-[2.5]" />
            Adicionar ao Pedido
          </button>
        </div>
      </div>
    </div>
  );
};
