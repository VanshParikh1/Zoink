import React, { useState } from 'react'
import { Alert, StyleSheet, Text, View } from 'react-native'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { createReport } from '../services/reportsApi'
import { ReportReason, ReportTargetType } from '../types'
import { colors } from '../theme/colors'
import { space } from '../theme/tokens'
import { fonts, type } from '../theme/typography'
import Screen from '../components/mockup/Screen'
import ScreenHeader from '../components/mockup/ScreenHeader'
import Card from '../components/mockup/Card'
import Chip from '../components/mockup/Chip'
import TextField from '../components/mockup/TextField'
import Button from '../components/mockup/Button'

type Nav = NativeStackNavigationProp<RootStackParamList>
type ScreenRoute = RouteProp<RootStackParamList, 'FileReport'>

const MIN_DESCRIPTION_LENGTH = 10

const REASON_OPTIONS: { value: ReportReason; label: string }[] = [
  { value: 'SPAM', label: 'Spam' },
  { value: 'SCAM', label: 'Scam' },
  { value: 'INAPPROPRIATE', label: 'Inappropriate content' },
  { value: 'HARASSMENT', label: 'Harassment' },
  { value: 'OTHER', label: 'Other' },
]

const REPORT_TITLES: Record<ReportTargetType, string> = {
  USER: 'Report this user',
  LISTING: 'Report this listing',
  MESSAGE: 'Report this message',
}

export default function FileReportScreen() {
  const nav = useNavigation<Nav>()
  const route = useRoute<ScreenRoute>()
  const { targetType, targetId, targetLabel } = route.params

  const [reason, setReason] = useState<ReportReason | null>(null)
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit() {
    if (!reason) {
      Alert.alert('Choose a reason', 'Please select what went wrong.')
      return
    }

    const trimmed = description.trim()
    if (trimmed.length > 0 && trimmed.length < MIN_DESCRIPTION_LENGTH) {
      Alert.alert('More detail needed', `Please describe the issue in at least ${MIN_DESCRIPTION_LENGTH} characters, or leave it blank.`)
      return
    }

    setBusy(true)
    try {
      await createReport({
        targetType,
        targetId,
        reason,
        description: trimmed.length > 0 ? trimmed : undefined,
      })
      Alert.alert('Report submitted', 'Thanks — our team will take a look.')
      nav.goBack()
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not submit this report.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen
      keyboardAvoiding
      header={<ScreenHeader title={REPORT_TITLES[targetType]} back />}
      contentStyle={styles.content}
      footer={<Button label="Submit report" onPress={handleSubmit} loading={busy} />}
    >
      {targetLabel ? (
        <Card shadow={false} padding={space.lg}>
          <Text style={styles.target} numberOfLines={3}>{targetLabel}</Text>
        </Card>
      ) : null}

      <Text style={styles.copy}>
        Let us know what's wrong. Our team will review your report — this is separate from booking disputes.
      </Text>

      <View style={styles.field}>
        <Text style={styles.label}>What's the issue?</Text>
        <View style={styles.chips}>
          {REASON_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              active={reason === option.value}
              onPress={busy ? undefined : () => setReason(option.value)}
            />
          ))}
        </View>
      </View>

      <TextField
        label="Details (optional)"
        value={description}
        onChangeText={setDescription}
        editable={!busy}
        multiline
        maxLength={1000}
        placeholder="Add any details that could help us review this."
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: {
    gap: space.xxl,
  },
  target: {
    ...type.bodySm,
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  copy: {
    ...type.bodySm,
    color: colors.mutedAlt,
  },
  field: {
    gap: space.sm,
  },
  label: {
    ...type.labelSm,
    color: colors.ink,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
})
