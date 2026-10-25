import React, { useMemo, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { getFirstPendingReview, submitReview } from '../services/reviewsApi'
import { queryClient } from '../services/queryClient'
import { PendingReview } from '../types'
import { colors } from '../theme/colors'
import { border, radius, shadow, space } from '../theme/tokens'
import { fonts, type } from '../theme/typography'
import { categoryAbbreviation } from '../config/categories'
import { fillImageUrl } from '../utils/cloudinaryImage'
import Screen from '../components/mockup/Screen'
import Button from '../components/mockup/Button'
import Badge from '../components/mockup/Badge'
import Card from '../components/mockup/Card'
import HardShadow from '../components/mockup/HardShadow'
import TextField from '../components/mockup/TextField'
import Thumb from '../components/mockup/Thumb'
import { formatRentalDate } from '@zoink/shared'
import { toast } from '../services/toast'

type Nav = NativeStackNavigationProp<RootStackParamList>
type ScreenRoute = RouteProp<RootStackParamList, 'ReviewPrompt'>

const SCALE = [1, 2, 3, 4, 5]
const THUMB = 52

function labelForKey(key: string) {
  const labels: Record<string, string> = {
    accuracy: 'Accuracy',
    condition: 'Condition',
    communication: 'Communication',
    reliability: 'Reliability',
    care: 'Care',
    pickupExperience: 'Pickup Experience',
  }

  return labels[key] ?? key
}

function promptForRole(review: PendingReview) {
  if (review.reviewerRole === 'RENTER') {
    return 'Help keep Zoink trustworthy for everyone by reviewing how this item was listed and handed off.'
  }

  return 'Help keep Zoink trustworthy for everyone by reviewing how this renter handled the handoff and return.'
}

// The borrower (reviewerRole RENTER) rented the item and is the one who can
// actually speak to its condition, so only they get the item star-rating
// section. The lender (reviewerRole LENDER) gets a free-text field about the
// person instead — this is already the same signal ReviewPromptScreen used
// to pick copy in promptForRole() above, so no new prop/param was needed.
function isBorrowerReviewer(review: PendingReview) {
  return review.reviewerRole === 'RENTER'
}

function defaultScores() {
  return {
    scoreA: 0,
    scoreB: 0,
    scoreC: 0,
  }
}

export default function ReviewPromptScreen() {
  const nav = useNavigation<Nav>()
  const route = useRoute<ScreenRoute>()
  const review = route.params.review
  const isBorrower = isBorrowerReviewer(review)
  const [scores, setScores] = useState(defaultScores())
  const [itemRating, setItemRating] = useState(0)
  const [itemNotes, setItemNotes] = useState('')
  const [personNotes, setPersonNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const listingImageUrl = review.booking.listing.images?.[0]?.url

  const scoreRows = useMemo(
    () => [
      { key: 'scoreA', label: labelForKey(review.scoreLabels.scoreAKey) },
      { key: 'scoreB', label: labelForKey(review.scoreLabels.scoreBKey) },
      { key: 'scoreC', label: labelForKey(review.scoreLabels.scoreCKey) },
    ] as const,
    [review.scoreLabels]
  )

  async function handleSubmit() {
    if (!scores.scoreA || !scores.scoreB || !scores.scoreC) {
      Alert.alert('Missing ratings', 'Please rate all three categories before continuing.')
      return
    }

    if (isBorrower && !itemRating) {
      Alert.alert('Missing item rating', 'Please rate the item itself before continuing.')
      return
    }

    setBusy(true)
    try {
      const result = await submitReview({
        obligationId: review.id,
        reviewerRole: review.reviewerRole,
        scoreA: scores.scoreA,
        scoreB: scores.scoreB,
        scoreC: scores.scoreC,
        ...(isBorrower ? { itemRating, itemNotes } : { personNotes }),
      })

      // The review changes the other person's rating and this booking's state.
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })

      if (result.pendingRemaining > 0) {
        const next = await getFirstPendingReview()
        if (next) {
          nav.replace('ReviewPrompt', { review: next })
          return
        }
      }

      nav.reset({
        index: 0,
        routes: [{ name: 'MainApp' }],
      })
    } catch (err: any) {
      toast.failure(err, { action: "Couldn't send your review. Please try again." })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen
      glow="topRight"
      keyboardAvoiding
      footer={<Button label="Submit review" onPress={handleSubmit} loading={busy} />}
    >
      <View style={styles.content}>
        <View style={styles.hero}>
          <Badge label="Trust check" variant="lime" icon={<Feather name="shield" size={12} color={colors.ink} />} />
          <Text style={styles.title}>Review {review.reviewee.firstName}</Text>
          <Text style={styles.copy}>{promptForRole(review)}</Text>
        </View>

        <Card shadow={false} padding={space.lg} contentStyle={styles.itemRow}>
          <Thumb
            size={THUMB}
            source={listingImageUrl ? { uri: fillImageUrl(listingImageUrl, { width: THUMB, height: THUMB }) } : undefined}
            initials={categoryAbbreviation(review.booking.listing.category)}
            initialsSize={15}
          />
          <View style={styles.flex}>
            <Text style={styles.itemTitle} numberOfLines={2}>
              {review.booking.listing.title}
            </Text>
            <Text style={styles.caption}>
              {formatRentalDate(review.booking.startDate, 'long')} – {formatRentalDate(review.booking.endDate, 'long')}
            </Text>
          </View>
        </Card>

        <Card shadow={false} contentStyle={styles.metrics}>
          {scoreRows.map((row) => (
            <View key={row.key} style={styles.metricBlock}>
              <Text style={styles.metricLabel}>{row.label}</Text>
              <View style={styles.scaleRow}>
                {SCALE.map((value) => {
                  const active = scores[row.key] === value
                  const box = (
                    <View style={[styles.scaleBox, active ? styles.scaleBoxActive : null]}>
                      <Text style={[styles.scaleText, active ? styles.scaleTextActive : null]}>{value}</Text>
                    </View>
                  )
                  return (
                    <Pressable
                      key={value}
                      style={styles.scaleCell}
                      onPress={() => setScores((current) => ({ ...current, [row.key]: value }))}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`${row.label} ${value} out of 5`}
                    >
                      {active ? (
                        <HardShadow offset="xs" radius={radius.thumbSm}>
                          {box}
                        </HardShadow>
                      ) : (
                        <View style={styles.scaleUnshadowed}>{box}</View>
                      )}
                    </Pressable>
                  )
                })}
              </View>
            </View>
          ))}
        </Card>

        {isBorrower ? (
          <Card shadow={false} contentStyle={styles.metrics}>
            <Text style={styles.metricLabel}>How was the item itself?</Text>
            <View style={styles.starRow}>
              {SCALE.map((value) => {
                const filled = value <= itemRating
                return (
                  <Pressable
                    key={value}
                    onPress={() => setItemRating(value)}
                    disabled={busy}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityState={{ selected: filled }}
                    accessibilityLabel={`Rate the item ${value} out of 5 stars`}
                    style={[styles.star, filled ? styles.starFilled : null]}
                  >
                    <Feather name="star" size={22} color={colors.ink} />
                  </Pressable>
                )
              })}
            </View>
            <TextField
              label="Notes about the item"
              value={itemNotes}
              onChangeText={setItemNotes}
              editable={!busy}
              multiline
              maxLength={280}
              placeholder="How did the item hold up? Anything the next renter should know?"
            />
          </Card>
        ) : (
          <TextField
            label="Anything else you'd like to note about this renter?"
            value={personNotes}
            onChangeText={setPersonNotes}
            editable={!busy}
            multiline
            maxLength={280}
            placeholder="Optional — how did they handle pickup, return, and communication?"
          />
        )}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { gap: space.screen, paddingTop: space.sm },
  hero: { gap: space.md },
  title: { ...type.h1, color: colors.ink },
  copy: { ...type.body, color: colors.mutedAlt },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  flex: { flex: 1, gap: 2 },
  itemTitle: { ...type.body, fontFamily: fonts.bold, lineHeight: 20, color: colors.ink },
  caption: { ...type.caption, color: colors.mutedAlt },
  metrics: { gap: space.xxl },
  metricBlock: { gap: space.sm },
  metricLabel: { ...type.label, color: colors.ink },
  scaleRow: { flexDirection: 'row', gap: space.sm },
  scaleCell: { flex: 1 },
  scaleUnshadowed: { paddingRight: shadow.xs, paddingBottom: shadow.xs },
  scaleBox: {
    height: 44,
    borderRadius: radius.thumbSm,
    borderWidth: border.thin,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scaleBoxActive: { backgroundColor: colors.green, borderWidth: border.base },
  scaleText: { ...type.label, color: colors.ink },
  scaleTextActive: { fontFamily: fonts.black },
  starRow: { flexDirection: 'row', gap: space.sm },
  star: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: border.thin,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starFilled: { backgroundColor: colors.lime },
})
