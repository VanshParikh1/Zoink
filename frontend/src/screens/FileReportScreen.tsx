import React, { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
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
import { toast } from '../services/toast'
import FieldMessage from '../components/mockup/FieldMessage'
import { useSubmit } from '../hooks/useSubmit'
import { FieldErrors, hasErrors, validateReport } from '../utils/formValidation'

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
  const [errors, setErrors] = useState<FieldErrors<'reason' | 'description'>>({})

  // Guarded: a second tap while it sends is dropped (two reports otherwise).
  const [handleSubmit, busy] = useSubmit(async () => {
    const nextErrors = validateReport({ reason, description }, MIN_DESCRIPTION_LENGTH)
    setErrors(nextErrors)
    if (hasErrors(nextErrors) || !reason) return
    const trimmed = description.trim()

    try {
      await createReport({
        targetType,
        targetId,
        reason,
        description: trimmed.length > 0 ? trimmed : undefined,
      })
      toast.success('Report sent. Thanks, our team will take a look.')
      nav.goBack()
    } catch (err: any) {
      toast.failure(err, { action: "Couldn't send this report. Please try again." })
    }
  })

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
              onPress={
                busy
                  ? undefined
                  : () => {
                      setReason(option.value)
                      setErrors((current) => ({ ...current, reason: undefined }))
                    }
              }
            />
          ))}
        </View>
        <FieldMessage message={errors.reason} />
      </View>

      <TextField
        label="Details (optional)"
        value={description}
        onChangeText={(value) => {
          setDescription(value)
          if (errors.description) setErrors((current) => ({ ...current, description: undefined }))
        }}
        error={errors.description}
        validated
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
