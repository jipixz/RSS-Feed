// Design tokens — Señal
export const SN = {
  brand: { blue: '#0082A6', teal: '#3BBEB4', coral: '#F79962' },
  blue: { 50: '#E6F7FC', 300: '#4FBFD9', 500: '#0082A6', 600: '#006B8C', 700: '#005674' },
  teal: { 50: '#E8F8F6', 200: '#9FE3DB', 300: '#6BD2C6', 400: '#3BBEB4', 700: '#196C69' },
  coral: { 300: '#F79962', 600: '#D43F0E' },
  slate: {
    25: '#FBFCFD', 50: '#F6F8FA', 100: '#EEF1F4', 200: '#DFE3E8', 300: '#C3CAD2',
    400: '#9AA5B1', 500: '#6F7C88', 600: '#4A5763', 700: '#323F4B', 800: '#1F2A36',
    900: '#0F1B23', 950: '#070F14',
  },
  radius: { sm: 4, md: 6, base: 8, lg: 10, xl: 12, full: 9999 },
  shadow: {
    sm: '0 1px 2px rgba(15,27,35,0.04), 0 1px 3px rgba(15,27,35,0.06)',
    md: '0 2px 4px rgba(15,27,35,0.04), 0 4px 12px rgba(15,27,35,0.06)',
    lg: '0 4px 8px rgba(15,27,35,0.05), 0 12px 24px rgba(15,27,35,0.08)',
  },
  font: {
    title: "'Open Sans', sans-serif",
    body: "'Roboto', sans-serif",
    mono: "'JetBrains Mono', monospace",
  },
} as const;

export interface Theme {
  appBg: string; bg: string; surface1: string; surface2: string; surface3: string;
  border: string; borderSubtle: string;
  textPrimary: string; textSecondary: string; textTertiary: string; textMuted: string;
  activeBg: string; activeText: string; activeBar: string; hover: string; sb: string;
  tldrBg: string; tldrBorder: string; tldrText: string;
}

export const THEMES: Record<'light' | 'dark', Theme> = {
  light: {
    appBg: '#EEF1F4', bg: '#FFFFFF', surface1: '#FBFCFD', surface2: '#F6F8FA', surface3: '#EEF1F4',
    border: '#DFE3E8', borderSubtle: '#EEF1F4',
    textPrimary: '#0F1B23', textSecondary: '#4A5763', textTertiary: '#6F7C88', textMuted: '#9AA5B1',
    activeBg: '#E6F7FC', activeText: '#005674', activeBar: '#0082A6', hover: '#F6F8FA', sb: '#C3CAD2',
    tldrBg: '#E8F8F6', tldrBorder: '#9FE3DB', tldrText: '#196C69',
  },
  dark: {
    appBg: '#070F14', bg: '#0A141A', surface1: '#0F1C24', surface2: '#16252F', surface3: '#1F303B',
    border: '#243440', borderSubtle: '#1B2A35',
    textPrimary: '#F0F4F7', textSecondary: '#B5C0CB', textTertiary: '#828F9B', textMuted: '#5C6975',
    activeBg: 'rgba(0,130,166,0.20)', activeText: '#4FBFD9', activeBar: '#3BBEB4', hover: '#16252F', sb: '#243440',
    tldrBg: 'rgba(59,190,180,0.10)', tldrBorder: 'rgba(59,190,180,0.32)', tldrText: '#6BD2C6',
  },
};
