export const colors = {
  limeGreen: '#16FF6E',
  inkBase: '#0C0C0E',
  screenBg: '#111114',
  surface: '#1A1A1F',
  surfaceAlt: '#242429',
  snowWhite: '#F4F4F5',
  danger: '#EF4444',
  warning: '#F59E0B',
}

export const theme = {
  colors,
  screen: colors.screenBg,
  surface: colors.surface,
  surfaceAlt: colors.surfaceAlt,
  surfaceSoft: 'rgba(22,255,110,0.10)',
  border: 'rgba(255,255,255,0.07)',
  borderAccent: 'rgba(22,255,110,0.20)',
  shadow: 'rgba(0,0,0,0.40)',
  text: colors.snowWhite,
  textMuted: 'rgba(244,244,245,0.50)',
  textFaint: 'rgba(244,244,245,0.30)',
  primary: colors.limeGreen,
  primaryText: '#050A05',
  backgroundGradient: [
    colors.inkBase,
    colors.screenBg,
    colors.inkBase,
  ] as const,
  // for organic bg blobs — keep opacity very low
  blobColor: 'rgba(22,255,110,0.06)',
}