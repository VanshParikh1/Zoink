import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Share,
  Dimensions,
  FlatList,
} from 'react-native'
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { getListing, setAvailability, deleteListing } from '../services/listingsApi'
import { useAuth } from '../context/AuthContext'
import { Listing } from '../types'

type Nav   = NativeStackNavigationProp<RootStackParamList>
type Route = RouteProp<RootStackParamList, 'ListingDetail'>

const { width: SCREEN_WIDTH } = Dimensions.get('window')

export default function ListingDetailScreen() {
  const nav         = useNavigation<Nav>()
  const route       = useRoute<Route>()
  const { user }    = useAuth()
  const listingId   = route.params.listingId

  const [listing, setListing]     = useState<Listing | null>(null)
  const [loading, setLoading]     = useState(true)
  const [toggling, setToggling]   = useState(false)
  const [activeImg, setActiveImg] = useState(0)

  const isOwner = listing?.ownerId === user?.id

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchListing = useCallback(async () => {
    try {
      const data = await getListing(listingId)
      setListing(data)
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not load listing.')
      nav.goBack()
    } finally {
      setLoading(false)
    }
  }, [listingId])

  useEffect(() => { fetchListing() }, [fetchListing])

  // ── Owner actions ─────────────────────────────────────────────────────────

  async function handleToggleAvailability() {
    if (!listing) return
    setToggling(true)
    try {
      const result = await setAvailability(listing.id, !listing.isAvailable)
      setListing(prev => prev ? { ...prev, isAvailable: result.isAvailable } : prev)
    } catch {
      Alert.alert('Error', 'Could not update availability.')
    } finally {
      setToggling(false)
    }
  }

  async function handleDelete() {
    Alert.alert(
      'Delete listing?',
      'This cannot be undone. Any pending bookings will be affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteListing(listingId)
              nav.navigate('MyListings')
            } catch {
              Alert.alert('Error', 'Could not delete listing.')
            }
          },
        },
      ]
    )
  }

  async function handleShare() {
    if (!listing) return
    await Share.share({ message: `Check out "${listing.title}" on Zoink — $${listing.dailyPrice}/day in ${listing.city}` })
  }

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6C47FF" />
      </View>
    )
  }

  if (!listing) return null

  const hasImages = listing.images && listing.images.length > 0

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Image carousel */}
        {hasImages ? (
          <View style={styles.carouselContainer}>
            <FlatList
              data={listing.images}
              keyExtractor={item => item.id}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={e => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH)
                setActiveImg(idx)
              }}
              renderItem={({ item }) => (
                <Image source={{ uri: item.url }} style={styles.carouselImage} resizeMode="cover" />
              )}
            />
            {listing.images.length > 1 && (
              <View style={styles.dotRow}>
                {listing.images.map((_, i) => (
                  <View key={i} style={[styles.dot, i === activeImg && styles.dotActive]} />
                ))}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.noImageBox}>
            <Text style={styles.noImageText}>📷 No photos yet</Text>
          </View>
        )}

        {/* Back + share */}
        <View style={styles.floatingRow}>
          <TouchableOpacity style={styles.floatingBtn} onPress={() => nav.goBack()}>
            <Text style={styles.floatingBtnText}>←</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.floatingBtn} onPress={handleShare}>
            <Text style={styles.floatingBtnText}>↑</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          {/* Availability badge */}
          <View style={styles.badgeRow}>
            <View style={[styles.badge, listing.isAvailable ? styles.badgeAvail : styles.badgeUnavail]}>
              <Text style={styles.badgeText}>{listing.isAvailable ? '● Available' : '○ Unavailable'}</Text>
            </View>
            <Text style={styles.category}>{listing.category}</Text>
          </View>

          {/* Title + price */}
          <Text style={styles.title}>{listing.title}</Text>
          <Text style={styles.price}>${Number(listing.dailyPrice).toFixed(2)}<Text style={styles.perDay}> / day</Text></Text>

          {/* Location */}
          <Text style={styles.location}>📍 {listing.address ? `${listing.address}, ` : ''}{listing.city}</Text>

          {/* Description */}
          <Text style={styles.sectionTitle}>About this item</Text>
          <Text style={styles.description}>{listing.description}</Text>

          {/* Owner */}
          <Text style={styles.sectionTitle}>Listed by</Text>
          <View style={styles.ownerRow}>
            {listing.owner.avatarUrl ? (
              <Image source={{ uri: listing.owner.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitial}>
                  {listing.owner.firstName?.[0]?.toUpperCase() ?? '?'}
                </Text>
              </View>
            )}
            <View>
              <Text style={styles.ownerName}>{listing.owner.firstName} {listing.owner.lastName}</Text>
              {listing.owner.verificationStatus === 'VERIFIED' && (
                <Text style={styles.verified}>✓ Verified student</Text>
              )}
            </View>
          </View>

          {/* Owner actions */}
          {isOwner && (
            <View style={styles.ownerActions}>
              <Text style={styles.sectionTitle}>Manage listing</Text>

              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => nav.navigate('EditListing', { listingId: listing.id })}
              >
                <Text style={styles.editBtnText}>✏️  Edit details</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.availBtn, listing.isAvailable ? styles.availBtnOff : styles.availBtnOn]}
                onPress={handleToggleAvailability}
                disabled={toggling}
              >
                {toggling ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.availBtnText}>
                    {listing.isAvailable ? 'Mark as unavailable' : 'Mark as available'}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
                <Text style={styles.deleteBtnText}>🗑  Delete listing</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Footer CTA — only show for non-owners */}
      {!isOwner && (
        <View style={styles.footer}>
          <View>
            <Text style={styles.footerPrice}>${Number(listing.dailyPrice).toFixed(2)}<Text style={styles.footerPerDay}>/day</Text></Text>
            <Text style={styles.footerCity}>{listing.city}</Text>
          </View>
          <TouchableOpacity
            style={[styles.rentBtn, !listing.isAvailable && styles.rentBtnDisabled]}
            disabled={!listing.isAvailable}
          >
            <Text style={styles.rentBtnText}>
              {listing.isAvailable ? 'Request to rent' : 'Unavailable'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

const PURPLE = '#6C47FF'
const DARK   = '#0D0D14'
const CARD   = '#1A1A2E'
const MUTED  = '#888'

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: DARK },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: DARK },

  carouselContainer: { position: 'relative' },
  carouselImage:     { width: SCREEN_WIDTH, height: 280 },
  dotRow:            { flexDirection: 'row', justifyContent: 'center', position: 'absolute', bottom: 12, width: '100%', gap: 6 },
  dot:               { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)' },
  dotActive:         { backgroundColor: '#fff', width: 18 },

  noImageBox:  { height: 200, backgroundColor: CARD, justifyContent: 'center', alignItems: 'center' },
  noImageText: { color: MUTED, fontSize: 16 },

  floatingRow: { flexDirection: 'row', justifyContent: 'space-between', position: 'absolute', top: 50, left: 16, right: 16 },
  floatingBtn: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  floatingBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },

  content: { padding: 24 },

  badgeRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  badge:     { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  badgeAvail:   { backgroundColor: 'rgba(52, 211, 153, 0.15)' },
  badgeUnavail: { backgroundColor: 'rgba(239, 68, 68, 0.15)' },
  badgeText:    { fontSize: 12, fontWeight: '600', color: '#34D399' },
  category:     { fontSize: 12, color: MUTED, fontWeight: '500' },

  title:    { fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 6 },
  price:    { fontSize: 26, fontWeight: '800', color: PURPLE, marginBottom: 4 },
  perDay:   { fontSize: 16, fontWeight: '400', color: MUTED },
  location: { fontSize: 14, color: MUTED, marginBottom: 20 },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginTop: 24, marginBottom: 10 },
  description:  { fontSize: 15, color: '#bbb', lineHeight: 22 },

  ownerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar:   { width: 48, height: 48, borderRadius: 24 },
  avatarPlaceholder: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: PURPLE, alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { color: '#fff', fontSize: 20, fontWeight: '700' },
  ownerName:     { fontSize: 15, fontWeight: '600', color: '#fff' },
  verified:      { fontSize: 12, color: '#34D399', marginTop: 2 },

  ownerActions:  { marginTop: 8 },
  editBtn: {
    backgroundColor: CARD,
    borderRadius: 12, paddingVertical: 13,
    alignItems: 'center', marginBottom: 10,
    borderWidth: 1, borderColor: '#2a2a40',
  },
  editBtnText:  { color: '#fff', fontWeight: '600', fontSize: 15 },
  availBtn:     { borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginBottom: 10 },
  availBtnOn:   { backgroundColor: 'rgba(52, 211, 153, 0.2)' },
  availBtnOff:  { backgroundColor: 'rgba(239, 68, 68, 0.15)' },
  availBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  deleteBtn:    { alignItems: 'center', paddingVertical: 10 },
  deleteBtnText:{ color: '#EF4444', fontWeight: '600', fontSize: 14 },

  footer: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: CARD, paddingHorizontal: 24, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: '#2a2a40',
  },
  footerPrice:   { fontSize: 20, fontWeight: '800', color: '#fff' },
  footerPerDay:  { fontSize: 14, fontWeight: '400', color: MUTED },
  footerCity:    { fontSize: 12, color: MUTED, marginTop: 2 },
  rentBtn:       { backgroundColor: PURPLE, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 24 },
  rentBtnDisabled: { backgroundColor: '#333' },
  rentBtnText:   { color: '#fff', fontWeight: '700', fontSize: 15 },
})
