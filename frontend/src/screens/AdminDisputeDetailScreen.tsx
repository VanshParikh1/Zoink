import React, { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import Feather from '@expo/vector-icons/Feather'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { getBookingEvents, getDisputeDetail, resolveDispute, ResolveDisputePayload } from '../services/adminApi'
import { AdminDisputeDetail, BookingEvent } from '../types'
import { queryKeys } from '../services/queryKeys'
import { useRefreshOnFocus, usePagedList } from '../hooks/usePagedList'
import { colors } from '../theme/colors'
import { border, radius, space } from '../theme/tokens'
import { fonts, type } from '../theme/typography'
import Screen from '../components/mockup/Screen'
import ScreenHeader from '../components/mockup/ScreenHeader'
import Card from '../components/mockup/Card'
import Chip from '../components/mockup/Chip'
import Badge from '../components/mockup/Badge'
import Button from '../components/mockup/Button'
import TextField from '../components/mockup/TextField'
import { GroupLabel, ListRow, RowGroup } from '../components/mockup/RowGroup'
import { disputeStatusBadge } from '../components/mockup/adminStatus'
import { fillImageUrl } from '../utils/cloudinaryImage'
import { toast } from '../services/toast'
import { DetailFallbackScreen, DetailLoadingScreen, isWaitingOffline, LoadFailedPanel } from '../components/LoadStates'
import { SkeletonCard } from '../components/mockup/Skeleton'
import FieldMessage from '../components/mockup/FieldMessage'
import { useSubmit } from '../hooks/useSubmit'
import { FieldErrors, hasErrors, validateResolution } from '../utils/formValidation'

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
  if (accent === 'success') return colors.green
  if (accent === 'warning') return colors.warning
  if (accent === 'danger') return colors.danger
  return colors.tan
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

  const queryClient = useQueryClient()
  const disputeQuery = useQuery({ queryKey: queryKeys.adminDispute(disputeId), queryFn: () => getDisputeDetail(disputeId) })
  useRefreshOnFocus(queryKeys.adminDispute(disputeId))
  const dispute = disputeQuery.data ?? null
  const loading = disputeQuery.isPending
  const [resolution, setResolution] = useState<ResolveDisputePayload['status'] | null>(null)
  const [notes, setNotes] = useState('')
  const [refundAmountInput, setRefundAmountInput] = useState('')
  const [errors, setErrors] = useState<FieldErrors<'resolution' | 'notes' | 'amount'>>({})

  // The booking's audit trail, a page at a time, once it's opened.
  const [auditExpanded, setAuditExpanded] = useState(false)
  const eventsFeed = usePagedList<BookingEvent>(
    queryKeys.bookingEvents(dispute?.bookingId ?? ''),
    (cursor) => getBookingEvents(dispute!.bookingId, cursor),
    { enabled: auditExpanded && dispute !== null }
  )
  const events = auditExpanded && !eventsFeed.loading ? eventsFeed.items : null
  const eventsLoading = auditExpanded && eventsFeed.loading

  function handleToggleAuditTrail() {
    setAuditExpanded((expanded) => !expanded)
  }

  function handleSelectResolution(value: ResolveDisputePayload['status']) {
    setResolution(value)
    if (value === 'RESOLVED_REFUND' && !refundAmountInput && dispute) {
      setRefundAmountInput(Number(getRefundCapAmount(dispute.booking)).toFixed(2))
    }
  }

  // Guarded: a second tap while it sends is dropped (it moves money).
  const [handleResolve, busy] = useSubmit(async () => {
    const isRefund = resolution === 'RESOLVED_REFUND'
    const capDollars = dispute ? Number(getRefundCapAmount(dispute.booking)) : 0
    const nextErrors = validateResolution({
      resolution,
      notes,
      minNotes: MIN_NOTES_LENGTH,
      amount: isRefund ? { input: refundAmountInput, capDollars } : undefined,
    })
    setErrors(nextErrors)
    if (hasErrors(nextErrors) || !resolution) return
    const refundAmountCents = isRefund ? Math.round(Number(refundAmountInput) * 100) : undefined

    try {
      // The resolve endpoint returns the bare dispute row (no booking/user relations),
      // unlike getDisputeDetail — refetch so booking/photos stay populated afterward.
      await resolveDispute(disputeId, {
        status: resolution,
        resolutionNotes: notes.trim(),
        ...(refundAmountCents !== undefined ? { refundAmountCents } : {}),
      })
      await queryClient.invalidateQueries({ queryKey: queryKeys.adminDispute(disputeId) })
      queryClient.invalidateQueries({ queryKey: ['admin'] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      toast.success('Dispute resolved.')
    } catch (err: any) {
      toast.failure(err, { action: "Couldn't resolve this dispute. Please try again." })
    }
  })

  const header = <ScreenHeader title="Dispute" back />

  if (loading && !isWaitingOffline(disputeQuery)) return <DetailLoadingScreen title="Dispute" header={header} />

  if (!dispute) {
    return (
      <DetailFallbackScreen
        query={disputeQuery}
        title="Dispute"
        what="this dispute"
        header={header}
        unavailable={{ title: "This dispute isn't available.", body: 'It may have been removed. The dispute queue has the current ones.' }}
      />
    )
  }

  const isActive = ACTIVE_STATUSES.includes(dispute.status)
  const hasPickupPhotos = dispute.booking.pickupPhotos.length > 0
  const hasReturnPhotos = dispute.booking.returnPhotos.length > 0
  const refundCapAmount = getRefundCapAmount(dispute.booking)
  const refundExceedsTotal =
    resolution === 'RESOLVED_REFUND' &&
    refundAmountInput.trim() !== '' &&
    Number.isFinite(Number(refundAmountInput)) &&
    Math.round(Number(refundAmountInput) * 100) > Math.round(Number(refundCapAmount) * 100)
  const isDepositCapture = dispute.booking.status === 'COMPLETED'
  const badge = disputeStatusBadge(dispute.status)
  // Status banner: surface while open, lime once resolved, tan when dismissed.
  const bannerStyle = isActive ? null : dispute.status === 'DISMISSED' ? styles.bannerTan : styles.bannerLime

  const photoStrip = (urls: string[]) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
      {urls.map((url, idx) => (
        <Pressable
          key={url}
          accessibilityRole="imagebutton"
          accessibilityLabel={`Photo ${idx + 1} of ${urls.length}`}
          onPress={() => nav.navigate('PhotoViewer', { photos: urls, initialIndex: idx })}
        >
          <Image source={{ uri: fillImageUrl(url, { width: 144, height: 144 }) }} style={styles.photoThumb} contentFit="cover" />
        </Pressable>
      ))}
    </ScrollView>
  )

  return (
    <Screen
      keyboardAvoiding
      header={header}
      contentStyle={styles.content}
      footer={isActive ? <Button label="Submit resolution" onPress={handleResolve} loading={busy} /> : undefined}
    >
      <Card shadow={false} padding={space.xxl} contentStyle={[styles.banner, bannerStyle]}>
        <View style={styles.bannerRow}>
          <Text style={styles.bannerTitle}>{REASON_LABELS[dispute.reason] ?? dispute.reason}</Text>
          <Badge label={badge.label} variant={badge.variant} />
        </View>
        {!isActive ? (
          <>
            {/* This dispute may have been resolved while the booking was still ACTIVE
                (refund path) — booking.status here reflects the booking's CURRENT
                status, which can have moved on to COMPLETED since, so it can't safely
                be used to say which path a past resolution took. Generic wording only. */}
            <Text style={styles.bannerBody}>{OUTCOME_LABELS[dispute.status] ?? dispute.status}</Text>
            {dispute.status === 'RESOLVED_REFUND' && dispute.refundAmountCents != null ? (
              <Text style={styles.bannerStrong}>Refunded ${(dispute.refundAmountCents / 100).toFixed(2)}</Text>
            ) : null}
            {dispute.resolutionNotes ? <Text style={styles.bannerBody}>{dispute.resolutionNotes}</Text> : null}
            {dispute.resolvedByAdmin ? (
              <Text style={styles.caption}>Resolved by {dispute.resolvedByAdmin.firstName} · {dispute.resolvedByAdmin.email}</Text>
            ) : null}
            {dispute.resolvedAt ? <Text style={styles.caption}>{new Date(dispute.resolvedAt).toLocaleString()}</Text> : null}
          </>
        ) : null}
      </Card>

      <GroupLabel>Report</GroupLabel>
      <RowGroup>
        <ListRow icon="user" label={dispute.raisedByUser.firstName} value={dispute.raisedByUser.email} />
        <ListRow icon="calendar" label="Filed" value={new Date(dispute.createdAt).toLocaleString()} />
      </RowGroup>
      <Card shadow={false} padding={space.xxl}>
        <Text style={styles.body}>{dispute.description}</Text>
      </Card>

      <GroupLabel>Booking</GroupLabel>
      <RowGroup>
        <ListRow icon="activity" label="Status" right={<Text style={styles.value}>{dispute.booking.status}</Text>} />
        <ListRow icon="credit-card" label="Payment status" right={<Text style={styles.value}>{dispute.booking.paymentStatus}</Text>} />
        <ListRow icon="dollar-sign" label="Total" right={<Text style={styles.value}>${Number(dispute.booking.totalPrice).toFixed(2)}</Text>} />
      </RowGroup>

      <GroupLabel>Photos</GroupLabel>
      <Card shadow={false} padding={space.xxl} contentStyle={styles.stack}>
        {!hasPickupPhotos && !hasReturnPhotos ? (
          <Text style={styles.body}>No before or after photos available.</Text>
        ) : (
          <>
            <Text style={styles.eyebrow}>Before (pickup)</Text>
            {hasPickupPhotos ? photoStrip(dispute.booking.pickupPhotos) : <Text style={styles.body}>No before photos available.</Text>}
            <Text style={styles.eyebrow}>After (return)</Text>
            {hasReturnPhotos ? photoStrip(dispute.booking.returnPhotos) : <Text style={styles.body}>No after photos available.</Text>}
          </>
        )}
      </Card>

      {isActive ? (
        <>
          <GroupLabel>Resolve this dispute</GroupLabel>
          <View style={styles.chips}>
            {getResolutionOptions(isDepositCapture).map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                active={resolution === option.value}
                onPress={
                  busy
                    ? undefined
                    : () => {
                        handleSelectResolution(option.value)
                        setErrors((current) => ({ ...current, resolution: undefined, amount: undefined }))
                      }
                }
              />
            ))}
          </View>
          <FieldMessage message={errors.resolution} />

          {resolution === 'RESOLVED_REFUND' ? (
            <View style={styles.stack}>
              <TextField
                label={isDepositCapture ? 'Deposit charge amount' : 'Refund amount'}
                value={refundAmountInput}
                onChangeText={(value) => {
                  setRefundAmountInput(value)
                  setErrors((current) => ({ ...current, amount: undefined }))
                }}
                editable={!busy}
                kind="money"
                placeholder="0.00"
                variant="boxed"
                error={refundExceedsTotal ? `Can't be more than $${Number(refundCapAmount).toFixed(2)}.` : errors.amount}
                validated
              />
              <Text style={styles.caption}>
                Up to the {isDepositCapture ? 'deposit' : 'booking total'} of ${Number(refundCapAmount).toFixed(2)}. Defaults to the full amount — edit to issue a partial {isDepositCapture ? 'charge' : 'refund'}.
              </Text>
            </View>
          ) : null}

          <TextField
            label="Resolution notes"
            value={notes}
            onChangeText={(value) => {
              setNotes(value)
              setErrors((current) => ({ ...current, notes: undefined }))
            }}
            error={errors.notes}
            validated
            editable={!busy}
            multiline
            maxLength={1000}
            placeholder="Explain the decision — this is stored on the dispute record."
          />
        </>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: auditExpanded }}
        onPress={handleToggleAuditTrail}
        style={({ pressed }) => [styles.auditToggle, pressed ? styles.pressed : null]}
      >
        <GroupLabel>Audit trail</GroupLabel>
        {events && events.length > 0 ? <Badge label={String(events.length)} variant="surface" /> : null}
        <View style={styles.flex} />
        <Feather name={auditExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.mutedAlt} />
      </Pressable>

      {auditExpanded ? (
        eventsLoading ? (
          <View style={styles.auditSkeleton} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </View>
        ) : eventsFeed.error || eventsFeed.offline ? (
          <LoadFailedPanel error={eventsFeed.error} offline={eventsFeed.offline} what="the audit trail" onRetry={eventsFeed.retry} />
        ) : !events || events.length === 0 ? (
          <Text style={styles.body}>No events recorded for this booking.</Text>
        ) : (
          <View>
            {events.map((event, index) => {
              const metadataEntries = formatMetadataEntries(event.metadata)
              const eventDate = new Date(event.createdAt)
              const last = index === events.length - 1
              return (
                <View key={event.id} style={styles.event}>
                  <View style={styles.rail}>
                    <View style={[styles.dot, { backgroundColor: eventAccentColor(event.type) }]} />
                    {!last ? <View style={styles.line} /> : null}
                  </View>
                  <View style={[styles.eventBody, !last ? styles.eventGap : null]}>
                    <View style={styles.bannerRow}>
                      <Text style={styles.eventType}>{EVENT_LABELS[event.type] ?? event.type.replace(/_/g, ' ')}</Text>
                      <Text style={styles.caption}>
                        {eventDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{'  '}
                        {eventDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                      </Text>
                    </View>
                    <Text style={styles.caption}>{event.actorId ? `Actor · ${event.actorId}` : 'System · automated'}</Text>
                    {metadataEntries ? (
                      <Card shadow={false} padding={space.md} contentStyle={styles.metaBox}>
                        {metadataEntries.map((entry) => (
                          <View key={entry.key} style={styles.metaRow}>
                            <Text style={styles.metaKey}>{entry.key}</Text>
                            <Text style={styles.metaValue} numberOfLines={2}>{entry.value}</Text>
                          </View>
                        ))}
                      </Card>
                    ) : null}
                  </View>
                </View>
              )
            })}
            {eventsFeed.hasMore ? (
              <Button label="Load more" variant="secondary" size="sm" loading={eventsFeed.loadingMore} onPress={eventsFeed.loadMore} />
            ) : null}
          </View>
        )
      ) : null}
    </Screen>
  )
}

const DOT = 12

const styles = StyleSheet.create({
  auditSkeleton: {
    gap: space.md,
  },
  centered: { alignItems: 'center', justifyContent: 'center' },
  content: { gap: space.lg },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  stack: { gap: space.sm },
  banner: { gap: space.sm },
  bannerLime: { backgroundColor: colors.lime },
  bannerTan: { backgroundColor: colors.tan },
  bannerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.lg },
  bannerTitle: { ...type.section, color: colors.ink, flex: 1 },
  bannerBody: { ...type.bodySm, color: colors.ink },
  bannerStrong: { ...type.bodySm, fontFamily: fonts.bold, color: colors.ink },
  body: { ...type.bodySm, color: colors.muted },
  caption: { ...type.caption, color: colors.mutedAlt },
  eyebrow: { ...type.eyebrow, color: colors.mutedAlt },
  value: { ...type.label, color: colors.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  photoRow: { gap: space.md },
  photoThumb: {
    width: 72,
    height: 72,
    borderRadius: radius.thumb,
    borderWidth: border.thin,
    borderColor: colors.ink,
    backgroundColor: colors.tan,
  },
  auditToggle: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  event: { flexDirection: 'row', gap: space.lg },
  rail: { width: DOT, alignItems: 'center' },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: border.thin, borderColor: colors.ink, marginTop: 4 },
  line: { flex: 1, width: border.thin, backgroundColor: colors.ink, marginVertical: 2 },
  eventBody: { flex: 1, gap: 4 },
  eventGap: { paddingBottom: space.xxl },
  eventType: { ...type.label, color: colors.ink, flex: 1 },
  metaBox: { gap: 4, marginTop: 4 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.lg },
  metaKey: { ...type.caption, fontFamily: fonts.bold, color: colors.mutedAlt },
  metaValue: { ...type.caption, fontFamily: fonts.mono, color: colors.ink, flexShrink: 1, textAlign: 'right' },
})
