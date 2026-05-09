import React, { useMemo, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import ScreenBackground from '../components/ScreenBackground'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { getPendingReviews, submitReview } from '../services/reviewsApi'
import { PendingReview } from '../types'
import { theme } from '../theme/colors'

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
  }

  return labels[key] ?? key
}

function promptForRole(review: PendingReview) {
  if (review.reviewerRole === 'RENTER') {
    return 'Help keep Zoink trustworthy for everyone by reviewing how this item was listed and handed off.'
  }

  return 'Help keep Zoink trustworthy for everyone by reviewing how this renter handled the handoff and return.'
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
  const [scores, setScores] = useState(defaultScores())
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

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

    setBusy(true)
    try {
      const result = await submitReview({
        obligationId: review.id,
        scoreA: scores.scoreA,
        scoreB: scores.scoreB,
        scoreC: scores.scoreC,
        comment,
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
    <ScreenBackground>
      <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Trust check</Text>
        <Text style={styles.title}>Review {review.reviewee.firstName}</Text>
        <Text style={styles.copy}>{promptForRole(review)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{review.booking.listing.title}</Text>
        <Text style={styles.sectionMeta}>
          {new Date(review.booking.startDate).toLocaleDateString()} - {new Date(review.booking.endDate).toLocaleDateString()}
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

        <Text style={styles.inputLabel}>Short note</Text>
        <TextInput
          value={comment}
          onChangeText={setComment}
          editable={!busy}
          multiline
          maxLength={280}
          placeholder="What should the next student know?"
          placeholderTextColor={theme.textMuted}
          style={styles.input}
        />
      </View>

      <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} disabled={busy}>
        {busy ? <ActivityIndicator color={theme.textOnPrimary} /> : <Text style={styles.submitText}>Submit review</Text>}
      </TouchableOpacity>
      </ScrollView>
    </ScreenBackground>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingTop: 72, paddingBottom: 40, gap: 16 },
  hero: { gap: 10 },
  eyebrow: { color: theme.primary, fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0 },
  title: { color: theme.text, fontSize: 30, fontWeight: '900' },
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

