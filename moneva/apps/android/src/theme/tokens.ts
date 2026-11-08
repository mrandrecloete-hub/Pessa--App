/** MONEVA design tokens. Single source for colour, spacing, radius and type. */
export const brand = {
  navy: '#101B2C',
  emerald: '#087B62',
  emeraldBright: '#16A67A',
  gold: '#D6B36A',
  softBg: '#F5F7F6',
  white: '#FFFFFF',
  textDark: '#17242F',
  grey: '#83908E',
} as const;

export interface Palette {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryText: string;
  accent: string;
  positive: string;
  negative: string;
  warning: string;
  tabBar: string;
  shadow: string;
}

export const light: Palette = {
  bg: brand.softBg,
  surface: brand.white,
  surfaceAlt: '#EAF0EE',
  border: '#DDE5E2',
  text: brand.textDark,
  textMuted: '#5F6E6C',
  primary: brand.emerald,
  primaryText: brand.white,
  accent: brand.gold,
  positive: brand.emerald,
  negative: '#B3392F',
  warning: '#A9791A',
  tabBar: brand.white,
  shadow: '#101B2C',
};
export const dark: Palette = {
  bg: '#0B1420',
  surface: brand.navy,
  surfaceAlt: '#18263A',
  border: '#243449',
  text: '#EEF3F1',
  textMuted: '#9AA8A6',
  primary: brand.emeraldBright,
  primaryText: '#04281F',
  accent: brand.gold,
  positive: brand.emeraldBright,
  negative: '#F08A80',
  warning: '#E3C27A',
  tabBar: brand.navy,
  shadow: '#000000',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 16, lg: 22, pill: 999 } as const;
export const type = {
  display: { fontSize: 34, fontWeight: '700' as const, letterSpacing: -0.5 },
  title: { fontSize: 22, fontWeight: '700' as const },
  heading: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  caption: { fontSize: 12.5, fontWeight: '500' as const },
};
