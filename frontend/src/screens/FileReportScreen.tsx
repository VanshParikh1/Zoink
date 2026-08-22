import React, { useState } from 'react'
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { createReport } from '../services/reportsApi'
import { ReportReason } from '../types'
import { theme } from '../theme/colors'
import ScreenBackground from '../components/ScreenBackground'
import DismissKeyboardView from '../components/DismissKeyboardView'

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
    <DismissKeyboardView>
      <ScreenBackground>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content}>
          <TouchableOpacity onPress={() => nav.goBack()}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          <Text style={styles.title}>{targetType === 'LISTING' ? 'Report this listing' : 'Report this user'}</Text>
          {targetLabel ? <Text style={styles.subtitle}>{targetLabel}</Text> : null}
          <Text style={styles.copy}>
            Let us know what's wrong. Our team will review your report — this is separate from booking disputes.
          </Text>

          <View style={styles.card}>
            <Text style={styles.label}>What's the issue?</Text>
            <View style={styles.chipsColumn}>
              {REASON_OPTIONS.map((option) => {
                const isSelected = reason === option.value
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.chip, isSelected ? styles.chipSelected : null]}
                    onPress={() => setReason(option.value)}
                    disabled={busy}
                  >
                    <Text style={[styles.chipText, isSelected ? styles.chipTextSelected : null]}>{option.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <Text style={styles.label}>Details (optional)</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              editable={!busy}
              multiline
              maxLength={1000}
              placeholder="Add any details that could help us review this."
              placeholderTextColor={theme.textMuted}
              style={styles.input}
            />
          </View>

          <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} disabled={busy}>
            {busy ? <ActivityIndicator color={theme.textOnPrimary} /> : <Text style={styles.submitText}>Submit report</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
      </ScreenBackground>
    </DismissKeyboardView>
  )
}

const styles = StyleSheet.create({
  content: { padding: 24, paddingTop: 64, paddingBottom: 40, gap: 16 },
  backText: { color: theme.textMuted, fontSize: 14, fontWeight: '700', marginBottom: 4 },
  title: { ...theme.type.screenTitle },
  subtitle: { color: theme.primary, fontSize: 15, fontWeight: '800' },
  copy: { color: theme.textMuted, fontSize: 15, lineHeight: 22 },
  card: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius.sm,
    padding: 18,
    borderWidth: theme.hard.border,
    borderColor: theme.hard.ink,
    ...theme.shadowMdElevation,
    gap: 12,
  },
  label: { color: theme.text, fontSize: 15, fontWeight: '900' },
  chipsColumn: { gap: 10 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: theme.radius.sm,
    borderWidth: theme.hard.borderThin,
    borderColor: theme.hard.ink,
    backgroundColor: theme.surfaceSubdued,
  },
  chipSelected: {
    backgroundColor: theme.primarySurface,
  },
  chipText: { color: theme.text, fontSize: 14, fontWeight: '700' },
  chipTextSelected: { color: theme.primaryDeep, fontWeight: '900' },
  input: {
    minHeight: 120,
    borderRadius: theme.radius.sm,
    borderWidth: theme.hard.borderThin,
    borderColor: theme.hard.ink,
    backgroundColor: theme.screen,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.text,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: theme.primary,
    minHeight: 54,
    borderRadius: theme.radius.sm,
    borderWidth: theme.hard.border,
    borderColor: theme.hard.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: { color: theme.textOnPrimary, fontSize: 16, fontWeight: '900' },
})
