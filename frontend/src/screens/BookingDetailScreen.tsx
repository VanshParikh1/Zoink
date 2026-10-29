import React, { useEffect, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { RouteProp, useIsFocused, useNavigation, useRoute } from '@react-navigation/native'
import { useQuery } from '@tanstack/react-query'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { COMMISSION_MIN_CENTS, COMMISSION_RATE, DEPOSIT_HOLD_HOURS, formatDateTime, isPickupPaymentReady, paymentOpensAt, PAYOUT_HOLD_HOURS } from '@zoink/shared'
import PickupPaymentNotice from '../components/PickupPaymentNotice'
import { RootStackParamList } from '../navigation'
import { acceptBooking, cancelBooking, declineBooking, getBooking, getHandoffPhotos } from '../services/bookingsApi'
import { getMyDisputeForBooking } from '../services/disputesApi'
import { queryKeys } from '../services/queryKeys'
import { applyBookingUpdate } from '../services/bookingCache'
import { useRefreshOnFocus } from '../hooks/usePagedList'
import { useAuth } from '../context/AuthContext'
import { Booking, DisputeStatus } from '../types'
import { colors } from '../theme/colors'
import { radius, space } from '../theme/tokens'
import { fonts, type } from '../theme/typography'
import { categoryAbbreviation } from '../config/categories'
import { fillImageUrl, limitImageUrl } from '../utils/cloudinaryImage'
import Screen from '../components/mockup/Screen'
import ScreenHeader from '../components/mockup/ScreenHeader'
import Button from '../components/mockup/Button'
import Card from '../components/mockup/Card'
import Thumb from '../components/mockup/Thumb'
import PriceTable, { PriceRow } from '../components/mockup/PriceTable'
import Timeline, { TimelineStep } from '../components/mockup/Timeline'
import { formatDayOf, formatRentalDate } from '@zoink/shared'
import { BOOKING_UNAVAILABLE, DetailFallbackScreen, DetailLoadingScreen, isWaitingOffline } from '../components/LoadStates'
import { toast } from '../services/toast'
import { useSubmit } from '../hooks/useSubmit'
import { confirmCancel, confirmDecline } from '../utils/confirmBookingChange'
import { haptics } from '../utils/haptics'

const DISPUTABLE_BOOKING_STATUSES = ['ACTIVE', 'PICKUP_PENDING', 'RETURN_PENDING', 'COMPLETED']
const ACTIVE_DISPUTE_STATUSES: DisputeStatus[] = ['OPEN', 'UNDER_REVIEW']
const RESOLVED_DISPUTE_STATUSES: DisputeStatus[] = ['RESOLVED_REFUND', 'RESOLVED_NO_ACTION', 'DISMISSED']

function disputeActiveLabel(status: DisputeStatus) {
  if (status === 'OPEN') return 'Dispute submitted — awaiting review'
  if (status === 'UNDER_REVIEW') return 'Dispute under review'
  return null
}

function disputeOutcomeLabel(status: DisputeStatus) {
  if (status === 'RESOLVED_REFUND') return 'Dispute resolved: refund issued'
  if (status === 'RESOLVED_NO_ACTION') return 'Dispute resolved: no action taken'
  if (status === 'DISMISSED') return 'Dispute dismissed'
  return null
}

// null means no deposit exists on this booking — the line is omitted entirely
// rather than shown as some default. depositStatus already distinguishes the
// two outcomes correctly, contrary to an earlier assumption here: CAPTURED
// means an approved damage claim captured (some or all of) the deposit and
// paid it to the owner via a separate Stripe transfer (see
// disputeService.resolveDispute's nextDepositStatus = 'CAPTURED' branch and
// paymentService.transferDepositCompensation) — it does NOT mean "still
// held." RELEASED covers both ways the deposit goes back to the renter: the
// normal auto-release with no dispute (cleanupJob.releaseDueDeposits) and a
// dispute resolved with no damage found (refundedCents === 0).
function ownerDepositStatusLabel(status: Booking['depositStatus']): string | null {
  if (status === 'AUTHORIZED') return 'Held'
  if (status === 'CAPTURED') return 'Released to you (damage compensation)'
  if (status === 'RELEASED') return 'Returned to renter'
  return null
}

// Renter-facing view of the same enum. AUTHORIZED = the hold is still on their
// card; CAPTURED = an approved damage claim charged some or all of it and paid
// the owner (a partial capture auto-releases the remainder); RELEASED = the
// full hold came back to them (normal auto-release, or a dispute that found no
// damage).
function renterDepositStatusLabel(status: Booking['depositStatus']): string | null {
  if (status === 'AUTHORIZED') return 'On hold on your card'
  if (status === 'CAPTURED') return 'Charged for the damage claim'
  if (status === 'RELEASED') return 'Returned to you'
  return null
}


type Nav = NativeStackNavigationProp<RootStackParamList>
type ScreenRoute = RouteProp<RootStackParamList, 'BookingDetail'>

const HOUR_MS = 60 * 60 * 1000
const ITEM_THUMB = 52

/** The Toronto day of a moment (requested, paid, handed off, paid out). */
function shortDate(iso: string | null | undefined) {
  return iso ? formatDayOf(iso, 'weekday') : null
}

/** A rental's start or end day (see @zoink/shared dates.ts): a requested
 *  calendar day never shifts, and a real handoff time shows its Toronto day. */
function calendarDate(iso: string) {
  return formatRentalDate(iso, 'weekday')
}

/** The later of two timestamps: a handoff is confirmed when the second tap lands. */
function laterOf(a: string | null, b: string | null) {
  if (!a || !b) return null
  return Date.parse(a) > Date.parse(b) ? a : b
}

function money(amount: number) {
  return `$${amount.toFixed(2)}`
}

/** Header title per status (and, once completed, whether everything has settled). */
function titleFor(booking: Booking, settled: boolean) {
  switch (booking.status) {
    case 'PENDING':
      return 'Waiting for the owner.'
    case 'ACCEPTED':
      return 'Ready to pay.'
    case 'CONFIRMED':
    case 'PICKUP_PENDING':
      return 'See you at pickup.'
    case 'ACTIVE':
      return 'Rental in progress.'
    case 'RETURN_PENDING':
      return 'Return and release.'
    case 'COMPLETED':
      return settled ? 'All done.' : 'Return and release.'
    case 'DECLINED':
    case 'CANCELLED':
    default:
      return 'Cancelled.'
  }
}

function statusLineFor(booking: Booking) {
  switch (booking.status) {
    case 'PENDING':
      return `Requested ${shortDate(booking.createdAt)}`
    case 'ACCEPTED':
      return 'Accepted · pay to confirm'
    case 'CONFIRMED':
    case 'PICKUP_PENDING':
      return `Pickup ${calendarDate(booking.startDate)}`
    case 'ACTIVE':
      return `Due back ${calendarDate(booking.endDate)}`
    case 'RETURN_PENDING':
      return 'Return in progress'
    case 'COMPLETED':
      return booking.completedAt ? `Returned ${shortDate(booking.completedAt)}` : 'Returned'
    case 'DECLINED':
      return 'Declined by the owner'
    default:
      return 'Cancelled'
  }
}

/** Re-renders every minute while focused, for the claim-window countdown. */
function useMinuteClock(active: boolean) {
  const isFocused = useIsFocused()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active || !isFocused) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 60 * 1000)
    return () => clearInterval(id)
  }, [active, isFocused])
  return now
}

