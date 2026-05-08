import React, { useCallback, useEffect, useState } from 'react'
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
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import ScreenBackground from '../components/ScreenBackground'
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { getListing, setAvailability, deleteListing } from '../services/listingsApi'
import { openConversation } from '../services/conversationsApi'
import { useAuth } from '../context/AuthContext'
import { Listing } from '../types'
import ZoinkLogo from '../components/ZoinkLogo'
import { theme } from '../theme/colors'
import ZoinkButton from '../components/ZoinkButton'

type Nav = NativeStackNavigationProp<RootStackParamList>
type Route = RouteProp<RootStackParamList, 'ListingDetail'>

const { width: SCREEN_WIDTH } = Dimensions.get('window')

export default function ListingDetailScreen() {
  const nav = useNavigation<Nav>()
  const route = useRoute<Route>()
  const { user } = useAuth()
  const listingId = route.params.listingId

  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [activeImg, setActiveImg] = useState(0)

  const isOwner = listing?.ownerId === user?.id

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
  }, [listingId, nav])

  useEffect(() => {
    fetchListing()
  }, [fetchListing])

  async function handleToggleAvailability() {
    if (!listing) return

    setToggling(true)

    try {
      const result = await setAvailability(listing.id, !listing.isAvailable)
      setListing((prev) => (prev ? { ...prev, isAvailable: result.isAvailable } : prev))
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

    await Share.share({
      message: `Check out "${listing.title}" on Zoink - $${listing.dailyPrice}/day in ${listing.city}`,
    })
  }

  async function handleMessageOwner() {
    if (!listing) return

    try {
      const conversation = await openConversation(listing.id)
      nav.navigate('ConversationThread', {
        conversationId: conversation.id,
        title: listing.title,
      })
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not open conversation.')
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    )
  }

  if (!listing) return null

  const hasImages = listing.images.length > 0

  return (
    <ScreenBackground>
      <ScrollView showsVerticalScrollIndicator={false}>
        {hasImages ? (
          <View style={styles.carouselContainer}>
            <FlatList
              data={listing.images}
              keyExtractor={(item) => item.id}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(event) => {
                const idx = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH)
                setActiveImg(idx)
              }}
              renderItem={({ item }) => (
                <Image source={{ uri: item.url }} style={styles.carouselImage} resizeMode="cover" />
              )}
            />

            {listing.images.length > 1 && (
              <View style={styles.dotRow}>
                {listing.images.map((_, index) => (
                  <View key={index} style={[styles.dot, index === activeImg && styles.dotActive]} />
                ))}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.noImageBox}>
            <ZoinkLogo size={60} style={styles.noImageLogo} />
            <Text style={styles.noImageText}>No photos yet</Text>
          </View>
        )}

        <View style={styles.floatingRow}>
          <TouchableOpacity 
            style={styles.floatingBtn} 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
              nav.goBack()
            }}
          >
            <Text style={styles.floatingBtnText}>{'<'}</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.floatingBtn} 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
              handleShare()
            }}
          >
            <Text style={styles.floatingBtnText}>Share</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <View style={styles.badgeRow}>
            <View style={[styles.badge, listing.isAvailable ? styles.badgeAvail : styles.badgeUnavail]}>
              <Text style={[styles.badgeText, !listing.isAvailable && styles.badgeTextUnavailable]}>
                {listing.isAvailable ? 'Available' : 'Unavailable'}
              </Text>
            </View>
            <Text style={styles.category}>{listing.category}</Text>
          </View>

          <Text style={styles.title}>{listing.title}</Text>
          <Text style={styles.price}>
            ${Number(listing.dailyPrice).toFixed(2)}
            <Text style={styles.perDay}> / day</Text>
          </Text>

          <Text style={styles.location}>
            {listing.address ? `${listing.address}, ` : ''}
            {listing.city}
          </Text>

          <Text style={styles.sectionTitle}>About this item</Text>
          <Text style={styles.description}>{listing.description}</Text>

          <Text style={styles.sectionTitle}>Listed by</Text>
          <TouchableOpacity
            style={styles.ownerCard}
            activeOpacity={0.9}
            onPress={() => nav.navigate('PublicProfile', { userId: listing.owner.id })}
          >
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
              <Text style={styles.ownerName}>
                {listing.owner.firstName} {listing.owner.lastName}
              </Text>
              {listing.owner.verificationStatus === 'VERIFIED' && (
                <Text style={styles.verified}>Verified student</Text>
              )}
              <Text style={styles.profileHint}>Tap to view profile card</Text>
            </View>
          </TouchableOpacity>

          {isOwner && (
            <View style={styles.ownerActions}>
              <Text style={styles.sectionTitle}>Manage listing</Text>

              <ZoinkButton
                label="Edit details"
                variant="inset"
                onPress={() => nav.navigate('EditListing', { listingId: listing.id })}
                style={{ marginBottom: 12 }}
              />

              <ZoinkButton
                label={listing.isAvailable ? 'Mark as unavailable' : 'Mark as available'}
                variant={listing.isAvailable ? 'inset' : 'stamped'}
                onPress={handleToggleAvailability}
                isLoading={toggling}
                style={{ marginBottom: 12 }}
              />

              <ZoinkButton
                label="Delete listing"
                variant="danger"
                onPress={handleDelete}
              />
            </View>
          )}
        </View>
      </ScrollView>

      {!isOwner && (
        <View style={styles.footer}>
          <View>
            <Text style={styles.footerPrice}>
              ${Number(listing.dailyPrice).toFixed(2)}
              <Text style={styles.footerPerDay}>/day</Text>
            </Text>
            <Text style={styles.footerCity}>{listing.city}</Text>
          </View>

          <View style={styles.footerActions}>
            <ZoinkButton 
              label="Message" 
              variant="stampedOutline" 
              onPress={handleMessageOwner}
              style={{ flex: 1 }}
            />

            <ZoinkButton 
              label={listing.isAvailable ? 'Request to rent' : 'Unavailable'} 
              variant="stamped" 
              onPress={() => nav.navigate('BookingRequest', { listingId: listing.id })}
              disabled={!listing.isAvailable}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      )}
    </ScreenBackground>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  carouselContainer: { position: 'relative' },
  carouselImage: { width: SCREEN_WIDTH, height: 280 },
  dotRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    position: 'absolute',
    bottom: 12,
    width: '100%',
    gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(252,255,252,0.35)' },
  dotActive: { backgroundColor: theme.primary, width: 18 },
  noImageBox: { height: 240, backgroundColor: theme.surface, justifyContent: 'center', alignItems: 'center' },
  noImageLogo: { marginBottom: 12 },
  noImageText: { color: theme.textMuted, fontSize: 16 },
  floatingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
  },
  floatingBtn: {
    minWidth: 40,
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(4, 15, 15, 0.76)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingBtnText: { color: theme.text, fontSize: 14, fontWeight: '900' },
  content: { padding: 24 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  badge: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  badgeAvail: { backgroundColor: 'rgba(0, 239, 32, 0.16)' },
  badgeUnavail: { backgroundColor: 'rgba(239, 68, 68, 0.15)' },
  badgeText: { fontSize: 12, fontWeight: '900', color: theme.primary },
  badgeTextUnavailable: { color: '#F87171' },
  category: { fontSize: 12, color: theme.textMuted, fontWeight: '700' },
  title: { fontSize: 24, fontWeight: '900', color: theme.text, marginBottom: 6 },
  price: { fontSize: 26, fontWeight: '900', color: theme.primary, marginBottom: 4 },
  perDay: { fontSize: 16, fontWeight: '400', color: theme.textMuted },
  location: { fontSize: 14, color: theme.textMuted, marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: theme.text, marginTop: 24, marginBottom: 10 },
  description: { fontSize: 15, color: theme.textMuted, lineHeight: 22 },
  ownerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: theme.cardBackground,
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: theme.textOnPrimary, fontSize: 20, fontWeight: '900' },
  ownerName: { fontSize: 15, fontWeight: '800', color: theme.text },
  verified: { fontSize: 12, color: theme.primary, marginTop: 2, fontWeight: '800' },
  profileHint: { fontSize: 12, color: theme.textMuted, marginTop: 4, fontWeight: '700' },
  ownerActions: { marginTop: 8 },
  editBtn: {
    backgroundColor: theme.cardBackground,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  editBtnText: { color: theme.text, fontWeight: '800', fontSize: 15 },
  availBtn: { borderRadius: 8, paddingVertical: 13, alignItems: 'center', marginBottom: 10 },
  availBtnOn: { backgroundColor: theme.primary },
  availBtnOff: { backgroundColor: theme.colors.dangerSurface, borderWidth: 1, borderColor: theme.colors.danger },
  availBtnText: { color: theme.textOnPrimary, fontWeight: '900', fontSize: 15 },
  deleteBtn: { alignItems: 'center', paddingVertical: 10 },
  deleteBtnText: { color: theme.colors.danger, fontWeight: '600', fontSize: 14 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.surface,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  footerPrice: { fontSize: 20, fontWeight: '900', color: theme.text },
  footerPerDay: { fontSize: 14, fontWeight: '400', color: theme.textMuted },
  footerCity: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  footerActions: { gap: 10, minWidth: 170 },
  messageBtn: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
  },
  messageBtnText: { color: theme.text, fontWeight: '800', fontSize: 14 },
  rentBtn: { backgroundColor: theme.primary, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 24 },
  rentBtnDisabled: { backgroundColor: theme.primarySurface },
  rentBtnText: { color: theme.textOnPrimary, fontWeight: '900', fontSize: 15 },
})

