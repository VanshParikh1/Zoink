export const colors = {
  // Matched to logo — grass green, not neon
  green: '#6DD832',          // primary — the exact logo green
  greenDeep: '#4EA822',      // pressed states, borders, button floors
  greenDark: '#3A7D19',      // deep shadow, heavy button base
  greenSoft: '#96E85A',      // highlights, soft accents
  greenSurface: '#F2FAE8',   // faint tint for bg surfaces

  white: '#FFFFFF',
  gray50: '#F6F6F7',
  gray100: '#F1F1F1',
  gray200: '#E3E3E3',
  gray300: '#C9C9C9',
  gray500: '#6D7175',
  gray700: '#3A3C3E',
  gray900: '#1A1A1A',

  danger: '#D72C0D',
  warning: '#FFC453',
  dangerSurface: '#FFF4F4',
  warningSurface: '#FFF5EA',

  inkBase: '#1A1A1A',
}

export const theme = {
  colors,

  screen: colors.gray50,
  surface: colors.white,
  surfaceRaised: colors.white,
  surfaceSubdued: colors.gray100,

  border: colors.gray200,
  borderFocus: colors.green,
  borderSubdued: colors.gray100,
  borderBottom: colors.gray200,

  shadow: 'rgba(0, 0, 0, 0.08)',
  shadowMd: 'rgba(0, 0, 0, 0.12)',
  shadowLg: 'rgba(0, 0, 0, 0.16)',

  text: colors.gray900,
  textSecondary: colors.gray700,
  textMuted: colors.gray500,
  textDisabled: colors.gray300,
  textOnPrimary: '#1A3A08',  // dark green — readable on #6DD832

  primary: colors.green,
  primaryDeep: colors.greenDeep,
  primaryLight: colors.greenSoft,
  primarySurface: colors.greenSurface,

  cardBorder: colors.gray200,
  cardBackground: colors.white,
  cardShadow: '0px 1px 3px rgba(0,0,0,0.08), 0px 1px 2px rgba(0,0,0,0.06)',

  backgroundGradient: [colors.greenSurface, colors.gray50, colors.white] as const,
  textureColor: colors.greenDeep,

  glassLight: 'rgba(255, 255, 255, 0.65)',
  glassDark: 'rgba(10, 28, 5, 0.85)',
  glassGreen: 'rgba(109, 216, 50, 0.12)',  // updated to new green
  glassBorder: 'rgba(255, 255, 255, 0.3)',

  danger: colors.danger,
  warning: colors.warning,
  dangerSurface: colors.dangerSurface,
  warningSurface: colors.warningSurface,

  // Flat-card radius scale — replaces the ad hoc 8/16/24/32 values
  // that had accumulated per-screen with no shared system behind them.
  radius: {
    sm: 8,   // chips, thumbnails, small inline controls
    md: 16,  // standard cards, panels
    lg: 24,  // hero/feature cards, large panels
    pill: 999,
  },

  // Flat-card shadow scale — replaces the 0.08–0.5 opacity spread
  // found across screens with three deliberate depth steps.
  shadowSm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  shadowMdElevation: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  shadowLgElevation: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 6,
  },

  // Neobrutalist system, matched to the landing page (frontend/landing/index.html):
  // thick ink borders + a solid offset "block" shadow instead of soft blur.
  hard: {
    ink: colors.inkBase,     // border + block-shadow color
    border: 2.5,             // standard outline weight
    borderThin: 1.5,         // small controls (chips, pills)
    offset: {
      sm: 3,  // chips, thumbnails, small buttons
      md: 5,  // standard cards
      lg: 7,  // hero cards, feature panels
    },
  },
}