export default function BookingDetailScreen() {
  const nav = useNavigation<Nav>()
  const route = useRoute<ScreenRoute>()
  const { user } = useAuth()
  const bookingId = route.params.bookingId
  const bookingQuery = useQuery({ queryKey: queryKeys.booking(bookingId), queryFn: () => getBooking(bookingId) })
  useRefreshOnFocus(queryKeys.booking(bookingId))
  const booking = bookingQuery.data ?? null
  const loading = bookingQuery.isPending
  const [loadingPhotos, setLoadingPhotos] = useState(false)
  const [photosModalVisible, setPhotosModalVisible] = useState(false)
  const [handoffPhotos, setHandoffPhotos] = useState<{ pickupPhotos: string[]; returnPhotos: string[] } | null>(null)

  // Only the dispute this user filed is returned, so this stays null when the
  // other party filed it; the booking's own disputeStatus/disputeReason
  // fields are still shown in that case.
  const disputeQuery = useQuery({
    queryKey: queryKeys.bookingDispute(bookingId),
    queryFn: () => getMyDisputeForBooking(bookingId),
    enabled: booking !== null && booking.disputeStatus !== 'NONE',
  })
  const myDispute = booking && booking.disputeStatus !== 'NONE' ? disputeQuery.data ?? null : null

  const isOwner = booking?.ownerId === user?.id
  const isRenter = booking?.renterId === user?.id

  // Accept, decline, cancel: one at a time; a second tap while one is in
  // flight is dropped.
  const [runAction, busy] = useSubmit(async (action: () => Promise<Booking>, onSuccess?: (updated: Booking) => void) => {
    try {
      const updated = await action()
      applyBookingUpdate(updated)
      onSuccess?.(updated)
    } catch (err: any) {
      toast.failure(err, { action: "Couldn't update this booking. Please try again." })
    }
  })

  async function handleViewPhotos() {
    if (!booking) return
    const bookingPhotos = {
      pickupPhotos: booking.pickupPhotos ?? [],
      returnPhotos: booking.returnPhotos ?? [],
    }
    setHandoffPhotos(bookingPhotos)
    setPhotosModalVisible(true)
    setLoadingPhotos(true)
    try {
      const photos = await getHandoffPhotos(booking.id)
      setHandoffPhotos({
        pickupPhotos: photos.pickupPhotos.length > 0 ? photos.pickupPhotos : bookingPhotos.pickupPhotos,
        returnPhotos: photos.returnPhotos.length > 0 ? photos.returnPhotos : bookingPhotos.returnPhotos,
      })
    } catch (err: any) {
      if ((booking.pickupPhotos?.length ?? 0) === 0 && (booking.returnPhotos?.length ?? 0) === 0) {
        toast.failure(err, { action: "Couldn't load the handoff photos. Please try again." })
      }
    } finally {
      setLoadingPhotos(false)
    }
  }


  const completedAtMs = booking?.completedAt ? Date.parse(booking.completedAt) : null
  const claimWindowOpen =
    booking?.status === 'COMPLETED' && completedAtMs != null && Date.now() - completedAtMs < DEPOSIT_HOLD_HOURS * HOUR_MS
  const now = useMinuteClock(!!claimWindowOpen)
  const { width: windowWidth } = useWindowDimensions()
  const insets = useSafeAreaInsets()

  if (loading && !isWaitingOffline(bookingQuery)) return <DetailLoadingScreen title="Booking" />

  if (!booking) {
    return (
      <DetailFallbackScreen
        query={bookingQuery}
        title="Booking"
        what="this booking"
        unavailable={BOOKING_UNAVAILABLE}
      />
    )
  }

  const disputeIsActive = ACTIVE_DISPUTE_STATUSES.includes(booking.disputeStatus)
  const disputeIsResolved = RESOLVED_DISPUTE_STATUSES.includes(booking.disputeStatus)
  const canFileDispute = DISPUTABLE_BOOKING_STATUSES.includes(booking.status) && !disputeIsActive

  // Derived, not stored — always computed from the two amounts the booking
  // snapshotted, so a booking made under the old tiered commission still shows
  // the rate it was actually charged. Above 15% means the $2 minimum applied.
  const commissionRatePct = booking.totalPrice > 0 ? (booking.commissionAmount / booking.totalPrice) * 100 : 0
  const commissionLabel = commissionRatePct > COMMISSION_RATE * 100 + 0.05
    ? `minimum $${COMMISSION_MIN_CENTS / 100}`
    : `${Number(commissionRatePct.toFixed(1))}%`
  const ownerDepositLabel = ownerDepositStatusLabel(booking.depositStatus)
  const renterDepositLabel = renterDepositStatusLabel(booking.depositStatus)
  const hasDeposit = booking.depositAmount > 0
  const otherParty = isOwner ? booking.renter : booking.owner
  const pickupPhotos = booking.pickupPhotos ?? []
  const returnPhotos = booking.returnPhotos ?? []
  const itemImage = booking.listing.images?.[0]?.url
  const closed = booking.status === 'CANCELLED' || booking.status === 'DECLINED'

  // ── Timeline, from status + timestamps only ─────────────────────────────
  const order = ['PENDING', 'ACCEPTED', 'CONFIRMED', 'PICKUP_PENDING', 'ACTIVE', 'RETURN_PENDING', 'COMPLETED']
  const at = (status: string) => order.indexOf(booking.status) >= order.indexOf(status)
  const pickedUpAt = laterOf(booking.ownerPickupTappedAt, booking.renterPickupTappedAt)
  const returnedAt = booking.completedAt ?? laterOf(booking.ownerReturnTappedAt, booking.renterReturnTappedAt)
  const elapsedMs = completedAtMs != null ? now - completedAtMs : 0
  const holdMs = DEPOSIT_HOLD_HOURS * HOUR_MS
  const windowOver = booking.status === 'COMPLETED' && completedAtMs != null && elapsedMs >= holdMs
  const finalDone = isOwner
    ? booking.paymentStatus === 'PAID_OUT'
    : booking.depositStatus !== 'AUTHORIZED' && windowOver
  const settled = booking.status === 'COMPLETED' && finalDone
  const hoursLeft = Math.max(0, Math.ceil((holdMs - elapsedMs) / HOUR_MS))
  const releaseAt = completedAtMs != null ? new Date(completedAtMs + holdMs).toISOString() : null
  const payoutAt = completedAtMs != null ? new Date(completedAtMs + PAYOUT_HOLD_HOURS * HOUR_MS).toISOString() : null
  const rentCharged = booking.paymentStatus === 'CAPTURED' || booking.paymentStatus === 'PAYOUT_PENDING' || booking.paymentStatus === 'PAID_OUT'

  const currentIndex =
    booking.status === 'PENDING' || booking.status === 'ACCEPTED'
      ? 1
      : booking.status === 'CONFIRMED' || booking.status === 'PICKUP_PENDING'
        ? 2
        : booking.status === 'ACTIVE' || booking.status === 'RETURN_PENDING'
          ? 3
          : disputeIsActive || !windowOver
            ? 4
            : finalDone
              ? 6
              : 5
  const stateOf = (i: number): TimelineStep['state'] => (i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'upcoming')

  const joinCaption = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' · ') || null

  const steps: TimelineStep[] = [
    { key: 'requested', title: 'Requested', state: 'done', caption: shortDate(booking.createdAt) },
    {
      key: 'accepted',
      title: 'Accepted & paid',
      state: stateOf(1),
      caption: at('CONFIRMED') ? shortDate(booking.paidAt) : null,
      current:
        booking.status === 'PENDING'
          ? {
              badge: 'Waiting for owner',
              headline: isOwner ? 'Accept or decline this request' : `${booking.owner.firstName} is reviewing your request`,
            }
          : {
              badge: 'Payment needed',
              headline: isOwner ? `Waiting for ${booking.renter.firstName} to pay` : 'Pay to lock in your dates',
            },
    },
    {
      key: 'pickup',
      title: 'Picked up · Zoinked',
      state: stateOf(2),
      caption: at('ACTIVE')
        ? joinCaption(shortDate(pickedUpAt), pickupPhotos.length ? `${pickupPhotos.length} photos` : null, rentCharged && 'rent charged')
        : `Planned ${calendarDate(booking.startDate)}`,
      current: {
        badge: booking.status === 'PICKUP_PENDING' ? 'Photos in' : 'Waiting for pickup',
        headline: `Meet ${otherParty.firstName} and Zoink It together`,
        body: `Pickup ${calendarDate(booking.startDate)}.`,
      },
    },
    {
      key: 'return',
      title: 'Returned · Zoinked',
      state: stateOf(3),
      caption: booking.status === 'COMPLETED'
        ? joinCaption(shortDate(returnedAt), returnPhotos.length ? `${returnPhotos.length} photos` : null)
        : `Due ${calendarDate(booking.endDate)}`,
      current:
        booking.status === 'RETURN_PENDING'
          ? { badge: 'Return pending', headline: 'Both tap Zoink It to finish the return' }
          : { badge: 'Rental in progress', headline: `Return by ${calendarDate(booking.endDate)}` },
    },
    {
      key: 'claim',
      title: 'Claim window',
      state: stateOf(4),
      caption: windowOver ? 'Closed' : `${DEPOSIT_HOLD_HOURS}h after the return`,
      current: {
        badge: 'Claim window open',
        headline: isOwner
          ? `${hoursLeft} h to report a problem`
          : hasDeposit
            ? `${hoursLeft} h until your ${money(booking.depositAmount)} hold releases`
            : `${hoursLeft} h left to report a problem`,
        progress: Math.min(1, elapsedMs / holdMs),
        body: isOwner
          ? 'If something is damaged or missing, report it before the window closes.'
          : 'If neither of you reports a problem, the rental closes on its own.',
      },
      override: disputeIsActive ? (
        <Card shadow={false} contentStyle={styles.disputeCard}>
          <Text style={styles.disputeTitle}>Problem reported</Text>
          <Text style={styles.caption}>{disputeActiveLabel(booking.disputeStatus)}</Text>
          {booking.disputeReason ? <Text style={styles.bodyText}>{booking.disputeReason}</Text> : null}
        </Card>
      ) : undefined,
    },
    isOwner
      ? {
          key: 'payout',
          title: 'Paid out',
          state: stateOf(5),
          caption: finalDone
            ? shortDate(booking.payoutSentAt)
            : payoutAt
              ? `Expected ${shortDate(payoutAt)}`
              : `${PAYOUT_HOLD_HOURS}h after the return`,
          current: { badge: 'Payout pending', headline: 'Your payout is on its way' },
        }
      : {
          key: 'deposit',
          title: hasDeposit ? 'Deposit released' : 'Rental closed',
          state: stateOf(5),
          caption: finalDone
            ? hasDeposit
              ? renterDepositLabel
              : null
            : releaseAt
              ? `Expected ${shortDate(releaseAt)}`
              : `${DEPOSIT_HOLD_HOURS}h after the return`,
          current: { badge: 'Releasing', headline: 'Your deposit is being released' },
        },
  ]

  // ── Actions, chosen by the existing state logic ──────────────────────────
  // The server refuses the pickup until the rent (and deposit hold) are
  // authorized, so the handoff isn't offered until then either.
  const pickupAwaitingPayment = (booking.status === 'CONFIRMED' || booking.status === 'PICKUP_PENDING') && !isPickupPaymentReady(booking)
  const payOpensAt = isRenter && booking.status === 'ACCEPTED' ? paymentOpensAt(booking) : null
  let primary: { label: string; onPress: () => void; disabled?: boolean } | null = null
  if (pickupAwaitingPayment) {
    primary = null
  } else if (isOwner && booking.status === 'PENDING') {
    primary = { label: busy ? 'Saving...' : 'Accept request', onPress: () => runAction(() => acceptBooking(booking.id), haptics.success) }
  } else if (isRenter && booking.status === 'ACCEPTED') {
    primary = payOpensAt
      ? { label: `You can pay from ${formatDateTime(payOpensAt)}`, onPress: () => {}, disabled: true }
      : { label: 'Pay now', onPress: () => nav.navigate('Pay', { bookingId: booking.id }) }
  } else if (isOwner && booking.status === 'CONFIRMED') {
    primary = { label: 'Start Handoff', onPress: () => nav.navigate('ZoinkIt', { bookingId: booking.id, mode: 'pickup' }) }
  } else if (isRenter && booking.status === 'ACTIVE') {
    primary = { label: 'Start Return', onPress: () => nav.navigate('ZoinkIt', { bookingId: booking.id, mode: 'return' }) }
  } else if (booking.status === 'PICKUP_PENDING') {
    primary = { label: 'Zoink It', onPress: () => nav.navigate('ZoinkIt', { bookingId: booking.id, mode: 'pickup' }) }
  } else if (booking.status === 'RETURN_PENDING') {
    primary = { label: 'Zoink It', onPress: () => nav.navigate('ZoinkIt', { bookingId: booking.id, mode: 'return' }) }
  } else if (booking.status === 'COMPLETED' && booking.pendingReview) {
    primary = {
      label: 'Leave required review',
      onPress: () =>
        nav.reset({
          index: 0,
          routes: [{ name: 'ReviewPrompt', params: { review: booking.pendingReview! } }],
        }),
    }
  }

  const secondary: { label: string; onPress: () => void }[] = []
  if (isOwner && booking.status === 'PENDING') {
    secondary.push({
      label: 'Decline',
      onPress: () => confirmDecline(booking.renter.firstName, () => runAction(() => declineBooking(booking.id), haptics.success)),
    })
  }
  if (booking.conversationId) {
    secondary.push({
      label: isOwner ? 'Message renter' : 'Message owner',
      onPress: () => nav.navigate('ConversationThread', { conversationId: booking.conversationId!, title: booking.listing.title }),
    })
  }
  if (booking.status === 'COMPLETED') {
    secondary.push({ label: 'View photos', onPress: handleViewPhotos })
  }
  if (canFileDispute) {
    secondary.push({
      label: 'Report a problem',
      onPress: () => nav.navigate('FileDispute', { bookingId: booking.id, listingTitle: booking.listing.title }),
    })
  }
  if (['PENDING', 'ACCEPTED', 'CONFIRMED', 'PICKUP_PENDING'].includes(booking.status)) {
    secondary.push({
      label: 'Cancel booking',
      onPress: () => confirmCancel(otherParty.firstName, () => runAction(() => cancelBooking(booking.id))),
    })
  }

  const priceRows: PriceRow[] = [
    { label: 'Rental total', value: money(booking.totalPrice) },
    ...(booking.insuranceOptIn ? [{ label: 'Insurance', value: money(booking.insuranceFee) }] : []),
    { label: 'HST (13%)', value: money(booking.hstAmount) },
  ]

  return (
    <Screen
      header={<ScreenHeader title={titleFor(booking, settled)} back />}
      footer={primary ? <Button label={primary.label} onPress={primary.onPress} disabled={busy || primary.disabled} /> : undefined}
    >
      <View style={styles.content}>
        <Card shadow={false} padding={space.lg} contentStyle={styles.itemRow}>
          <Thumb
            size={ITEM_THUMB}
            source={itemImage ? { uri: fillImageUrl(itemImage, { width: ITEM_THUMB, height: ITEM_THUMB }) } : undefined}
            initials={categoryAbbreviation(booking.listing.category)}
            initialsSize={15}
          />
          <View style={styles.flex}>
            <Text style={styles.itemTitle} numberOfLines={1}>
              {booking.listing.title}
            </Text>
            <Text style={type.price}>{statusLineFor(booking)}</Text>
            <Text style={styles.caption}>
              {calendarDate(booking.startDate)} – {calendarDate(booking.endDate)} · {isOwner ? 'Renter' : 'Owner'} {otherParty.firstName} {otherParty.lastName}
            </Text>
          </View>
        </Card>

        {pickupAwaitingPayment ? <PickupPaymentNotice /> : null}

        {closed ? (
          <Card shadow={false} contentStyle={styles.closedCard}>
            <Text style={styles.disputeTitle}>{booking.status === 'DECLINED' ? 'Declined' : 'Cancelled'}</Text>
            <Text style={styles.bodyText}>
              {booking.status === 'DECLINED'
                ? `${booking.owner.firstName} declined this request. Nothing was charged.`
                : 'This booking was cancelled.'}
            </Text>
          </Card>
        ) : (
          <Timeline steps={steps} />
        )}

        {disputeIsResolved ? (
          <Card shadow={false} contentStyle={styles.stack}>
            <Text style={styles.sectionTitle}>{disputeOutcomeLabel(booking.disputeStatus)}</Text>
            {myDispute?.resolutionNotes ? <Text style={styles.bodyText}>{myDispute.resolutionNotes}</Text> : null}
          </Card>
        ) : null}

        {isOwner ? (
          <Card contentStyle={styles.stack}>
            <Text style={styles.sectionTitle}>Your payout</Text>
            <PriceTable
              rows={[
                { label: 'Rental price', value: money(booking.totalPrice) },
                { label: `Zoink commission (${commissionLabel})`, value: `−${money(booking.commissionAmount)}` },
              ]}
              total={{ label: 'You get', value: money(booking.ownerPayout) }}
              highlight="green"
            />
            <Text style={styles.caption}>
              {booking.paymentStatus === 'PAID_OUT' && booking.payoutSentAt
                ? `Paid out ${shortDate(booking.payoutSentAt)}.`
                : `Lands ${PAYOUT_HOLD_HOURS}h after the item comes back, unless a problem is reported.`}
            </Text>
            {ownerDepositLabel ? (
              <Text style={styles.caption}>
                Security deposit (not part of your earnings): {ownerDepositLabel}
                {booking.depositStatus === 'CAPTURED' ? ', paid to you as a separate transfer.' : '.'}
              </Text>
            ) : null}
          </Card>
        ) : !closed ? (
          <Card shadow={false} contentStyle={styles.stack}>
            <PriceTable rows={priceRows} total={{ label: rentCharged ? 'Charged' : 'Charged at pickup', value: money(booking.totalPrice + booking.insuranceFee + booking.hstAmount) }} />
            {hasDeposit ? (
              <Text style={styles.caption}>
                Deposit {money(booking.depositAmount)}{renterDepositLabel ? ` · ${renterDepositLabel}` : ''}
              </Text>
            ) : null}
          </Card>
        ) : null}

        {secondary.length > 0 ? (
          <View style={styles.grid}>
            {secondary.map((action) => (
              <Button
                key={action.label}
                label={action.label}
                variant="secondary"
                onPress={action.onPress}
                disabled={busy || loadingPhotos}
                compactLabel
                style={styles.gridItem}
              />
            ))}
          </View>
        ) : null}
      </View>

      <Modal visible={photosModalVisible} animationType="slide" onRequestClose={() => setPhotosModalVisible(false)}>
        <View style={[styles.modalScreen, { paddingTop: insets.top + space.sm }]}>
          <ScrollView contentContainerStyle={[styles.modalContent, { paddingBottom: insets.bottom + space.screen }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeading}>Rental photos</Text>
              <Button label="Close" variant="secondary" size="sm" onPress={() => setPhotosModalVisible(false)} />
            </View>

            {(['pickupPhotos', 'returnPhotos'] as const).map((key) => {
              const urls = handoffPhotos?.[key] ?? []
              return (
                <View key={key} style={styles.stack}>
                  <Text style={styles.modalTitle}>
                    {key === 'pickupPhotos' ? 'Pickup photos' : 'Return photos'} ({urls.length})
                  </Text>
                  {urls.length > 0 ? (
                    urls.map((url, idx) => (
                      <Pressable
                        key={url}
                        onPress={() => nav.navigate('PhotoViewer', { photos: urls, initialIndex: idx })}
                        accessibilityRole="imagebutton"
                        accessibilityLabel={`Open photo ${idx + 1}`}
                      >
                        <Image
                          source={{ uri: limitImageUrl(url, { width: windowWidth - space.screen * 2, height: 220 }) }}
                          style={styles.photoPreview}
                          contentFit="contain"
                        />
                      </Pressable>
                    ))
                  ) : (
                    <Text style={styles.modalEmpty}>{key === 'pickupPhotos' ? 'No pickup photos found.' : 'No return photos found.'}</Text>
                  )}
                </View>
              )
            })}
          </ScrollView>
        </View>
      </Modal>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { gap: space.lg, paddingTop: space.xs },
  flex: { flex: 1, gap: 2 },
  stack: { gap: space.sm },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  itemTitle: { ...type.body, fontFamily: fonts.bold, lineHeight: 20, color: colors.ink },
  caption: { ...type.caption, color: colors.mutedAlt },
  bodyText: { ...type.bodySm, color: colors.muted },
  sectionTitle: { ...type.section, color: colors.ink },
  disputeCard: { gap: space.xs, backgroundColor: colors.tan },
  disputeTitle: { ...type.section, color: colors.danger },
  closedCard: { gap: space.xs, backgroundColor: colors.tan },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  gridItem: { flexBasis: '47%', flexGrow: 1 },
  modalScreen: { flex: 1, backgroundColor: colors.ink, paddingHorizontal: space.screen },
  modalContent: { gap: space.screen },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalHeading: { ...type.h2, color: colors.onInk },
  modalTitle: { ...type.label, color: colors.onInk },
  modalEmpty: { ...type.bodySm, color: colors.onInkMuted },
  photoPreview: { width: '100%', height: 220, borderRadius: radius.thumb, backgroundColor: colors.muted },
})
