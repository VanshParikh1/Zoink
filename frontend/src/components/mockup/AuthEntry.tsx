import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { University, UNIVERSITY_SHORT_LABELS } from '@zoink/shared'
import { colors } from '../../theme/colors'
import { border, radius, space } from '../../theme/tokens'
import { fonts, type } from '../../theme/typography'
import HardShadow from './HardShadow'
import HighlightText from './HighlightText'
import InkCard from './InkCard'
import LogoPill from './LogoPill'

// Shared top-of-screen and bottom-of-form parts of the signed-out entry
// screens (Login and Register), so the two stay identical.

/** Logo, eyebrow badge, two-line headline and intro copy. */
export function AuthIntro() {
  return (
    <View style={styles.intro}>
      <LogoPill size="lg" />

      <HardShadow offset="xs" radius={radius.pill} style={styles.eyebrowWrap}>
        <View style={styles.eyebrow}>
          <View style={styles.eyebrowDot} />
          <Text style={styles.eyebrowText}>STUDENT-TO-STUDENT RENTALS</Text>
        </View>
      </HardShadow>

      <View>
        <Text style={styles.headline}>Need it once?</Text>
        <HighlightText style={styles.headline}>Zoink it.</HighlightText>
      </View>

      <Text style={styles.body}>
        Rent from students nearby, or lend yours and get paid.{' '}
        <Text style={styles.bodyStrong}>Sign up with your student email.</Text>
      </Text>
    </View>
  )
}

/** Which campuses can sign up, built from the same enum registration validates against. */
export function UniversitiesCard() {
  const names = (Object.keys(UNIVERSITY_SHORT_LABELS) as University[]).map((u) => UNIVERSITY_SHORT_LABELS[u])
  return (
    <InkCard>
      <Text style={styles.cardTitle}>18+ students in Ontario at</Text>
      <Text style={styles.cardBody}>{names.join(' · ')}</Text>
    </InkCard>
  )
}

/** "By continuing you agree to the Terms and Privacy." with tappable links. */
export function LegalCaption({ onTerms, onPrivacy }: { onTerms: () => void; onPrivacy: () => void }) {
  return (
    <Text style={styles.caption}>
      By continuing you agree to the{' '}
      <Text style={styles.captionLink} onPress={onTerms} accessibilityRole="link">
        Terms
      </Text>{' '}
      and{' '}
      <Text style={styles.captionLink} onPress={onPrivacy} accessibilityRole="link">
        Privacy
      </Text>
      .
    </Text>
  )
}

const styles = StyleSheet.create({
  intro: {
    gap: space.xxl,
  },
  eyebrowWrap: {
    alignSelf: 'flex-start',
  },
  eyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    borderWidth: border.thin,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
  },
  eyebrowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.green,
  },
  eyebrowText: {
    ...type.eyebrow,
    color: colors.ink,
  },
  headline: {
    ...type.display,
    color: colors.ink,
  },
  body: {
    ...type.body,
    color: colors.mutedAlt,
  },
  bodyStrong: {
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  cardTitle: {
    ...type.label,
    color: colors.green,
  },
  cardBody: {
    ...type.bodySm,
    color: colors.onInk,
  },
  caption: {
    ...type.caption,
    color: colors.mutedAlt,
    textAlign: 'center',
  },
  captionLink: {
    fontFamily: fonts.bold,
    color: colors.ink,
    textDecorationLine: 'underline',
  },
})
