export const colors = {
  limeGreen: '#0FFF50',
  limeDeep: '#00CC3F',        // pressed/hover states
  limeSoft: '#5BFFA0',        // subtle highlights, glows
  inkBase: '#050505',
  inkMid: '#0a0a0a',
  snowWhite: '#FFFFFF',
  textLight: '#F4F4F5',
  danger: '#EF4444',
  warning: '#F59E0B',
}

export const theme = {
  colors,

  screen: colors.inkBase,
  surface: colors.inkMid,

  glassFill: 'rgba(255, 255, 255, 0.07)',
  glassFillPressed: 'rgba(255, 255, 255, 0.14)',
  glassBorder: 'rgba(255, 255, 255, 0.12)',
  glassBorderBottom: 'rgba(0, 0, 0, 0.20)',
  glassHighlight: 'rgba(255, 255, 255, 0.35)',
  glassShadow: '#0a1f04',

  glassPrimaryFill: 'rgba(15, 255, 80, 0.14)',
  glassPrimaryBorder: 'rgba(15, 255, 80, 0.36)',

  blobColor1: 'rgba(15, 255, 80, 0.22)',
  blobColor2: 'rgba(0, 150, 40, 0.16)',
  blobColor3: 'rgba(30, 80, 5, 0.20)',

  border: 'rgba(255, 255, 255, 0.07)',
  borderAccent: 'rgba(15, 255, 80, 0.36)',

  shadow: 'rgba(0, 0, 0, 0.40)',

  text: colors.textLight,
  textMuted: 'rgba(244, 244, 245, 0.55)',
  textFaint: 'rgba(244, 244, 245, 0.28)',

  primary: colors.limeGreen,
  primaryDeep: colors.limeDeep,
  primarySoft: colors.limeSoft,
  primaryText: '#050A05',

  backgroundGradient: ['#050505', '#0a0a0a', '#050505'] as const,

  surfaceSoft: 'rgba(15, 255, 80, 0.10)',
}