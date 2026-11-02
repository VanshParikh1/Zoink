import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import { colors } from '../../theme/colors'
import { border, radius, space } from '../../theme/tokens'
import { fonts, type } from '../../theme/typography'
import Badge from './Badge'
import Card from './Card'
import InkCard from './InkCard'

const DOT = 36
// The mockup's current-step headline: between type.h2 (26) and type.section (20).
const HEADLINE_SIZE = 22

export type TimelineStep = {
  key: string
  title: string
  /** Done/upcoming caption, e.g. "Oct 22 · 3 photos · rent charged". */
  caption?: string | null
  state: 'done' | 'current' | 'upcoming'
  /** Only for the current step. */
  current?: {
    badge: string
    headline: string
    body?: string | null
    /** 0–1; shows a progress bar when set. */
    progress?: number | null
  }
  /** Replaces the current step's ink card (e.g. an open dispute). */
  override?: React.ReactNode
}

function Dot({ variant, number }: { variant: 'done' | 'current' | 'upcoming'; number: number }) {
  if (variant === 'done') {
    return (
      <View style={[styles.dot, styles.dotDone]}>
        <Feather name="check" size={18} color={colors.ink} />
      </View>
    )
  }
  return (
    <View style={[styles.dot, variant === 'current' ? styles.dotCurrent : styles.dotUpcoming]}>
      <Text style={styles.dotNumber}>{number}</Text>
    </View>
  )
}

/** Vertical list of done / current / upcoming steps for a booking. */
export default function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <View style={styles.list}>
      {steps.map((step, index) => {
        const n = index + 1
        if (step.state === 'current' && step.override) {
          return <View key={step.key}>{step.override}</View>
        }
        if (step.state === 'current' && step.current) {
          return (
            <InkCard key={step.key}>
              <View style={styles.currentTop}>
                <Dot variant="current" number={n} />
                <Badge label={step.current.badge} variant="green" />
              </View>
              <Text style={styles.currentTitle}>{step.title}</Text>
              <Text style={styles.headline}>{step.current.headline}</Text>
              {step.current.progress != null ? (
                <View
                  style={styles.track}
                  accessibilityRole="progressbar"
                  accessibilityValue={{ min: 0, max: 100, now: Math.round(step.current.progress * 100) }}
                >
                  <View style={[styles.fill, { width: `${Math.min(100, Math.max(0, step.current.progress * 100))}%` }]} />
                </View>
              ) : null}
              {step.current.body ? <Text style={styles.currentBody}>{step.current.body}</Text> : null}
            </InkCard>
          )
        }
        const done = step.state === 'done'
        const content = (
          <View style={styles.row}>
            <Dot variant={done ? 'done' : 'upcoming'} number={n} />
            <View style={styles.rowText}>
              <Text style={styles.title}>{step.title}</Text>
              {step.caption ? <Text style={styles.caption}>{step.caption}</Text> : null}
            </View>
          </View>
        )
        return done ? (
          <Card key={step.key} shadow={false} padding={space.lg}>
            {content}
          </Card>
        ) : (
          <View key={step.key} style={styles.upcoming}>
            {content}
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  list: { gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  rowText: { flex: 1, gap: 2 },
  title: { ...type.bodySm, fontFamily: fonts.black, color: colors.ink },
  caption: { ...type.caption, color: colors.mutedAlt },
  upcoming: {
    padding: space.lg,
    borderRadius: radius.card,
    borderWidth: border.base,
    borderStyle: 'dashed',
    borderColor: colors.mutedAlt,
    opacity: 0.85,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.green, borderWidth: border.thin, borderColor: colors.ink },
  dotCurrent: { backgroundColor: colors.onInk },
  dotUpcoming: { borderWidth: border.thin, borderColor: colors.mutedAlt },
  dotNumber: { ...type.label, fontFamily: fonts.black, color: colors.ink },
  currentTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  currentTitle: { ...type.labelSm, color: colors.onInkMuted },
  headline: { ...type.h2, fontSize: HEADLINE_SIZE, lineHeight: HEADLINE_SIZE + 4, letterSpacing: -0.8, color: colors.onInk },
  track: {
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.muted,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.green },
  currentBody: { ...type.label, fontFamily: fonts.regular, lineHeight: 20, color: colors.onInkMuted },
})
