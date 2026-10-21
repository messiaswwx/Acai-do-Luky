import React, { useState, useMemo, useCallback, useEffect } from 'react';
import type { SizeItem, BaseItem, FreeToppingItem, PremiumToppingItem, SyrupItem, CartItem, MenuData } from '../types';
import { formatCurrency } from '../utils/format';
import { isDiscountActive, getRemainingHoursText } from '../utils/promo';
import { X, Check, Plus, Minus, Sparkles, Flame, Clock } from 'lucide-react';

interface MonteAcaiModalProps {
  size: SizeItem;
  menu: MenuData;
  onClose: () => void;
  onAddToCart: (item: CartItem) => void;
}

export const MonteAcaiModal: React.FC<MonteAcaiModalProps> = ({ size, menu, onClose, onAddToCart }) => {
  // Prevent background page from scrolling & repainting while modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const availableBases = useMemo(
    () => menu.bases.filter(b => b.available),
    [menu.bases]
  );

  const [selectedBase, setSelectedBase] = useState<BaseItem>(availableBases[0] || menu.bases[0]);
  const [selectedFreeToppings, setSelectedFreeToppings] = useState<FreeToppingItem[]>([]);
  const [premiumToppingCounts, setPremiumToppingCounts] = useState<{ [id: string]: number }>({});
  const [selectedSyrups, setSelectedSyrups] = useState<SyrupItem[]>([]);
  const [notes, setNotes] = useState('');

  const toggleFreeTopping = useCallback((topping: FreeToppingItem) => {
    setSelectedFreeToppings(prev => {
      if (prev.some(t => t.id === topping.id)) {
        return prev.filter(t => t.id !== topping.id);
      }
      if (prev.length < size.maxFreeToppings) {
        return [...prev, topping];
      }
      return prev;
    });
  }, [size.maxFreeToppings]);

  const updatePremiumCount = useCallback((toppingId: string, delta: number) => {
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
  }, []);

  const toggleSyrup = useCallback((syrup: SyrupItem) => {
    setSelectedSyrups(prev => {
      if (prev.some(s => s.id === syrup.id)) {
        return prev.filter(s => s.id !== syrup.id);
      }
      return [...prev, syrup];
    });
  }, []);

  const premiumTotal = useMemo(() => {
    return Object.entries(premiumToppingCounts).reduce((acc, [id, qty]) => {
      const item = menu.premiumToppings.find(p => p.id === id);
      return acc + (item ? item.price * qty : 0);
    }, 0);
  }, [premiumToppingCounts, menu.premiumToppings]);

  const unitPrice = useMemo(() => size.price + premiumTotal, [size.price, premiumTotal]);

  const handleConfirm = useCallback(() => {
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
  }, [size, selectedBase, selectedFreeToppings, premiumToppingCounts, selectedSyrups, notes, unitPrice, menu.premiumToppings, onAddToCart, onClose]);

  const isPromo = useMemo(() => isDiscountActive(size), [size]);
  const remainingTime = useMemo(
    () => isPromo ? getRemainingHoursText(size.discountExpiresAt) : null,
    [isPromo, size.discountExpiresAt]
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overscroll-contain">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-purple-200/50 dark:border-purple-900/40 transform-gpu">
        {/* Modal Header */}
        <div className="relative bg-gradient-to-r from-[#471256] via-[#5c1c73] to-[#360942] text-white p-5 flex items-start justify-between border-b border-purple-800/40">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Logo"
              className="w-12 h-12 rounded-full border-2 border-amber-400 bg-white object-contain shrink-0 shadow-md"
              decoding="async"
              loading="eager"
            />
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-amber-300 text-xs font-black uppercase tracking-wider">Montando seu açaí</span>
                {isPromo && (
                  <>
                    <span className="bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                      <Flame className="w-2.5 h-2.5 fill-white" />
                      {size.discountPercent}% OFF
                    </span>
                    {remainingTime && (
                      <span className="bg-purple-900 text-amber-300 border border-purple-700 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5 text-amber-400" />
                        {remainingTime}
                      </span>
                    )}
                  </>
                )}
              </div>
              <h2 className="text-2xl font-black text-white">{size.name}</h2>
              <p className="text-purple-200 text-xs mt-0.5">{size.description}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="bg-white/10 hover:bg-white/20 p-2 rounded-full text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content with hardware-accelerated scrolling and overscroll containment */}
        <div className="overflow-y-auto flex-1 p-5 space-y-6 overscroll-contain transform-gpu">
          {/* 1. Escolha a Base */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="bg-purple-900 text-amber-300 text-xs w-6 h-6 rounded-full flex items-center justify-center font-black">1</span>
                <span>Escolha a Base</span>
              </h3>
              <span className="text-xs text-purple-900 dark:text-purple-300 bg-purple-100 dark:bg-purple-950/80 font-bold px-2 py-0.5 rounded-full border border-purple-200 dark:border-purple-900/50">Obrigatório</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {availableBases.map(base => (
                <button
                  key={base.id}
                  onClick={() => setSelectedBase(base)}
                  className={`text-left p-3 rounded-2xl border-2 transition-colors flex items-center justify-between cursor-pointer ${
                    selectedBase.id === base.id
                      ? 'border-purple-700 dark:border-purple-500 bg-purple-50 dark:bg-purple-950/80 text-purple-950 dark:text-purple-200 font-bold shadow-xs'
                      : 'border-slate-200 dark:border-slate-800 hover:border-purple-300 dark:hover:border-purple-600 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800/60'
                  }`}
                >
                  <span className="text-xs font-bold">{base.name}</span>
                  {selectedBase.id === base.id && (
                    <div className="w-5 h-5 rounded-full bg-purple-700 dark:bg-purple-600 text-amber-300 flex items-center justify-center">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Acompanhamentos Gratuitos */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="bg-purple-900 text-amber-300 text-xs w-6 h-6 rounded-full flex items-center justify-center font-black">2</span>
                <span>Acompanhamentos Grátis</span>
              </h3>
              <span className={`text-xs font-black px-2.5 py-0.5 rounded-full ${
                selectedFreeToppings.length === size.maxFreeToppings 
                  ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
              }`}>
                {selectedFreeToppings.length} de {size.maxFreeToppings} inclusos
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2.5">
              Escolha até {size.maxFreeToppings} acompanhamentos sem custo extra:
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
                    className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition-colors flex items-center justify-between cursor-pointer ${
                      !topping.available
                        ? 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/40 text-slate-400 dark:text-slate-600 opacity-50 cursor-not-allowed'
                        : isSelected
                          ? 'border-purple-600 dark:border-purple-500 bg-purple-50 dark:bg-purple-950/80 text-purple-900 dark:text-purple-200 font-black shadow-xs'
                          : isLimitReached
                            ? 'border-slate-100 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-900/40 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                            : 'border-slate-200 dark:border-slate-800 hover:border-purple-300 dark:hover:border-purple-600 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800/60'
                    }`}
                  >
                    <span className="truncate mr-1">{topping.name}</span>
                    {isSelected ? (
                      <Check className="w-4 h-4 text-purple-700 dark:text-purple-400 stroke-[3] shrink-0" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border border-slate-300 dark:border-slate-600 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Adicionais Premium (Pagos) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="bg-amber-400 text-purple-950 text-xs w-6 h-6 rounded-full flex items-center justify-center font-black">3</span>
                <span>Adicionais Especiais</span>
              </h3>
              <span className="text-xs text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/80 font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border border-amber-200 dark:border-amber-800">
                <Sparkles className="w-3 h-3 text-amber-600 dark:text-amber-400" /> Opcional
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2.5">
              Chocolates e doses extras para turbinar o seu açaí:
            </p>
            <div className="space-y-2">
              {menu.premiumToppings.map(item => {
                const count = premiumToppingCounts[item.id] || 0;
                return (
                  <div
                    key={item.id}
                    className={`p-3 rounded-2xl border flex items-center justify-between transition-colors ${
                      !item.available
                        ? 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 opacity-60'
                        : count > 0
                          ? 'border-amber-400 dark:border-amber-500 bg-amber-50/70 dark:bg-amber-950/30 shadow-xs'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white text-xs">{item.name}</div>
                      <div className="text-xs font-black text-amber-600 dark:text-amber-400">+{formatCurrency(item.price)}</div>
                    </div>

                    {!item.available ? (
                      <span className="text-[10px] text-slate-400 font-semibold">Indisponível</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        {count > 0 && (
                          <>
                            <button
                              onClick={() => updatePremiumCount(item.id, -1)}
                              className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 shadow-xs cursor-pointer"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-4 text-center font-black text-purple-950 dark:text-amber-300 text-sm">{count}</span>
                          </>
                        )}
                        <button
                          onClick={() => updatePremiumCount(item.id, 1)}
                          className="w-7 h-7 rounded-lg bg-amber-400 hover:bg-amber-500 flex items-center justify-center text-purple-950 font-black shadow-xs cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5 stroke-[3]" />
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
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="bg-purple-900 text-amber-300 text-xs w-6 h-6 rounded-full flex items-center justify-center font-black">4</span>
                <span>Caldas & Coberturas</span>
              </h3>
              <span className="text-xs text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/80 font-bold px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">Grátis</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {menu.syrups.map(syrup => {
                const isSelected = selectedSyrups.some(s => s.id === syrup.id);
                return (
                  <button
                    key={syrup.id}
                    disabled={!syrup.available}
                    onClick={() => toggleSyrup(syrup)}
                    className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition-colors flex items-center justify-between cursor-pointer ${
                      !syrup.available
                        ? 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/40 opacity-50 cursor-not-allowed'
                        : isSelected
                          ? 'border-purple-700 dark:border-purple-500 bg-purple-50 dark:bg-purple-950/80 text-purple-900 dark:text-purple-200 font-black'
                          : 'border-slate-200 dark:border-slate-800 hover:border-purple-200 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800/60'
                    }`}
                  >
                    <span className="truncate">{syrup.name}</span>
                    {isSelected && <Check className="w-4 h-4 text-purple-700 dark:text-purple-400 stroke-[3] shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. Observações */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Alguma observação para o Luky?
            </label>
            <input
              type="text"
              placeholder="Ex: Leite condensado no fundo, capricha no leite ninho..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-hidden focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
              maxLength={120}
            />
          </div>
        </div>

        {/* Modal Footer with Live Price & Add Button */}
        <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 transform-gpu">
          <div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase">Total deste item</div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-purple-950 dark:text-amber-400">{formatCurrency(unitPrice)}</span>
              {(size.discountPercent || 0) > 0 && (size.originalPrice || size.price) > size.price && (
                <span className="line-through text-xs font-bold text-slate-400 dark:text-slate-500">
                  {formatCurrency((size.originalPrice || size.price) + premiumTotal)}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={handleConfirm}
            className="flex-1 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 hover:from-amber-500 hover:to-amber-600 text-purple-950 font-black py-4 px-6 rounded-2xl shadow-xl shadow-amber-500/20 active:scale-98 transition-colors flex items-center justify-center gap-2 text-sm cursor-pointer"
          >
            <Plus className="w-5 h-5 stroke-[3]" />
            <span>Adicionar à Sacola</span>
          </button>
        </div>
      </div>
    </div>
  );
};
