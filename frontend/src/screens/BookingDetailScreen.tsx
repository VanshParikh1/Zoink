import React, { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import ScreenBackground from '../components/ScreenBackground'
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { acceptBooking, activateBooking, cancelBooking, completeBooking, declineBooking, getBooking } from '../services/bookingsApi'
import { useAuth } from '../context/AuthContext'
import { Booking } from '../types'
import { theme } from '../theme/colors'

type Nav = NativeStackNavigationProp<RootStackParamList>
type ScreenRoute = RouteProp<RootStackParamList, 'BookingDetail'>

export default function BookingDetailScreen() {
  const nav = useNavigation<Nav>()
  const route = useRoute<ScreenRoute>()
  const { user } = useAuth()
  const [booking, setBooking] = useState<Booking | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const isOwner = booking?.ownerId === user?.id

  const loadBooking = useCallback(async () => {
    try {
      const nextBooking = await getBooking(route.params.bookingId)
      setBooking(nextBooking)
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not load this booking.')
      nav.goBack()
    } finally {
      setLoading(false)
    }
  }, [nav, route.params.bookingId])

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

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    )
  }

  if (!booking) return null

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
            <TouchableOpacity style={styles.primaryButton} onPress={() => runAction(() => activateBooking(booking.id))} disabled={busy}>
              <Text style={styles.primaryText}>{busy ? 'Saving...' : 'Mark rental as started'}</Text>
            </TouchableOpacity>
          ) : null}

          {isOwner && booking.status === 'ACTIVE' ? (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() =>
                runAction(() => completeBooking(booking.id), (updated) => {
                  if (updated.pendingReview) {
                    nav.reset({
                      index: 0,
                      routes: [{ name: 'ReviewPrompt', params: { review: updated.pendingReview } }],
                    })
                  }
                })
              }
              disabled={busy}
            >
              <Text style={styles.primaryText}>{busy ? 'Saving...' : 'Mark as returned'}</Text>
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

          {(booking.status === 'PENDING' || booking.status === 'ACCEPTED') ? (
            <TouchableOpacity style={styles.secondaryButton} onPress={() => runAction(() => cancelBooking(booking.id))} disabled={busy}>
              <Text style={styles.secondaryText}>Cancel booking</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>
    </ScreenBackground>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingTop: 64, paddingBottom: 40, gap: 16 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.screen },
  backText: { color: theme.textMuted, fontSize: 14, fontWeight: '700', marginBottom: 18 },
  title: { color: theme.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: theme.primary, fontSize: 15, fontWeight: '800', marginTop: 8 },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 22,
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
  actions: { gap: 12, marginTop: 8 },
  primaryButton: { backgroundColor: theme.primary, borderRadius: 16, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: theme.textOnPrimary, fontSize: 15, fontWeight: '900' },
  secondaryButton: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surface,
  },
  secondaryText: { color: theme.text, fontSize: 15, fontWeight: '800' },
})

