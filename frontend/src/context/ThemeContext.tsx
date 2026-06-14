import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Theme, ThemeColors, ThemeContextValue, ThemeProviderProps } from '../types';

const DARK_MODE_KEY = 'ordocare_dark_mode';

const lightColors: ThemeColors = {
  primary: '#0F4C81',
  secondary: '#EBF5FF',
  background: '#F8F9FA',
  card: '#FFFFFF',
  textDark: '#1A202C',
  textLight: '#718096',
  success: '#34C759',
  danger: '#E02424',
  dangerBg: '#FEE2E2',
  border: '#E2E8F0',
};

const darkColors: ThemeColors = {
  primary: '#4A90D9',
  secondary: '#1A365D',
  background: '#1A202C',
  card: '#2D3748',
  textDark: '#F7FAFC',
  textLight: '#A0AEC0',
  success: '#34C759',
  danger: '#E02424',
  dangerBg: '#5C1A1A',
  border: '#4A5568',
};

const baseTheme = {
  spacing: { s: 8, m: 16, l: 24, xl: 32, xxl: 40 },
  borderRadius: { card: 20, button: 16, input: 14 },
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 5,
  },
  typography: { titleSize: 28, subtitleSize: 16 },
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(DARK_MODE_KEY).then((val) => {
      if (val === 'true') setIsDark(true);
    });
  }, []);

  const toggleDarkMode = (): void => {
    setIsDark((prev) => {
      const next = !prev;
      AsyncStorage.setItem(DARK_MODE_KEY, String(next));
      return next;
    });
  };

  const theme: Theme = useMemo(() => ({
    ...baseTheme,
    colors: isDark ? darkColors : lightColors,
    isDark,
  }), [isDark]);

  return (
    <ThemeContext.Provider value={{ isDark, toggleDarkMode, theme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
