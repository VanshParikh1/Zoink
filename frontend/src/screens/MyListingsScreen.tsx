import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { useNavigation, useFocusEffect } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { getMyListings } from '../services/listingsApi'
import { Listing } from '../types'

type Nav = NativeStackNavigationProp<RootStackParamList>

export default function MyListingsScreen() {
  const nav = useNavigation<Nav>()
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchListings = useCallback(async () => {
    try {
      const data = await getMyListings()
      setListings(data)
    } catch (err) {
      console.error('Failed to fetch my listings', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      fetchListings()
    }, [fetchListings])
  )

  const onRefresh = () => {
    setRefreshing(true)
    fetchListings()
  }

  const renderItem = ({ item }: { item: Listing }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => nav.navigate('ListingDetail', { listingId: item.id })}
    >
      <Image
        source={
          item.images.length > 0
            ? { uri: item.images[0].url }
            : { uri: 'https://via.placeholder.com/150' }
        }
        style={styles.image}
      />
      <View style={styles.cardContent}>
        <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.price}>${Number(item.dailyPrice).toFixed(2)} / day</Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, item.isAvailable ? styles.availDot : styles.unavailDot]} />
          <Text style={styles.statusText}>{item.isAvailable ? 'Available' : 'Unavailable'}</Text>
        </View>
      </View>
      <Text style={styles.arrow}>›</Text>
    </TouchableOpacity>
  )

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6C47FF" />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Listings</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => nav.navigate('CreateListing')}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={listings}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6C47FF" />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>You haven't listed anything yet.</Text>
            <TouchableOpacity style={styles.btn} onPress={() => nav.navigate('CreateListing')}>
              <Text style={styles.btnText}>Create your first listing</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D14' },
  center: { flex: 1, backgroundColor: '#0D0D14', justifyContent: 'center', alignItems: 'center' },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A2E',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  backBtn: { width: 60 },
  backText: { color: '#6C47FF', fontSize: 16, fontWeight: '600' },
  addBtn: { width: 60, alignItems: 'flex-end' },
  addBtnText: { color: '#6C47FF', fontSize: 16, fontWeight: '600' },
  list: { padding: 20 },
  card: {
    flexDirection: 'row',
    backgroundColor: '#1A1A2E',
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  image: { width: 70, height: 70, borderRadius: 12, backgroundColor: '#333' },
  cardContent: { flex: 1, marginLeft: 16 },
  title: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 4 },
  price: { fontSize: 14, color: '#6C47FF', fontWeight: '600', marginBottom: 6 },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  availDot: { backgroundColor: '#34D399' },
  unavailDot: { backgroundColor: '#EF4444' },
  statusText: { fontSize: 12, color: '#888' },
  arrow: { fontSize: 24, color: '#333', marginLeft: 8 },
  empty: { marginTop: 100, alignItems: 'center' },
  emptyText: { color: '#888', fontSize: 16, marginBottom: 20 },
  btn: { backgroundColor: '#6C47FF', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  btnText: { color: '#fff', fontWeight: '700' },
})
