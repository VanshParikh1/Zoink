import React, { useState } from 'react'
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { createDispute } from '../services/disputesApi'
import { DisputeReason } from '../types'
import { theme } from '../theme/colors'
import ScreenBackground from '../components/ScreenBackground'
import DismissKeyboardView from '../components/DismissKeyboardView'

type Nav = NativeStackNavigationProp<RootStackParamList>
type ScreenRoute = RouteProp<RootStackParamList, 'FileDispute'>

const MIN_DESCRIPTION_LENGTH = 10

const REASON_OPTIONS: { value: DisputeReason; label: string }[] = [
  { value: 'ITEM_DAMAGED', label: 'Item was damaged' },
  { value: 'ITEM_NOT_RETURNED', label: 'Item was not returned' },
  { value: 'ITEM_NOT_AS_DESCRIBED', label: 'Item not as described' },
  { value: 'PAYMENT_ISSUE', label: 'Payment issue' },
  { value: 'OTHER', label: 'Other' },
]

export default function FileDisputeScreen() {
  const nav = useNavigation<Nav>()
  const route = useRoute<ScreenRoute>()
  const { bookingId, listingTitle } = route.params

  const [reason, setReason] = useState<DisputeReason | null>(null)
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit() {
    if (!reason) {
      Alert.alert('Choose a reason', 'Please select what went wrong.')
      return
    }

    if (description.trim().length < MIN_DESCRIPTION_LENGTH) {
      Alert.alert('More detail needed', `Please describe the issue in at least ${MIN_DESCRIPTION_LENGTH} characters.`)
      return
    }

    setBusy(true)
    try {
      await createDispute({ bookingId, reason, description: description.trim() })
      nav.goBack()
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not file this dispute.')
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

          <Text style={styles.title}>Report a problem</Text>
          {listingTitle ? <Text style={styles.subtitle}>{listingTitle}</Text> : null}
          <Text style={styles.copy}>
            Let us know what happened with this booking. Our team will review your report and follow up on a resolution.
          </Text>

          <View style={styles.card}>
            <Text style={styles.label}>What went wrong?</Text>
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

            <Text style={styles.label}>Details</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              editable={!busy}
              multiline
              maxLength={1000}
              placeholder="Describe what happened, including any relevant dates or details."
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
    borderRadius: 8,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.border,
    gap: 12,
  },
  label: { color: theme.text, fontSize: 15, fontWeight: '900' },
  chipsColumn: { gap: 10 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surfaceSubdued,
  },
  chipSelected: {
    backgroundColor: theme.primarySurface,
    borderColor: theme.primary,
  },
  chipText: { color: theme.textMuted, fontSize: 14, fontWeight: '700' },
  chipTextSelected: { color: theme.primaryDeep, fontWeight: '900' },
  input: {
    minHeight: 120,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: 'transparent',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.text,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: theme.primary,
    minHeight: 54,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: { color: theme.textOnPrimary, fontSize: 16, fontWeight: '900' },
})
