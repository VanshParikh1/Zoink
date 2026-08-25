import React, { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { getBookingEvents, getDisputeDetail, resolveDispute, ResolveDisputePayload } from '../services/adminApi'
import { AdminDisputeDetail, BookingEvent } from '../types'
import { theme } from '../theme/colors'
import ScreenBackground from '../components/ScreenBackground'
import DismissKeyboardView from '../components/DismissKeyboardView'

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

// On a COMPLETED booking, RESOLVED_REFUND charges the still-held deposit
// (a Stripe capture) rather than refunding the rental payment, which
// already settled at pickup — see disputeService.resolveDispute's
// COMPLETED branch. The label needs to say which one is actually happening.
// Only used for a dispute that is STILL BEING resolved (isActive) — at that
// point booking.status reliably predicts which path resolving now would
// take. For an already-resolved dispute, see the note by OUTCOME_LABELS below.
function getResolutionOptions(isDepositCapture: boolean): { value: ResolveDisputePayload['status']; label: string }[] {
  return [
    { value: 'RESOLVED_REFUND', label: isDepositCapture ? 'Charge the deposit' : 'Refund the renter' },
    { value: 'RESOLVED_NO_ACTION', label: 'No action needed' },
    { value: 'DISMISSED', label: 'Dismiss dispute' },
  ]
}

// Generic wording for an ALREADY-RESOLVED dispute — booking.status by then
// reflects the booking's CURRENT status, which can have moved on since the
// dispute was resolved (e.g. resolved while ACTIVE, booking later completed
// normally), so it can't safely be used to say which path that past
// resolution took without a dedicated field recording it. Deliberately
// vague ("refund issued") rather than confidently wrong.
const OUTCOME_LABELS: Record<string, string> = {
  RESOLVED_REFUND: 'Resolved: refund issued',
  RESOLVED_NO_ACTION: 'Resolved: no action taken',
  DISMISSED: 'Dismissed',
}

const ACTIVE_STATUSES = ['OPEN', 'UNDER_REVIEW']

// On a COMPLETED booking, resolving RESOLVED_REFUND charges the still-held
// deposit (a Stripe capture, see disputeService.resolveDispute's COMPLETED
// branch) — the cap there is depositAmount, not totalPrice. Every other
// status still takes the pre-completion refund path, capped at totalPrice
// (the rental payment), same as before.
function getRefundCapAmount(booking: Pick<AdminDisputeDetail['booking'], 'status' | 'totalPrice' | 'depositAmount'>): string {
  return booking.status === 'COMPLETED' ? booking.depositAmount : booking.totalPrice
}

const EVENT_LABELS: Record<string, string> = {
  STATUS_CHANGE: 'Status changed',
  PAYMENT_INTENT_CREATED: 'Payment intent created',
  PAYMENT_CAPTURED: 'Payment captured',
  PAYMENT_REFUNDED: 'Payment refunded',
  PAYOUT_TRIGGERED: 'Payout triggered',
  ZOINK_TAP: 'Zoink tap',
  UPLOAD_PHOTOS: 'Photos uploaded',
  DISPUTE_OPENED: 'Dispute opened',
  DISPUTE_RESOLVED: 'Dispute resolved',
  WEBHOOK_RECEIVED: 'Webhook received',
  RECONCILIATION_MATCH: 'Reconciliation matched',
  RECONCILIATION_MISMATCH: 'Reconciliation mismatch',
  ERROR: 'Error',
}

type EventAccent = 'neutral' | 'success' | 'warning' | 'danger'

const EVENT_ACCENTS: Record<string, EventAccent> = {
  PAYMENT_CAPTURED: 'success',
  PAYOUT_TRIGGERED: 'success',
  DISPUTE_RESOLVED: 'success',
  RECONCILIATION_MATCH: 'success',
  PAYMENT_REFUNDED: 'warning',
  DISPUTE_OPENED: 'warning',
  RECONCILIATION_MISMATCH: 'danger',
  ERROR: 'danger',
}

function eventAccentColor(type: string) {
  const accent: EventAccent = EVENT_ACCENTS[type] ?? 'neutral'
  if (accent === 'success') return theme.primaryDeep
  if (accent === 'warning') return theme.warning
  if (accent === 'danger') return theme.danger
  return theme.textMuted
}

// Event metadata is a small flat object in practice (e.g. { disputeId, reason }).
// Render it as readable key/value pairs; fall back to raw JSON for anything
// that isn't a plain object (arrays, primitives, nested error payloads).
function formatMetadataEntries(metadata: unknown): { key: string; value: string }[] | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null

  const entries = Object.entries(metadata as Record<string, unknown>)
  if (entries.length === 0) return null

  return entries.map(([key, value]) => ({
    key: key
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/^./, (c) => c.toUpperCase()),
    value: value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value),
  }))
}

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
      setRefundAmountInput(Number(getRefundCapAmount(dispute.booking)).toFixed(2))
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
      const capAmount = getRefundCapAmount(dispute!.booking)
      const capCents = Math.round(Number(capAmount) * 100)
      const dollars = Number(refundAmountInput)
      const cents = Math.round(dollars * 100)

      if (!refundAmountInput.trim() || !Number.isFinite(dollars) || cents <= 0) {
        Alert.alert('Invalid refund amount', 'Enter a refund amount greater than $0.')
        return
      }
      if (cents > capCents) {
        const isDepositCapture = dispute!.booking.status === 'COMPLETED'
        Alert.alert(
          isDepositCapture ? 'Charge too high' : 'Refund too high',
          `You cannot ${isDepositCapture ? 'charge' : 'refund'} more than the ${isDepositCapture ? 'deposit' : 'total'} amount of $${Number(capAmount).toFixed(2)}.`
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
  const refundCapAmount = getRefundCapAmount(dispute.booking)
  const refundExceedsTotal =
    resolution === 'RESOLVED_REFUND' &&
    refundAmountInput.trim() !== '' &&
    Number.isFinite(Number(refundAmountInput)) &&
    Math.round(Number(refundAmountInput) * 100) > Math.round(Number(refundCapAmount) * 100)

  return (
    <DismissKeyboardView>
      <ScreenBackground>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
            {/* This dispute may have been resolved while the booking was still ACTIVE
                (refund path) — booking.status here reflects the booking's CURRENT
                status, which can have moved on to COMPLETED since, so it can't safely
                be used to say which path a past resolution took. Generic wording only. */}
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
              {getResolutionOptions(dispute.booking.status === 'COMPLETED').map((option) => {
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
                <Text style={styles.sectionTitle}>
                  {dispute.booking.status === 'COMPLETED' ? 'Deposit charge amount' : 'Refund amount'}
                </Text>
                <Text style={styles.bodyText}>
                  Up to the {dispute.booking.status === 'COMPLETED' ? 'deposit' : 'booking total'} of ${Number(refundCapAmount).toFixed(2)}. Defaults to the full amount — edit to issue a partial {dispute.booking.status === 'COMPLETED' ? 'charge' : 'refund'}.
                </Text>
                <TextInput
                  value={refundAmountInput}
                  onChangeText={setRefundAmountInput}
                  editable={!busy}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={theme.textMuted}
                  style={[styles.input, refundExceedsTotal ? styles.inputError : null]}
                />
                {refundExceedsTotal ? (
                  <Text style={styles.errorNote}>
                    You cannot {dispute.booking.status === 'COMPLETED' ? 'charge' : 'refund'} more than the {dispute.booking.status === 'COMPLETED' ? 'deposit' : 'total'} amount of ${Number(refundCapAmount).toFixed(2)}.
                  </Text>
                ) : null}
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
          <TouchableOpacity onPress={handleToggleAuditTrail} style={styles.auditToggle} activeOpacity={0.7}>
            <View style={styles.auditToggleLeft}>
              <Text style={styles.sectionTitle}>Audit trail</Text>
              {events && events.length > 0 ? (
                <View style={styles.auditCountBadge}>
                  <Text style={styles.auditCountText}>{events.length}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.auditChevron}>{auditExpanded ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {auditExpanded ? (
            eventsLoading ? (
              <ActivityIndicator color={theme.primary} style={{ marginTop: 12 }} />
            ) : !events || events.length === 0 ? (
              <Text style={styles.bodyText}>No events recorded for this booking.</Text>
            ) : (
              <View style={styles.chipsColumn}>
                {events.map((event) => {
                  const accentColor = eventAccentColor(event.type)
                  const metadataEntries = formatMetadataEntries(event.metadata)
                  const eventDate = new Date(event.createdAt)

                  return (
                    <View key={event.id} style={styles.auditRow}>
                      <View style={styles.auditHeaderRow}>
                        <View style={styles.auditTypeRow}>
                          <View style={[styles.auditDot, { backgroundColor: accentColor }]} />
                          <Text style={[styles.auditEventType, { color: accentColor }]}>
                            {EVENT_LABELS[event.type] ?? event.type.replace(/_/g, ' ')}
                          </Text>
                        </View>
                        <Text style={styles.auditTime}>
                          {eventDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          {'  '}
                          {eventDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                        </Text>
                      </View>

                      <Text style={styles.auditActor}>
                        {event.actorId ? `Actor · ${event.actorId}` : 'System · automated'}
                      </Text>

                      {metadataEntries ? (
                        <View style={styles.auditMetadataBox}>
                          {metadataEntries.map((entry) => (
                            <View key={entry.key} style={styles.auditMetadataRow}>
                              <Text style={styles.auditMetadataKey}>{entry.key}</Text>
                              <Text style={styles.auditMetadataValue} numberOfLines={2}>
                                {entry.value}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  )
                })}
              </View>
            )
          ) : null}
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
      </ScreenBackground>
    </DismissKeyboardView>
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
  auditToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  auditToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  auditCountBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: theme.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  auditCountText: { color: theme.primaryDeep, fontSize: 11, fontWeight: '900' },
  auditChevron: { color: theme.textMuted, fontSize: 12 },
  auditRow: {
    borderRadius: theme.radius.sm,
    borderWidth: theme.hard.borderThin,
    borderColor: theme.hard.ink,
    backgroundColor: theme.surfaceSubdued,
    padding: 12,
    gap: 6,
  },
  auditHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  auditTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  auditDot: { width: 8, height: 8, borderRadius: 4 },
  auditEventType: { fontSize: 13, fontWeight: '800', textTransform: 'capitalize', flexShrink: 1 },
  auditTime: { color: theme.textMuted, fontSize: 12, fontWeight: '600' },
  auditActor: { color: theme.textMuted, fontSize: 12 },
  auditMetadataBox: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    gap: 4,
  },
  auditMetadataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  auditMetadataKey: { color: theme.textMuted, fontSize: 12, fontWeight: '700' },
  auditMetadataValue: {
    color: theme.text,
    fontSize: 12,
    fontFamily: 'Courier',
    flexShrink: 1,
    textAlign: 'right',
  },
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
  inputError: {
    borderColor: theme.danger,
  },
  errorNote: {
    color: theme.danger,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
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
