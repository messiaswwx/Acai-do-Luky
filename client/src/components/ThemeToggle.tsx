import React from 'react';
import { Sun, Moon } from 'lucide-react';

interface ThemeToggleProps {
  isDark: boolean;
  onToggle: () => void;
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ isDark, onToggle, className = '' }) => {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
      title={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      className={`relative inline-flex items-center justify-center p-2 rounded-full transition-all duration-300 cursor-pointer shadow-sm ${
        isDark
          ? 'bg-purple-900/80 hover:bg-purple-800 text-amber-300 border border-amber-400/40 hover:scale-105'
          : 'bg-white/10 hover:bg-white/20 text-amber-300 border border-white/20 hover:scale-105'
      } ${className}`}
    >
      {isDark ? (
        <Sun className="w-4 h-4 transition-transform duration-300 rotate-0 hover:rotate-45" />
      ) : (
        <Moon className="w-4 h-4 transition-transform duration-300 -rotate-12 hover:rotate-0" />
      )}
    </button>
  );
};
