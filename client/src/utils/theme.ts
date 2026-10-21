import { useEffect, useState } from 'react';

const THEME_STORAGE_KEY = 'acai_theme';

export function getInitialTheme(): boolean {
  if (typeof window === 'undefined') return false;
  
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === 'dark') return true;
  if (saved === 'light') return false;
  
  // Default to system preference if user hasn't explicitly chosen
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyTheme(isDark: boolean) {
  if (typeof document === 'undefined') return;
  
  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

export function useTheme() {
  const [isDark, setIsDark] = useState<boolean>(getInitialTheme);

  useEffect(() => {
    applyTheme(isDark);
    localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
  }, [isDark]);

  const toggleTheme = () => setIsDark(prev => !prev);

  return { isDark, toggleTheme };
}
