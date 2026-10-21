import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import * as Haptics from 'expo-haptics'
import * as ImagePicker from 'expo-image-picker'
import Feather from '@expo/vector-icons/Feather'
import { RouteProp, useIsFocused, useNavigation, useRoute } from '@react-navigation/native'
import { useQuery } from '@tanstack/react-query'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { DEPOSIT_HOLD_HOURS, HANDOFF_PHOTOS_MAX, HANDOFF_PHOTOS_MIN, ZOINK_TAP_WINDOW_MS, rentalDayCount } from '@zoink/shared'
import { RootStackParamList } from '../navigation'
import { Booking } from '../types'
import { confirmHandoff, getBooking, initiateHandoff, uploadHandoffPhotoImage } from '../services/bookingsApi'
import { queryKeys } from '../services/queryKeys'
import { applyBookingUpdate } from '../services/bookingCache'
import { apiErrorMessage } from '../utils/apiError'
import { useAuth } from '../context/AuthContext'
import { colors } from '../theme/colors'
import { border, radius, shadow, space } from '../theme/tokens'
import { fonts, type } from '../theme/typography'
import { categoryAbbreviation } from '../config/categories'
import { fillImageUrl } from '../utils/cloudinaryImage'
import { HANDOFF_POLL_MS } from '../config/polling'
import Screen from '../components/mockup/Screen'
import ScreenHeader from '../components/mockup/ScreenHeader'
import Button from '../components/mockup/Button'
import Badge from '../components/mockup/Badge'
import Card from '../components/mockup/Card'
import InkCard from '../components/mockup/InkCard'
import HardShadow from '../components/mockup/HardShadow'
import LogoPill from '../components/mockup/LogoPill'
import Thumb from '../components/mockup/Thumb'
import { dailyPriceLabel } from '../components/mockup/listingFormat'

type Nav = NativeStackNavigationProp<RootStackParamList>
type ScreenRoute = RouteProp<RootStackParamList, 'ZoinkIt'>

const MIN_PHOTOS = HANDOFF_PHOTOS_MIN
const MAX_PHOTOS = HANDOFF_PHOTOS_MAX
const VISIBLE_PHOTOS = 3
const ITEM_THUMB = 52
const PHOTO_THUMB = 30
const WINDOW_MINUTES = Math.round(ZOINK_TAP_WINDOW_MS / 60000)

/** Calendar days, inclusive. After pickup the start is the real handoff time,
 *  which made the old millisecond count come out a day off. */
