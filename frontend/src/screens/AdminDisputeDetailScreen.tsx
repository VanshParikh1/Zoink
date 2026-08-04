import React, { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import ScreenBackground from '../components/ScreenBackground'
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { getBookingEvents, getDisputeDetail, resolveDispute, ResolveDisputePayload } from '../services/adminApi'
import { AdminDisputeDetail, BookingEvent } from '../types'
import { theme } from '../theme/colors'

type Nav = NativeStackNavigationProp<RootStackParamList>
type ScreenRoute = RouteProp<RootStackParamList, 'AdminDisputeDetail'>

const MIN_NOTES_LENGTH = 1

const REASON_LABELS: Record<string, string> = {
  ITEM_DAMAGED: 'Item was damaged',
  ITEM_NOT_RETURNED: 'Item was not returned',
  ITEM_NOT_AS_DESCRIBED: 'Item not as described',
  PAYMENT_ISSUE: 'Payment issue',
  OTHER: 'Other',
}

const RESOLUTION_OPTIONS: { value: ResolveDisputePayload['status']; label: string }[] = [
  { value: 'RESOLVED_REFUND', label: 'Refund the renter' },
  { value: 'RESOLVED_NO_ACTION', label: 'No action needed' },
  { value: 'DISMISSED', label: 'Dismiss dispute' },
]

const OUTCOME_LABELS: Record<string, string> = {
  RESOLVED_REFUND: 'Resolved: refund issued',
  RESOLVED_NO_ACTION: 'Resolved: no action taken',
  DISMISSED: 'Dismissed',
}

const ACTIVE_STATUSES = ['OPEN', 'UNDER_REVIEW']

export default function AdminDisputeDetailScreen() {
  const nav = useNavigation<Nav>()
  const route = useRoute<ScreenRoute>()
  const { disputeId } = route.params

  const [dispute, setDispute] = useState<AdminDisputeDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [resolution, setResolution] = useState<ResolveDisputePayload['status'] | null>(null)
  const [notes, setNotes] = useState('')
  const [refundAmountInput, setRefundAmountInput] = useState('')
  const [busy, setBusy] = useState(false)

  const [auditExpanded, setAuditExpanded] = useState(false)
  const [events, setEvents] = useState<BookingEvent[] | null>(null)
  const [eventsLoading, setEventsLoading] = useState(false)

  const loadDispute = useCallback(async () => {
    try {
      const next = await getDisputeDetail(disputeId)
      setDispute(next)
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not load this dispute.')
      nav.goBack()
    } finally {
      setLoading(false)
    }
  }, [disputeId, nav])

  useFocusEffect(
    useCallback(() => {
      loadDispute()
    }, [loadDispute])
  )

  async function handleToggleAuditTrail() {
    const willExpand = !auditExpanded
    setAuditExpanded(willExpand)
    if (willExpand && events === null && dispute) {
      setEventsLoading(true)
      try {
        const bookingEvents = await getBookingEvents(dispute.bookingId)
        setEvents(bookingEvents)
      } catch (err: any) {
        Alert.alert('Error', err?.response?.data?.error ?? 'Could not load the audit trail.')
      } finally {
        setEventsLoading(false)
      }
    }
  }

  function handleSelectResolution(value: ResolveDisputePayload['status']) {
    setResolution(value)
    if (value === 'RESOLVED_REFUND' && !refundAmountInput && dispute) {
      setRefundAmountInput(Number(dispute.booking.totalPrice).toFixed(2))
    }
  }

  async function handleResolve() {
    if (!resolution) {
      Alert.alert('Choose an outcome', 'Select how this dispute should be resolved.')
      return
    }
    if (notes.trim().length < MIN_NOTES_LENGTH) {
      Alert.alert('Notes required', 'Add a short note explaining this resolution.')
      return
    }

    let refundAmountCents: number | undefined
    if (resolution === 'RESOLVED_REFUND') {
      const totalPriceCents = Math.round(Number(dispute!.booking.totalPrice) * 100)
      const dollars = Number(refundAmountInput)
      const cents = Math.round(dollars * 100)

      if (!refundAmountInput.trim() || !Number.isFinite(dollars) || cents <= 0) {
        Alert.alert('Invalid refund amount', 'Enter a refund amount greater than $0.')
        return
      }
      if (cents > totalPriceCents) {
        Alert.alert(
          'Invalid refund amount',
          `Refund cannot exceed the booking total of $${Number(dispute!.booking.totalPrice).toFixed(2)}.`
        )
        return
      }
      refundAmountCents = cents
    }

    setBusy(true)
    try {
      // The resolve endpoint returns the bare dispute row (no booking/user relations),
      // unlike getDisputeDetail — refetch so booking/photos stay populated afterward.
      await resolveDispute(disputeId, {
        status: resolution,
        resolutionNotes: notes.trim(),
        ...(refundAmountCents !== undefined ? { refundAmountCents } : {}),
      })
      await loadDispute()
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not resolve this dispute.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    )
  }

  if (!dispute) return null

  const isActive = ACTIVE_STATUSES.includes(dispute.status)
  const hasPickupPhotos = dispute.booking.pickupPhotos.length > 0
  const hasReturnPhotos = dispute.booking.returnPhotos.length > 0

  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => nav.goBack()}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>{REASON_LABELS[dispute.reason] ?? dispute.reason}</Text>
        <Text style={styles.subtitle}>{dispute.status.replace(/_/g, ' ')}</Text>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Reported by</Text>
          <Text style={styles.value}>{dispute.raisedByUser.firstName} · {dispute.raisedByUser.email}</Text>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.bodyText}>{dispute.description}</Text>
          <Text style={styles.sectionTitle}>Filed</Text>
          <Text style={styles.value}>{new Date(dispute.createdAt).toLocaleString()}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Booking</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Status</Text>
            <Text style={styles.value}>{dispute.booking.status}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Payment status</Text>
            <Text style={styles.value}>{dispute.booking.paymentStatus}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Total</Text>
            <Text style={styles.value}>${Number(dispute.booking.totalPrice).toFixed(2)}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Photos</Text>
          {!hasPickupPhotos && !hasReturnPhotos ? (
            <Text style={styles.bodyText}>No before or after photos available.</Text>
          ) : (
            <>
              <Text style={styles.photoGroupLabel}>Before (pickup)</Text>
              {hasPickupPhotos ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
                  {dispute.booking.pickupPhotos.map((url, idx) => (
                    <TouchableOpacity
                      key={url}
                      onPress={() => nav.navigate('PhotoViewer', { photos: dispute.booking.pickupPhotos, initialIndex: idx })}
                    >
                      <Image source={{ uri: url }} style={styles.photoThumb} resizeMode="cover" />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : (
                <Text style={styles.bodyText}>No before photos available.</Text>
              )}

              <Text style={styles.photoGroupLabel}>After (return)</Text>
              {hasReturnPhotos ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
                  {dispute.booking.returnPhotos.map((url, idx) => (
                    <TouchableOpacity
                      key={url}
                      onPress={() => nav.navigate('PhotoViewer', { photos: dispute.booking.returnPhotos, initialIndex: idx })}
                    >
                      <Image source={{ uri: url }} style={styles.photoThumb} resizeMode="cover" />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : (
                <Text style={styles.bodyText}>No after photos available.</Text>
              )}
            </>
          )}
        </View>

        {!isActive ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{OUTCOME_LABELS[dispute.status] ?? dispute.status}</Text>
            {dispute.status === 'RESOLVED_REFUND' && dispute.refundAmountCents != null ? (
              <Text style={styles.value}>Refunded ${(dispute.refundAmountCents / 100).toFixed(2)}</Text>
            ) : null}
            {dispute.resolutionNotes ? <Text style={styles.bodyText}>{dispute.resolutionNotes}</Text> : null}
            {dispute.resolvedByAdmin ? (
              <Text style={styles.value}>Resolved by {dispute.resolvedByAdmin.firstName} · {dispute.resolvedByAdmin.email}</Text>
            ) : null}
            {dispute.resolvedAt ? <Text style={styles.value}>{new Date(dispute.resolvedAt).toLocaleString()}</Text> : null}
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Resolve this dispute</Text>
            <View style={styles.chipsColumn}>
              {RESOLUTION_OPTIONS.map((option) => {
                const isSelected = resolution === option.value
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.chip, isSelected ? styles.chipSelected : null]}
                    onPress={() => handleSelectResolution(option.value)}
                    disabled={busy}
                  >
                    <Text style={[styles.chipText, isSelected ? styles.chipTextSelected : null]}>{option.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            {resolution === 'RESOLVED_REFUND' ? (
              <>
                <Text style={styles.sectionTitle}>Refund amount</Text>
                <Text style={styles.bodyText}>
                  Up to the booking total of ${Number(dispute.booking.totalPrice).toFixed(2)}. Defaults to the full amount — edit to issue a partial refund.
                </Text>
                <TextInput
                  value={refundAmountInput}
                  onChangeText={setRefundAmountInput}
                  editable={!busy}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={theme.textMuted}
                  style={styles.input}
                />
              </>
            ) : null}

            <Text style={styles.sectionTitle}>Resolution notes</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              editable={!busy}
              multiline
              maxLength={1000}
              placeholder="Explain the decision — this is stored on the dispute record."
              placeholderTextColor={theme.textMuted}
              style={styles.input}
            />

            <TouchableOpacity style={styles.submitButton} onPress={handleResolve} disabled={busy}>
              {busy ? <ActivityIndicator color={theme.textOnPrimary} /> : <Text style={styles.submitText}>Submit resolution</Text>}
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.card}>
          <TouchableOpacity onPress={handleToggleAuditTrail}>
            <Text style={styles.sectionTitle}>Audit trail {auditExpanded ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {auditExpanded ? (
            eventsLoading ? (
              <ActivityIndicator color={theme.primary} />
            ) : !events || events.length === 0 ? (
              <Text style={styles.bodyText}>No events recorded for this booking.</Text>
            ) : (
              <View style={styles.chipsColumn}>
                {events.map((event) => (
                  <View key={event.id} style={styles.auditRow}>
                    <View style={styles.row}>
                      <Text style={styles.value}>{event.type.replace(/_/g, ' ')}</Text>
                      <Text style={styles.label}>{new Date(event.createdAt).toLocaleString()}</Text>
                    </View>
                    <Text style={styles.label}>Actor: {event.actorId ?? 'System'}</Text>
                    {event.metadata ? (
                      <Text style={styles.auditMetadata}>{JSON.stringify(event.metadata)}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            )
          ) : null}
        </View>
      </ScrollView>
    </ScreenBackground>
  )
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.screen },
  content: { padding: 24, paddingTop: 64, paddingBottom: 40, gap: 16 },
  backText: { color: theme.textMuted, fontSize: 14, fontWeight: '700', marginBottom: 4 },
  title: { ...theme.type.screenTitle },
  subtitle: { color: theme.primary, fontSize: 15, fontWeight: '800', textTransform: 'uppercase' },
  card: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius.sm,
    padding: 18,
    borderWidth: theme.hard.border,
    borderColor: theme.hard.ink,
    ...theme.shadowMdElevation,
    gap: 8,
  },
  sectionTitle: { color: theme.text, fontSize: 13, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 8 },
  bodyText: { color: theme.textMuted, fontSize: 15, lineHeight: 22 },
  photoGroupLabel: { color: theme.textMuted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 },
  photoRow: { gap: 10, paddingRight: 8, paddingBottom: 4 },
  photoThumb: { width: 120, height: 120, borderRadius: theme.radius.sm, backgroundColor: theme.surfaceSubdued, borderWidth: theme.hard.borderThin, borderColor: theme.hard.ink },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  label: { color: theme.textMuted, fontSize: 14, flex: 1 },
  value: { color: theme.text, fontSize: 14, fontWeight: '700' },
  chipsColumn: { gap: 10 },
  auditRow: {
    borderRadius: theme.radius.sm,
    borderWidth: theme.hard.borderThin,
    borderColor: theme.hard.ink,
    backgroundColor: theme.surfaceSubdued,
    padding: 12,
    gap: 4,
  },
  auditMetadata: { color: theme.textMuted, fontSize: 12, fontFamily: 'Courier' },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: theme.radius.sm,
    borderWidth: theme.hard.borderThin,
    borderColor: theme.hard.ink,
    backgroundColor: theme.surfaceSubdued,
  },
  chipSelected: { backgroundColor: theme.primarySurface },
  chipText: { color: theme.text, fontSize: 14, fontWeight: '700' },
  chipTextSelected: { color: theme.primaryDeep, fontWeight: '900' },
  input: {
    minHeight: 100,
    borderRadius: theme.radius.sm,
    borderWidth: theme.hard.borderThin,
    borderColor: theme.hard.ink,
    backgroundColor: theme.surface,
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
    marginTop: 4,
  },
  submitText: { color: theme.textOnPrimary, fontSize: 16, fontWeight: '900' },
})
