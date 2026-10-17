import { TextStyle } from 'react-native'
import { colors } from './colors'
import { fonts } from './fonts'

export { fonts }

// Android ignores fontWeight with custom fonts, so the family name carries
// the weight. Never set fontWeight on these presets.
export const type = {
  display: { fontFamily: fonts.black, fontSize: 40, letterSpacing: -2.2, lineHeight: 43 },
  h1: { fontFamily: fonts.black, fontSize: 32, letterSpacing: -1.8, lineHeight: 34 },
  h2: { fontFamily: fonts.black, fontSize: 26, letterSpacing: -1.4, lineHeight: 29 },
  section: { fontFamily: fonts.black, fontSize: 20, letterSpacing: -0.8, lineHeight: 24 },
  body: { fontFamily: fonts.regular, fontSize: 16, letterSpacing: 0, lineHeight: 24 },
  bodySm: { fontFamily: fonts.regular, fontSize: 15, letterSpacing: 0, lineHeight: 21 },
  label: { fontFamily: fonts.bold, fontSize: 14, letterSpacing: 0, lineHeight: 18 },
  labelSm: { fontFamily: fonts.bold, fontSize: 13, letterSpacing: 0, lineHeight: 17 },
  caption: { fontFamily: fonts.regular, fontSize: 12, letterSpacing: 0, lineHeight: 17 },
  price: { fontFamily: fonts.bold, fontSize: 14, letterSpacing: 0, lineHeight: 18, color: colors.greenText },
  button: { fontFamily: fonts.black, fontSize: 17, letterSpacing: -0.3, lineHeight: 21 },
  eyebrow: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 0.6, lineHeight: 14, textTransform: 'uppercase' },
} satisfies Record<string, TextStyle>
