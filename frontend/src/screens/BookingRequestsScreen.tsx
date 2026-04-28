import React, { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { acceptBooking, declineBooking, getIncomingRequests } from '../services/bookingsApi'
import { Booking } from '../types'
import { theme } from '../theme/colors'

type Nav = NativeStackNavigationProp<RootStackParamList>

export default function BookingRequestsScreen() {
  const nav = useNavigation<Nav>()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const loadBookings = useCallback(async () => {
    try {
      const nextBookings = await getIncomingRequests()
      setBookings(nextBookings)
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not load incoming requests.')
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
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={bookings}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {
          setRefreshing(true)
          loadBookings()
        }} tintColor={theme.primary} />}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <TouchableOpacity onPress={() => nav.goBack()}>
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Incoming requests</Text>
            <Text style={styles.subtitle}>Approve or decline rental requests on your listings.</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.emptyText}>No requests have landed yet.</Text>}
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
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.screen },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.screen },
  content: { padding: 24, paddingTop: 64, paddingBottom: 32 },
  header: { marginBottom: 8 },
  backText: { color: theme.textMuted, fontSize: 14, fontWeight: '700', marginBottom: 18 },
  title: { color: theme.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: theme.textMuted, fontSize: 15, marginTop: 8 },
  emptyText: { color: theme.textMuted, fontSize: 15, marginTop: 24 },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 14,
  },
  cardTitle: { color: theme.text, fontSize: 17, fontWeight: '900', marginBottom: 8 },
  cardMeta: { color: theme.textMuted, fontSize: 14, marginBottom: 14, lineHeight: 20 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardPrice: { color: theme.primary, fontSize: 16, fontWeight: '900' },
  cardStatus: { color: theme.text, fontSize: 13, fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  acceptButton: { flex: 1, backgroundColor: theme.primary, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  acceptText: { color: theme.primaryText, fontSize: 14, fontWeight: '900' },
  declineButton: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: theme.border, paddingVertical: 12, alignItems: 'center' },
  declineText: { color: theme.text, fontSize: 14, fontWeight: '800' },
})
