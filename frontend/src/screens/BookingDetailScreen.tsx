import React, { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, Dimensions, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import ScreenBackground from '../components/ScreenBackground'
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { acceptBooking, cancelBooking, declineBooking, getBooking, getHandoffPhotos } from '../services/bookingsApi'
import { getMyDisputes } from '../services/disputesApi'
import { useAuth } from '../context/AuthContext'
import { Booking, Dispute, DisputeStatus } from '../types'
import { theme } from '../theme/colors'

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

type Nav = NativeStackNavigationProp<RootStackParamList>
type ScreenRoute = RouteProp<RootStackParamList, 'BookingDetail'>

// Mirrors modalScreen's horizontal padding (24 * 2) so thumbnails fill the width evenly.
const PHOTO_PREVIEW_WIDTH = Dimensions.get('window').width - 48

export default function BookingDetailScreen() {
  const nav = useNavigation<Nav>()
  const route = useRoute<ScreenRoute>()
  const { user } = useAuth()
  const [booking, setBooking] = useState<Booking | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [photosModalVisible, setPhotosModalVisible] = useState(false)
  const [handoffPhotos, setHandoffPhotos] = useState<{ pickupPhotos: string[]; returnPhotos: string[] } | null>(null)
  const [myDispute, setMyDispute] = useState<Dispute | null>(null)

  const isOwner = booking?.ownerId === user?.id
  const isRenter = booking?.renterId === user?.id

  const loadDispute = useCallback(async (currentBooking: Booking) => {
    if (currentBooking.disputeStatus === 'NONE') {
      setMyDispute(null)
      return
    }

    try {
      const myDisputes = await getMyDisputes()
      // getMyDisputes only returns disputes raised by the current user, so this
      // stays null when the other party filed the dispute — the booking's own
      // disputeStatus/disputeReason fields are still shown in that case.
      setMyDispute(myDisputes.find((item) => item.bookingId === currentBooking.id) ?? null)
    } catch {
      setMyDispute(null)
    }
  }, [])

  const loadBooking = useCallback(async () => {
    try {
      const nextBooking = await getBooking(route.params.bookingId)
      setBooking(nextBooking)
      loadDispute(nextBooking)
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not load this booking.')
      nav.goBack()
    } finally {
      setLoading(false)
    }
  }, [nav, route.params.bookingId, loadDispute])

  useFocusEffect(
    useCallback(() => {
      loadBooking()
    }, [loadBooking])
  )

  async function runAction(action: () => Promise<Booking>, onSuccess?: (updated: Booking) => void) {
    setBusy(true)
    try {
      const updated = await action()
      setBooking(updated)
      onSuccess?.(updated)
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not update this booking.')
    } finally {
      setBusy(false)
    }
  }

  async function handleViewPhotos() {
    if (!booking) return
    const bookingPhotos = {
      pickupPhotos: booking.pickupPhotos ?? [],
      returnPhotos: booking.returnPhotos ?? [],
    }
    setHandoffPhotos(bookingPhotos)
    setPhotosModalVisible(true)
    setBusy(true)
    try {
      const photos = await getHandoffPhotos(booking.id)
      setHandoffPhotos({
        pickupPhotos: photos.pickupPhotos.length > 0 ? photos.pickupPhotos : bookingPhotos.pickupPhotos,
        returnPhotos: photos.returnPhotos.length > 0 ? photos.returnPhotos : bookingPhotos.returnPhotos,
      })
    } catch (err: any) {
      if ((booking.pickupPhotos?.length ?? 0) === 0 && (booking.returnPhotos?.length ?? 0) === 0) {
        Alert.alert('Error', err?.response?.data?.error ?? 'Could not load handoff photos.')
      }
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

  if (!booking) return null

  const completedPickupPhotos = booking.pickupPhotos ?? []
  const completedReturnPhotos = booking.returnPhotos ?? []

  const disputeIsActive = ACTIVE_DISPUTE_STATUSES.includes(booking.disputeStatus)
  const disputeIsResolved = RESOLVED_DISPUTE_STATUSES.includes(booking.disputeStatus)
  const canFileDispute = DISPUTABLE_BOOKING_STATUSES.includes(booking.status) && !disputeIsActive

  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => nav.goBack()}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>{booking.listing.title}</Text>
        <Text style={styles.subtitle}>{booking.status}</Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Dates</Text>
            <Text style={styles.value}>
              {new Date(booking.startDate).toLocaleDateString()} - {new Date(booking.endDate).toLocaleDateString()}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Rental total</Text>
            <Text style={styles.value}>${booking.totalPrice.toFixed(2)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Deposit</Text>
            <Text style={styles.value}>${booking.depositAmount.toFixed(2)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{isOwner ? 'Renter' : 'Owner'}</Text>
            <Text style={styles.value}>
              {isOwner ? `${booking.renter.firstName} ${booking.renter.lastName}` : `${booking.owner.firstName} ${booking.owner.lastName}`}
            </Text>
          </View>
        </View>

        {booking.message ? (
          <View style={styles.card}>
            <Text style={styles.messageTitle}>Request note</Text>
            <Text style={styles.messageBody}>{booking.message}</Text>
          </View>
        ) : null}

        {disputeIsActive ? (
          <View style={styles.disputeBanner}>
            <Text style={styles.disputeBannerText}>{disputeActiveLabel(booking.disputeStatus)}</Text>
          </View>
        ) : null}

        {disputeIsResolved ? (
          <View style={styles.card}>
            <Text style={styles.messageTitle}>{disputeOutcomeLabel(booking.disputeStatus)}</Text>
            {myDispute?.resolutionNotes ? <Text style={styles.messageBody}>{myDispute.resolutionNotes}</Text> : null}
          </View>
        ) : null}

        {canFileDispute ? (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => nav.navigate('FileDispute', { bookingId: booking.id, listingTitle: booking.listing.title })}
            disabled={busy}
          >
            <Text style={styles.secondaryText}>Report a Problem</Text>
          </TouchableOpacity>
        ) : null}

        {booking.status === 'COMPLETED' ? (
          <View style={styles.photosCard}>
            <View style={styles.photosHeader}>
              <Text style={styles.photosTitle}>Pickup Photos</Text>
              <Text style={styles.photosCount}>{completedPickupPhotos.length}</Text>
            </View>
            <View style={styles.inlinePhotoColumn}>
              {completedPickupPhotos.length > 0 ? (
                completedPickupPhotos.map((url) => (
                  <TouchableOpacity key={url} onPress={handleViewPhotos}>
                    <Image source={{ uri: url }} style={styles.inlinePhoto} resizeMode="cover" />
                  </TouchableOpacity>
                ))
              ) : (
                <Text style={styles.emptyPhotosText}>No pickup photos found.</Text>
              )}
            </View>

            <View style={styles.photosHeader}>
              <Text style={styles.photosTitle}>Return Photos</Text>
              <Text style={styles.photosCount}>{completedReturnPhotos.length}</Text>
            </View>
            <View style={styles.inlinePhotoColumn}>
              {completedReturnPhotos.length > 0 ? (
                completedReturnPhotos.map((url) => (
                  <TouchableOpacity key={url} onPress={handleViewPhotos}>
                    <Image source={{ uri: url }} style={styles.inlinePhoto} resizeMode="cover" />
                  </TouchableOpacity>
                ))
              ) : (
                <Text style={styles.emptyPhotosText}>No return photos found.</Text>
              )}
            </View>
          </View>
        ) : null}

        <View style={styles.actions}>
          {isOwner && booking.status === 'PENDING' ? (
            <>
              <TouchableOpacity style={styles.primaryButton} onPress={() => runAction(() => acceptBooking(booking.id))} disabled={busy}>
                <Text style={styles.primaryText}>{busy ? 'Saving...' : 'Accept request'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => runAction(() => declineBooking(booking.id))} disabled={busy}>
                <Text style={styles.secondaryText}>Decline</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {isOwner && booking.status === 'ACCEPTED' ? (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => nav.navigate('ZoinkIt', { bookingId: booking.id, mode: 'pickup' })}
              disabled={busy}
            >
              <Text style={styles.primaryText}>Start Handoff</Text>
            </TouchableOpacity>
          ) : null}

          {isRenter && booking.status === 'ACTIVE' ? (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => nav.navigate('ZoinkIt', { bookingId: booking.id, mode: 'return' })}
              disabled={busy}
            >
              <Text style={styles.primaryText}>Start Return</Text>
            </TouchableOpacity>
          ) : null}

          {booking.status === 'PICKUP_PENDING' ? (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => nav.navigate('ZoinkIt', { bookingId: booking.id, mode: 'pickup' })}
              disabled={busy}
            >
              <Text style={styles.secondaryText}>Zoink It</Text>
            </TouchableOpacity>
          ) : null}

          {booking.status === 'RETURN_PENDING' ? (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => nav.navigate('ZoinkIt', { bookingId: booking.id, mode: 'return' })}
              disabled={busy}
            >
              <Text style={styles.secondaryText}>Zoink It</Text>
            </TouchableOpacity>
          ) : null}

          {booking.status === 'COMPLETED' && booking.pendingReview ? (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() =>
                nav.reset({
                  index: 0,
                  routes: [{ name: 'ReviewPrompt', params: { review: booking.pendingReview! } }],
                })
              }
              disabled={busy}
            >
              <Text style={styles.primaryText}>Leave required review</Text>
            </TouchableOpacity>
          ) : null}

          {booking.status === 'COMPLETED' ? (
            <TouchableOpacity style={styles.secondaryButton} onPress={handleViewPhotos} disabled={busy}>
              <Text style={styles.secondaryText}>View Photos</Text>
            </TouchableOpacity>
          ) : null}

          {booking.status === 'PENDING' || booking.status === 'ACCEPTED' || booking.status === 'PICKUP_PENDING' ? (
            <TouchableOpacity style={styles.secondaryButton} onPress={() => runAction(() => cancelBooking(booking.id))} disabled={busy}>
              <Text style={styles.secondaryText}>Cancel booking</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>

      <Modal visible={photosModalVisible} animationType="slide" onRequestClose={() => setPhotosModalVisible(false)}>
        <View style={styles.modalScreen}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeading}>Rental Photos</Text>
              <TouchableOpacity onPress={() => setPhotosModalVisible(false)}>
                <Text style={styles.closeText}>Close</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalTitle}>Pickup Photos ({handoffPhotos?.pickupPhotos.length ?? 0})</Text>
            <View style={styles.photoColumn}>
              {(handoffPhotos?.pickupPhotos ?? []).length > 0 ? (
                (handoffPhotos?.pickupPhotos ?? []).map((url, idx) => (
                  <TouchableOpacity
                    key={url}
                    onPress={() => nav.navigate('PhotoViewer', { photos: handoffPhotos!.pickupPhotos, initialIndex: idx })}
                  >
                    <Image source={{ uri: url }} style={styles.photoPreview} resizeMode="contain" resizeMethod="scale" />
                  </TouchableOpacity>
                ))
              ) : (
                <Text style={styles.emptyPhotosText}>No pickup photos found.</Text>
              )}
            </View>
            <Text style={styles.modalTitle}>Return Photos ({handoffPhotos?.returnPhotos.length ?? 0})</Text>
            <View style={styles.photoColumn}>
              {(handoffPhotos?.returnPhotos ?? []).length > 0 ? (
                (handoffPhotos?.returnPhotos ?? []).map((url, idx) => (
                  <TouchableOpacity
                    key={url}
                    onPress={() => nav.navigate('PhotoViewer', { photos: handoffPhotos!.returnPhotos, initialIndex: idx })}
                  >
                    <Image source={{ uri: url }} style={styles.photoPreview} resizeMode="contain" resizeMethod="scale" />
                  </TouchableOpacity>
                ))
              ) : (
                <Text style={styles.emptyPhotosText}>No return photos found.</Text>
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </ScreenBackground>
  )
}

const styles = StyleSheet.create({
  content: { padding: 24, paddingTop: 64, paddingBottom: 40, gap: 16 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.screen },
  backText: { color: theme.textMuted, fontSize: 14, fontWeight: '700', marginBottom: 18 },
  title: { ...theme.type.screenTitle },
  subtitle: { color: theme.primary, fontSize: 15, fontWeight: '800', marginTop: 8 },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 8,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.border,
    gap: 12,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  label: { color: theme.textMuted, fontSize: 14, flex: 1 },
  value: { color: theme.text, fontSize: 14, fontWeight: '800', flex: 1, textAlign: 'right' },
  messageTitle: { color: theme.text, fontSize: 15, fontWeight: '900' },
  messageBody: { color: theme.textMuted, fontSize: 15, lineHeight: 22 },
  disputeBanner: {
    backgroundColor: theme.warningSurface,
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.warning,
  },
  disputeBannerText: { color: theme.text, fontSize: 14, fontWeight: '800' },
  photosCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
    gap: 14,
  },
  photosHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  photosTitle: { color: '#111114', fontSize: 18, fontWeight: '900' },
  photosCount: {
    minWidth: 28,
    textAlign: 'center',
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: theme.primarySurface,
    color: theme.primaryDeep,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 12,
    fontWeight: '900',
  },
  inlinePhotoColumn: { gap: 10 },
  inlinePhoto: { width: '100%', height: 210, borderRadius: 8, backgroundColor: theme.surfaceSubdued },
  actions: { gap: 12, marginTop: 8 },
  primaryButton: { backgroundColor: theme.primary, borderRadius: 8, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: theme.textOnPrimary, fontSize: 15, fontWeight: '900' },
  secondaryButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surface,
    paddingHorizontal: 12,
  },
  secondaryText: { color: theme.text, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  modalScreen: { flex: 1, backgroundColor: '#000000', padding: 24, paddingTop: 64 },
  modalContent: { gap: 16, paddingBottom: 32 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalHeading: { color: '#FFFFFF', fontSize: 28, fontWeight: '900' },
  closeText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  modalTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  photoColumn: { gap: 12, minHeight: 24 },
  photoPreview: { width: PHOTO_PREVIEW_WIDTH, height: 220, borderRadius: 8, backgroundColor: '#000000' },
  emptyPhotosText: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '700' },
})
