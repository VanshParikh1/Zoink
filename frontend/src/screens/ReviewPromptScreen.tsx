import React, { useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Feather } from '@expo/vector-icons'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { getPendingReviews, submitReview } from '../services/reviewsApi'
import { PendingReview } from '../types'
import { theme } from '../theme/colors'
import ScreenBackground from '../components/ScreenBackground'
import DismissKeyboardView from '../components/DismissKeyboardView'
import { formatLongDate } from '../utils/formatDate'

type Nav = NativeStackNavigationProp<RootStackParamList>
type ScreenRoute = RouteProp<RootStackParamList, 'ReviewPrompt'>

const SCALE = [1, 2, 3, 4, 5]

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

      if (result.pendingRemaining > 0) {
        const pending = await getPendingReviews()
        if (pending.length > 0) {
          nav.replace('ReviewPrompt', { review: pending[0] })
          return
        }
      }

      nav.reset({
        index: 0,
        routes: [{ name: 'MainApp' }],
      })
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not submit your review.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <DismissKeyboardView>
      <ScreenBackground>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Trust check</Text>
        <Text style={styles.title}>Review {review.reviewee.firstName}</Text>
        <Text style={styles.copy}>{promptForRole(review)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{review.booking.listing.title}</Text>
        <Text style={styles.sectionMeta}>
          {formatLongDate(review.booking.startDate)} - {formatLongDate(review.booking.endDate)}
        </Text>
      </View>

      <View style={styles.card}>
        {scoreRows.map((row) => (
          <View key={row.key} style={styles.metricBlock}>
            <Text style={styles.metricLabel}>{row.label}</Text>
            <View style={styles.scaleRow}>
              {SCALE.map((value) => {
                const active = scores[row.key] === value
                return (
                  <TouchableOpacity
                    key={value}
                    style={[styles.scaleButton, active ? styles.scaleButtonActive : null]}
                    onPress={() => setScores((current) => ({ ...current, [row.key]: value }))}
                    disabled={busy}
                  >
                    <Text style={[styles.scaleText, active ? styles.scaleTextActive : null]}>{value}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        ))}

      </View>

      {isBorrower ? (
        <View style={styles.card}>
          <View style={styles.itemPreviewRow}>
            {listingImageUrl ? (
              <Image source={{ uri: listingImageUrl }} style={styles.itemThumbnail} />
            ) : (
              <View style={styles.itemThumbnailPlaceholder}>
                <Text style={styles.itemThumbnailEmoji}>{review.booking.listing.category || '📦'}</Text>
              </View>
            )}
            <Text style={styles.itemPreviewTitle} numberOfLines={2}>{review.booking.listing.title}</Text>
          </View>

          <Text style={styles.metricLabel}>How was the item itself?</Text>
          <View style={styles.starRow}>
            {SCALE.map((value) => {
              const filled = value <= itemRating
              return (
                <TouchableOpacity
                  key={value}
                  onPress={() => setItemRating(value)}
                  disabled={busy}
                  style={styles.starButton}
                  accessibilityLabel={`Rate the item ${value} out of 5 stars`}
                >
                  <Feather name="star" size={30} color={filled ? theme.primary : theme.border} />
                </TouchableOpacity>
              )
            })}
          </View>

          <Text style={styles.inputLabel}>Notes about the item</Text>
          <TextInput
            value={itemNotes}
            onChangeText={setItemNotes}
            editable={!busy}
            multiline
            maxLength={280}
            placeholder="How did the item hold up? Anything the next renter should know?"
            placeholderTextColor={theme.textMuted}
            style={styles.input}
          />
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.inputLabel}>Anything else you'd like to note about this renter?</Text>
          <TextInput
            value={personNotes}
            onChangeText={setPersonNotes}
            editable={!busy}
            multiline
            maxLength={280}
            placeholder="Optional — how did they handle pickup, return, and communication?"
            placeholderTextColor={theme.textMuted}
            style={styles.input}
          />
        </View>
      )}

      <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} disabled={busy}>
        {busy ? <ActivityIndicator color={theme.textOnPrimary} /> : <Text style={styles.submitText}>Submit review</Text>}
      </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>
      </ScreenBackground>
    </DismissKeyboardView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingTop: theme.header.stackTop, paddingBottom: 40, gap: 16 },
  hero: { gap: 10 },
  eyebrow: { color: theme.primary, fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0 },
  title: { ...theme.type.screenTitle },
  copy: { color: theme.textMuted, fontSize: 15, lineHeight: 22 },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 18,
    gap: 16,
  },
  sectionTitle: { color: theme.text, fontSize: 17, fontWeight: '900' },
  sectionMeta: { color: theme.textMuted, fontSize: 14 },
  metricBlock: { gap: 10 },
  metricLabel: { color: theme.text, fontSize: 15, fontWeight: '800' },
  scaleRow: { flexDirection: 'row', gap: 10 },
  scaleButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  scaleButtonActive: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  scaleText: { color: theme.text, fontSize: 15, fontWeight: '800' },
  scaleTextActive: { color: theme.textOnPrimary },
  itemPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemThumbnail: { width: 56, height: 56, borderRadius: theme.radius.sm, borderWidth: theme.hard.borderThin, borderColor: theme.hard.ink },
  itemThumbnailPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.surfaceSubdued,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.hard.borderThin,
    borderColor: theme.hard.ink,
  },
  itemThumbnailEmoji: { fontSize: 22 },
  itemPreviewTitle: { flex: 1, color: theme.text, fontSize: 15, fontWeight: '800' },
  starRow: { flexDirection: 'row', gap: 6 },
  starButton: { padding: 4 },
  inputLabel: { color: theme.text, fontSize: 15, fontWeight: '800' },
  input: {
    minHeight: 110,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: 'transparent',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.text,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: theme.primary,
    minHeight: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: { color: theme.textOnPrimary, fontSize: 16, fontWeight: '900' },
})

