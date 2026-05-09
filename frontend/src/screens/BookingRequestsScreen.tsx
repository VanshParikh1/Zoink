import React, { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import ScreenBackground from '../components/ScreenBackground'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { acceptBooking, declineBooking, getIncomingRequests } from '../services/bookingsApi'
import { Booking } from '../types'
import { theme } from '../theme/colors'
import StateCard from '../components/StateCard'

type Nav = NativeStackNavigationProp<RootStackParamList>

export default function BookingRequestsScreen() {
  const nav = useNavigation<Nav>()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const loadBookings = useCallback(async () => {
    try {
      setError('')
      const nextBookings = await getIncomingRequests()
      setBookings(nextBookings)
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not load incoming requests.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadBookings()
    }, [loadBookings])
  )

  async function handleAction(id: string, action: 'accept' | 'decline') {
    setBusyId(id)

    try {
      const updated = action === 'accept' ? await acceptBooking(id) : await declineBooking(id)
      setBookings((current) => current.map((booking) => (booking.id === id ? updated : booking)))
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not update this request.')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={styles.loadingText}>Loading incoming requests...</Text>
      </View>
    )
  }

  return (
    <ScreenBackground>
      <FlatList
        data={bookings}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {
          setRefreshing(true)
          loadBookings()
        }} tintColor={theme.primary} colors={[theme.primary]} />}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <TouchableOpacity onPress={() => nav.goBack()}>
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Incoming requests</Text>
            <Text style={styles.subtitle}>Approve or decline rental requests on your listings.</Text>
            <Text style={styles.summaryText}>
              {bookings.length === 0
                ? 'No pending action right now'
                : `${bookings.filter((booking) => booking.status === 'PENDING').length} request${bookings.filter((booking) => booking.status === 'PENDING').length === 1 ? '' : 's'} waiting on you`}
            </Text>
          </View>
        }
        ListEmptyComponent={
          error ? (
            <StateCard
              tone="error"
              eyebrow="REQUEST ISSUE"
              title="Incoming requests couldnâ€™t load"
              body={error}
              actionLabel="Try again"
              onAction={loadBookings}
            />
          ) : (
            <StateCard
              eyebrow="ALL CLEAR"
              title="No requests have landed yet"
              body="As soon as someone wants one of your items, youâ€™ll be able to review dates and respond from here."
              actionLabel="View my listings"
              onAction={() => nav.navigate('MyListings')}
            />
          )
        }
        renderItem={({ item }) => {
          const isPending = item.status === 'PENDING'
          const isBusy = busyId === item.id

          return (
            <TouchableOpacity style={styles.card} onPress={() => nav.navigate('BookingDetail', { bookingId: item.id })}>
              <Text style={styles.cardTitle}>{item.listing.title}</Text>
              <Text style={styles.cardMeta}>
                {item.renter.firstName} {item.renter.lastName} requested {new Date(item.startDate).toLocaleDateString()} to{' '}
                {new Date(item.endDate).toLocaleDateString()}
              </Text>
              <View style={styles.cardRow}>
                <Text style={styles.cardPrice}>${item.totalPrice.toFixed(2)}</Text>
                <Text style={styles.cardStatus}>{item.status}</Text>
              </View>

              {isPending ? (
                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.acceptButton} onPress={() => handleAction(item.id, 'accept')} disabled={isBusy}>
                    <Text style={styles.acceptText}>{isBusy ? 'Saving...' : 'Accept'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.declineButton} onPress={() => handleAction(item.id, 'decline')} disabled={isBusy}>
                    <Text style={styles.declineText}>Decline</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </TouchableOpacity>
          )
        }}
      />
    </ScreenBackground>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.screen },
  loadingText: { marginTop: 12, color: theme.textMuted, fontSize: 15 },
  content: { padding: 24, paddingTop: 64, paddingBottom: 32 },
  header: { marginBottom: 8 },
  backText: { color: theme.textMuted, fontSize: 14, fontWeight: '700', marginBottom: 18 },
  title: { color: theme.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: theme.textMuted, fontSize: 15, marginTop: 8 },
  summaryText: { color: theme.textDisabled, fontSize: 13, marginTop: 10, fontWeight: '700' },
  card: {
    backgroundColor: theme.cardBackground,
    borderRadius: 8,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  cardTitle: { color: theme.text, fontSize: 17, fontWeight: '900', marginBottom: 8 },
  cardMeta: { color: theme.textMuted, fontSize: 14, marginBottom: 14, lineHeight: 20 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardPrice: { color: theme.primary, fontSize: 16, fontWeight: '900' },
  cardStatus: { color: theme.text, fontSize: 13, fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  acceptButton: { flex: 1, backgroundColor: theme.primary, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  acceptText: { color: theme.textOnPrimary, fontSize: 14, fontWeight: '900' },
  declineButton: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: theme.border, paddingVertical: 12, alignItems: 'center' },
  declineText: { color: theme.text, fontSize: 14, fontWeight: '800' },
})