function rentalDays(startIso: string, endIso: string) {
  return rentalDayCount(startIso, endIso)
}

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${`${total % 60}`.padStart(2, '0')}`
}

/** One sentence on what happens once both taps land, per phase and role. */
function explainerFor(mode: 'pickup' | 'return', isOwner: boolean) {
  if (mode === 'pickup') {
    return isOwner
      ? "The renter's payment is captured only when both taps land."
      : 'Your rent is charged only when both taps land.'
  }
  return isOwner
    ? `When both taps land the rental completes. You have ${DEPOSIT_HOLD_HOURS}h to report a problem before the deposit is released.`
    : `When both taps land the rental completes. Your deposit is released ${DEPOSIT_HOLD_HOURS}h later unless a problem is reported.`
}

/**
 * Ticks once a second while a lone tap is waiting, from the server's tap
 * timestamp, so it never drifts. Stops (and clears its interval) when there's
 * nothing to count, on unmount, and while the screen is not focused.
 */
function useCountdown(firstTapAt: string | null) {
  const isFocused = useIsFocused()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!firstTapAt || !isFocused) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [firstTapAt, isFocused])
  if (!firstTapAt) return null
  return Date.parse(firstTapAt) + ZOINK_TAP_WINDOW_MS - now
}

export default function ZoinkItScreen() {
  const nav = useNavigation<Nav>()
  const route = useRoute<ScreenRoute>()
  const { user } = useAuth()
  const { bookingId, mode } = route.params
  // Both phones watch the booking for the other one's tap: every 3 s, but
  // only while this screen is the one showing and the app is in front (the
  // interval used to keep running behind the camera, other screens and the
  // lock screen until the screen was closed).
  const isFocused = useIsFocused()
  const bookingQuery = useQuery({
    queryKey: queryKeys.booking(bookingId),
    queryFn: () => getBooking(bookingId),
    refetchInterval: isFocused ? HANDOFF_POLL_MS : false,
    // Always the latest on (re)focus: the other phone may have tapped.
    staleTime: 0,
  })
  const booking = bookingQuery.data ?? null
  const setBooking = applyBookingUpdate
  const [pressed, setPressed] = useState(false)
  const [success, setSuccess] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const successHandled = useRef(false)

  // Photo picking/editing — merged in from what used to be a separate HandoffPhotoScreen.
  const [pickerUris, setPickerUris] = useState<string[]>([])
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const pendingStatus = mode === 'pickup' ? 'PICKUP_PENDING' : 'RETURN_PENDING'
  const completedStatus = mode === 'pickup' ? 'ACTIVE' : 'COMPLETED'
  const ownerTapField = mode === 'pickup' ? 'ownerPickupTappedAt' : 'ownerReturnTappedAt'
  const renterTapField = mode === 'pickup' ? 'renterPickupTappedAt' : 'renterReturnTappedAt'
  const startStatus = mode === 'pickup' ? 'CONFIRMED' : 'ACTIVE'
  const isOwner = booking?.ownerId === user?.id
  const isRenter = booking?.renterId === user?.id
  const isUploader = mode === 'pickup' ? isOwner : isRenter
  const isDocumented = booking?.status === pendingStatus
  const isReady = isDocumented
  const locked = !isReady || pressed || success
  const existingPhotos = booking ? (mode === 'pickup' ? booking.pickupPhotos : booking.returnPhotos) ?? [] : []
  const needsFirstSubmission = isUploader && booking?.status === startStatus
  const showPickerUI = needsFirstSubmission || editing
  const isPickerValid = pickerUris.length >= MIN_PHOTOS && pickerUris.length <= MAX_PHOTOS
  const otherParty = booking
    ? booking.ownerId === user?.id
      ? booking.renter
      : booking.owner
    : null
  const otherName = otherParty?.firstName ?? 'other party'

  // One alert per outage: a failed poll every 3 s (e.g. the whole time the
  // phone was offline) used to alert each time. Re-armed once a read succeeds.
  const outageAlerted = useRef(false)
  useEffect(() => {
    if (bookingQuery.isError && !outageAlerted.current) {
      outageAlerted.current = true
      Alert.alert('Error', apiErrorMessage(bookingQuery.error, 'Could not load this booking.'))
    }
  }, [bookingQuery.isError, bookingQuery.error])
  useEffect(() => {
    outageAlerted.current = false
  }, [bookingQuery.dataUpdatedAt])

  const handleSuccess = useCallback(async (nextBooking: Booking) => {
    if (successHandled.current) return
    successHandled.current = true
    setBooking(nextBooking)
    setSuccess(true)
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    setTimeout(() => {
      nav.replace(mode === 'pickup' ? 'ActiveRental' : 'BookingDetail', { bookingId })
    }, 1500)
  }, [bookingId, mode, nav])

  // One confirm per tap, never two at once. Both phones tapping in the same
  // instant can make one write lose the booking's version check (409); that's
  // not worth an alert, since the read-only effect below taps again if it's
  // still needed.
  const tapInFlight = useRef(false)
  const tap = useCallback(async () => {
    if (tapInFlight.current) return
    tapInFlight.current = true
    try {
      const result = await confirmHandoff(bookingId, mode)
      setBooking(result.booking)
      if (result.bothConfirmed) {
        await handleSuccess(result.booking)
      }
    } catch (err: any) {
      if (err?.response?.status === 409) return
      setPressed(false)
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not confirm handoff.')
    } finally {
      tapInFlight.current = false
    }
  }, [bookingId, handleSuccess, mode])

  // After tapping, this side only reads: the booking poll above shows when the
  // other person's tap completes the handoff. It taps once more only when the
  // other person tapped after this phone did and the handoff still isn't done
  // (their tap fell outside the server's confirm window, or ours lost a 409).
  useEffect(() => {
    if (!pressed || success || !booking || tapInFlight.current) return

    if (booking.status === completedStatus) {
      handleSuccess(booking)
      return
    }
    if (booking.status !== pendingStatus) {
      setPressed(false)
      Alert.alert('Error', 'Could not confirm handoff.')
      return
    }

    const mine = booking[isOwner ? ownerTapField : renterTapField]
    const theirs = booking[isOwner ? renterTapField : ownerTapField]
    if (theirs && (!mine || Date.parse(theirs) > Date.parse(mine))) {
      tap()
    }
  }, [booking, completedStatus, handleSuccess, isOwner, pendingStatus, pressed, success, tap])

  useEffect(() => {
    if (!pressed || success) return

    const timeout = setTimeout(() => {
      setPressed(false)
      setTimedOut(true)
    }, ZOINK_TAP_WINDOW_MS)

    return () => clearTimeout(timeout)
  }, [pressed, success])

  async function pressZoink() {
    if (locked) return

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    setTimedOut(false)
    setPressed(true)
    await tap()
  }

  // Handoff photos MUST be captured live at the handoff — never pulled from the
  // camera roll — or the "Zoink It" evidence is trivially fakeable with an old
  // photo. launchCameraAsync captures one frame per call, so each press appends
  // to pickerUris until the uploader has the 2-3 shots the flow requires.
  async function capturePhoto() {
    if (pickerUris.length >= MAX_PHOTOS) {
      Alert.alert('Maximum reached', `You can take up to ${MAX_PHOTOS} photos. Clear one to retake.`)
      return
    }

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync()
      if (!permission.granted) {
        Alert.alert(
          'Camera access needed',
          "Zoink needs your camera to take pickup and return photos so both sides of a handoff can be verified. These photos can't come from your library. Enable camera access for Zoink in Settings, then try again."
        )
        return
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        cameraType: ImagePicker.CameraType.back,
        quality: 0.82,
      })

      if (result.canceled) return
      setPickerUris((prev) => [...prev, ...result.assets.map((asset) => asset.uri)].slice(0, MAX_PHOTOS))
    } catch {
      Alert.alert('Camera error', 'Could not open the camera right now.')
    }
  }

  function clearPhotos() {
    setPickerUris([])
  }

  async function submitPhotos() {
    if (!isPickerValid) return

    setSaving(true)
    try {
      const uploaded = await Promise.all(pickerUris.map((uri) => uploadHandoffPhotoImage(bookingId, uri, mode)))
      const updated = await initiateHandoff(bookingId, mode, uploaded)
      setBooking(updated)
      setPickerUris([])
      setEditing(false)
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not submit photos.')
    } finally {
      setSaving(false)
    }
  }

  const ownerTappedAt = booking?.[ownerTapField] ?? null
  const renterTappedAt = booking?.[renterTapField] ?? null
  // The countdown runs from the one tap that's waiting for the other.
  const loneTapAt = ownerTappedAt && !renterTappedAt ? ownerTappedAt : renterTappedAt && !ownerTappedAt ? renterTappedAt : null
  const remaining = useCountdown(success ? null : loneTapAt)

  if (!booking) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.greenText} />
      </View>
    )
  }

  const myTapAt = isOwner ? ownerTappedAt : renterTappedAt
  const myTapLive = !!myTapAt && remaining != null && remaining > 0
  const viewerTapped = pressed || myTapLive || success
  const windowClosed = timedOut || (remaining != null && remaining <= 0)
  const photos = showPickerUI ? pickerUris : existingPhotos
  const uploaderName = mode === 'pickup' ? booking.owner.firstName : booking.renter.firstName
  const days = rentalDays(booking.startDate, booking.endDate)
  const itemImage = booking.listing.images?.[0]?.url
  const canAddPhoto = showPickerUI ? pickerUris.length < MAX_PHOTOS && !saving : isUploader && !pressed && !success

  function onAddPhoto() {
    if (showPickerUI) capturePhoto()
    else setEditing(true)
  }

  const parties = [
    { key: 'owner', label: isOwner ? 'Owner (you)' : 'Owner', tapped: !!ownerTappedAt, isViewer: isOwner },
    { key: 'renter', label: isRenter ? 'Renter (you)' : 'Renter', tapped: !!renterTappedAt, isViewer: isRenter },
  ]

  const footer = showPickerUI ? (
    <View style={styles.footerStack}>
      {pickerUris.length > 0 ? (
        <Button label="Clear photos" variant="link" onPress={clearPhotos} disabled={saving} style={styles.centered} />
      ) : null}
      <Button label="Submit photos" onPress={submitPhotos} loading={saving} disabled={!isPickerValid} />
    </View>
  ) : (
    <Button
      variant="zoink"
      label={
        success
          ? 'Zoinked'
          : viewerTapped
            ? `Zoinked. Waiting for ${otherName}`
            : isReady
              ? 'Zoink It'
              : 'Waiting for photos'
      }
      onPress={pressZoink}
      disabled={locked || viewerTapped}
      compactLabel={viewerTapped && !success}
    />
  )

  return (
    <Screen
      glow="bottomRight"
      header={
        <ScreenHeader
          title={mode === 'pickup' ? 'Zoink It at pickup.' : 'Zoink It at return.'}
          back
          onBack={() => {
            if (saving) return
            if (editing) setEditing(false)
            else nav.goBack()
          }}
        />
      }
      footer={footer}
    >
      <View style={styles.content}>
        {success ? (
          <Card contentStyle={styles.successCard} padding={space.xxl}>
            <View style={styles.successIcon}>
              <Feather name="check" size={20} color={colors.green} />
            </View>
            <Text style={styles.successText}>
              {mode === 'pickup' ? 'Handoff confirmed. Enjoy the rental.' : 'Return confirmed. Rental complete.'}
            </Text>
          </Card>
        ) : null}

        <HardShadow offset="xxl" radius={radius.heroLg}>
          <View style={styles.handoffCard}>
            <View style={styles.cardHeader}>
              <LogoPill size="sm" />
              <Badge
                label={mode === 'pickup' ? 'Pickup' : 'Return'}
                variant="surface"
                size={13}
                icon={<Feather name={mode === 'pickup' ? 'package' : 'corner-down-left'} size={12} color={colors.ink} />}
              />
            </View>

            <View style={styles.cardBody}>
              <View style={styles.innerRow}>
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
                  <Text style={type.price}>
                    {dailyPriceLabel(booking.listing.dailyPrice)} · {days} {days === 1 ? 'day' : 'days'}
                  </Text>
                </View>
              </View>

              {booking.depositAmount > 0 ? (
                <View style={styles.innerRow}>
                  <Feather name="lock" size={18} color={colors.ink} />
                  <Text style={[styles.rowLabel, styles.flex]}>Deposit</Text>
                  <Text style={styles.rowValue}>${booking.depositAmount.toFixed(2)} held</Text>
                </View>
              ) : null}

              <View>
                <View style={styles.innerRow}>
                  <Feather name="camera" size={18} color={colors.ink} />
                  <Text style={[styles.rowLabel, styles.flex]}>{mode === 'pickup' ? 'Pickup photos' : 'Return photos'}</Text>
                  <View style={styles.photoStrip}>
                    {photos.slice(0, VISIBLE_PHOTOS).map((uri, index) => (
                      <Pressable
                        key={uri}
                        disabled={showPickerUI}
                        onPress={() => nav.navigate('PhotoViewer', { photos: existingPhotos, initialIndex: index })}
                        accessibilityRole="imagebutton"
                        accessibilityLabel={`Photo ${index + 1}`}
                      >
                        <Image
                          source={{ uri: showPickerUI ? uri : fillImageUrl(uri, { width: PHOTO_THUMB, height: PHOTO_THUMB }) }}
                          style={styles.photoThumb}
                        />
                      </Pressable>
                    ))}
                    {photos.length > VISIBLE_PHOTOS ? <Text style={styles.moreText}>+{photos.length - VISIBLE_PHOTOS}</Text> : null}
                    {canAddPhoto ? (
                      <Pressable
                        style={styles.addPhoto}
                        onPress={onAddPhoto}
                        hitSlop={7}
                        accessibilityRole="button"
                        accessibilityLabel={showPickerUI ? 'Take a photo' : 'Edit photos'}
                      >
                        <Feather name={showPickerUI ? 'plus' : 'edit-2'} size={16} color={colors.ink} />
                      </Pressable>
                    ) : null}
                  </View>
                </View>
                {showPickerUI && pickerUris.length < MIN_PHOTOS ? (
                  <Text style={styles.photoError}>Add at least {MIN_PHOTOS} photos</Text>
                ) : !showPickerUI && !isDocumented && !isUploader ? (
                  <Text style={styles.photoHint}>Waiting for {uploaderName} to add photos</Text>
                ) : null}
              </View>

              <View style={styles.statusGrid}>
                {parties.map((party) => (
                  <View key={party.key} style={[styles.statusCell, party.tapped ? styles.statusCellTapped : null]}>
                    <Text style={styles.statusLabel}>{party.label}</Text>
                    {party.tapped ? (
                      <View style={styles.statusValueRow}>
                        <Feather name="check" size={14} color={colors.ink} />
                        <Text style={styles.statusTapped}>Zoinked</Text>
                      </View>
                    ) : (
                      <Text style={styles.statusWaiting}>{party.isViewer ? 'Tap now' : 'Waiting'}</Text>
                    )}
                  </View>
                ))}
              </View>

              {!success && (remaining != null || timedOut) ? (
                <View style={styles.countdown}>
                  <Feather name="clock" size={16} color={windowClosed ? colors.onInk : colors.green} />
                  <Text style={[styles.countdownText, windowClosed ? styles.countdownClosed : null]}>
                    {windowClosed ? 'Window closed: tap again' : `${formatRemaining(remaining ?? 0)} left to tap`}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </HardShadow>

        <InkCard rotate={-1.5} style={styles.explainer}>
          <Text style={styles.explainerText}>
            <Text style={styles.explainerStrong}>{WINDOW_MINUTES} min</Text>
            {' · Both of you tap Zoink It in the same window. '}
            {explainerFor(mode, isOwner)}
          </Text>
        </InkCard>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  content: { gap: space.screen, paddingTop: space.xs },
  flex: { flex: 1 },
  centered: { alignSelf: 'center' },
  successCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    backgroundColor: colors.lime,
  },
  successIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successText: { ...type.label, color: colors.ink, flex: 1 },
  handoffCard: {
    backgroundColor: colors.surface,
    borderWidth: border.base,
    borderColor: colors.ink,
    borderRadius: radius.heroLg,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.green,
    borderBottomWidth: border.base,
    borderBottomColor: colors.ink,
    paddingVertical: space.xl,
    paddingHorizontal: space.xxl,
  },
  cardBody: { padding: space.xl, gap: space.md },
  innerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderWidth: border.thin,
    borderColor: colors.ink,
    borderRadius: radius.thumb,
    backgroundColor: colors.surface,
  },
  itemTitle: { ...type.body, fontFamily: fonts.bold, lineHeight: 20, color: colors.ink },
  rowLabel: { ...type.bodySm, fontFamily: fonts.bold, color: colors.ink },
  rowValue: { ...type.bodySm, fontFamily: fonts.black, color: colors.ink },
  photoStrip: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  photoThumb: {
    width: PHOTO_THUMB,
    height: PHOTO_THUMB,
    borderRadius: space.sm,
    borderWidth: border.thin,
    borderColor: colors.ink,
    backgroundColor: colors.tan,
  },
  moreText: { ...type.labelSm, color: colors.ink },
  addPhoto: {
    width: 34,
    height: 34,
    borderRadius: space.sm,
    borderWidth: border.thin,
    borderStyle: 'dashed',
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoError: { ...type.caption, color: colors.danger, marginTop: space.xs, marginLeft: space.xs },
  photoHint: { ...type.caption, color: colors.mutedAlt, marginTop: space.xs, marginLeft: space.xs },
  statusGrid: { flexDirection: 'row', gap: space.md },
  statusCell: {
    flex: 1,
    gap: 4,
    padding: space.md,
    borderWidth: border.thin,
    borderColor: colors.ink,
    borderRadius: radius.thumb,
    backgroundColor: colors.surface,
  },
  statusCellTapped: { backgroundColor: colors.lime },
  statusLabel: { ...type.caption, color: colors.muted },
  statusValueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusTapped: { ...type.label, color: colors.ink },
  statusWaiting: { ...type.label, fontFamily: fonts.regular, color: colors.mutedAlt },
  countdown: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
  },
  countdownText: { ...type.label, fontFamily: fonts.black, color: colors.green },
  countdownClosed: { color: colors.onInk },
  explainer: { marginHorizontal: shadow.lg / 2 },
  explainerText: { ...type.label, fontFamily: fonts.regular, lineHeight: 20, color: colors.onInkMuted },
  explainerStrong: { fontFamily: fonts.black, color: colors.green },
  footerStack: { gap: space.xs },
})
