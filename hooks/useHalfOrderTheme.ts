import { useColorScheme } from 'react-native';

export function useHalfOrderTheme() {
  const scheme = useColorScheme();
  const isDark = scheme !== 'light';
  return {
    isDark,
    colors: {
      background: isDark ? '#0B0D10' : '#F7FAFC',
      surface: isDark ? '#141922' : '#FFFFFF',
      text: isDark ? '#F8FAFC' : '#0F172A',
      muted: isDark ? '#9CA3AF' : '#64748B',
      primary: '#34D399',
      border: isDark ? '#1F2937' : '#E2E8F0',
    },
  };
}
