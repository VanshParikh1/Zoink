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

  // Grass-green wash pulled toward the landing page's radial glows
  // (landing/index.html: rgba(0,239,32,.26) / rgba(200,255,89,.28)) without
  // going full-saturation — has to stay readable behind body text and white
  // cards on 26 screens. Runs horizontally in ScreenBackground so the top and
  // bottom edges read identically; the middle stop is kept lightest for text.
  backgroundGradient: ['#D3F3C2', '#E9F9D5', '#F2FBE8'] as const,
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

  // One type scale for the whole app — every screen title, section heading,
  // body copy, and caption pulls from here instead of picking its own size/
  // weight/line-height per screen.
  type: {
    screenTitle: { fontSize: 28, fontWeight: '900' as const, lineHeight: 34, color: colors.gray900 },
    sectionTitle: { fontSize: 16, fontWeight: '900' as const, lineHeight: 20, color: colors.gray900 },
    body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22, color: colors.gray900 },
    bodyMuted: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22, color: colors.gray500 },
    label: { fontSize: 14, fontWeight: '700' as const, lineHeight: 18, color: colors.gray900 },
    caption: { fontSize: 12, fontWeight: '700' as const, lineHeight: 16, color: colors.gray500 },
    eyebrow: { fontSize: 11, fontWeight: '800' as const, letterSpacing: 1.3, textTransform: 'uppercase' as const, color: colors.gray500 },
  },

  // Shared vertical rhythm for screen headers, so a title sits at the same
  // height and the same distance from content on every screen. `stack` is
  // for pushed screens with a Back control; `tab` is for top-level tab roots.
  header: {
    stackTop: 64,
    tabTop: 64,
    titleGap: 4,      // space between a Back link / eyebrow and the title
    contentGap: 20,   // space between the title block and the first card
  },
}