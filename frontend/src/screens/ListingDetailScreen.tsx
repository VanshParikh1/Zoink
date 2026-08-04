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
import { Feather } from '@expo/vector-icons'
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
import HardBlock from '../components/HardBlock'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type Nav = NativeStackNavigationProp<RootStackParamList>
type Route = RouteProp<RootStackParamList, 'ListingDetail'>

const { width: SCREEN_WIDTH } = Dimensions.get('window')

export default function ListingDetailScreen() {
  const nav = useNavigation<Nav>()
  const route = useRoute<Route>()
  const insets = useSafeAreaInsets()
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

  function handleReport() {
    if (!listing) return

    nav.navigate('FileReport', {
      targetType: 'LISTING',
      targetId: listing.id,
      targetLabel: listing.title,
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
        <View style={styles.floatingRow}>
          <HardBlock radius={theme.radius.pill} offset={theme.hard.offset.sm} style={styles.floatingBtnWrap} contentStyle={styles.floatingBtn}>
            <TouchableOpacity
              accessibilityLabel="Go back"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                nav.goBack()
              }}
            >
              <Feather name="chevron-left" size={22} color={theme.text} />
            </TouchableOpacity>
          </HardBlock>
          <HardBlock radius={theme.radius.pill} offset={theme.hard.offset.sm} style={styles.floatingBtnWrap} contentStyle={styles.floatingBtn}>
            <TouchableOpacity
              accessibilityLabel="Share this listing"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                handleShare()
              }}
            >
              <Feather name="share" size={18} color={theme.text} />
            </TouchableOpacity>
          </HardBlock>
        </View>

        <HardBlock radius={theme.radius.lg} offset={theme.hard.offset.lg} style={styles.contentWrap} contentStyle={styles.content}>
          {hasImages ? (
            <View style={styles.carouselContainer}>
              <FlatList
                style={{ width: SCREEN_WIDTH - 80 }}
                data={listing.images}
                keyExtractor={(item) => item.id}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(event) => {
                  const idx = Math.round(event.nativeEvent.contentOffset.x / (SCREEN_WIDTH - 80))
                  setActiveImg(idx)
                }}
                renderItem={({ item, index }) => (
                  <View style={{ width: SCREEN_WIDTH - 80 }}>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() =>
                        nav.navigate('PhotoViewer', {
                          photos: listing.images.map((img) => img.url),
                          initialIndex: index,
                        })
                      }
                    >
                      <Image source={{ uri: item.url }} style={styles.carouselImage} resizeMode="cover" />
                    </TouchableOpacity>
                  </View>
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

          <Text style={styles.location}>{listing.city}</Text>

          <Text style={styles.sectionTitle}>About this item</Text>
          <Text style={styles.description}>{listing.description}</Text>

          <Text style={styles.sectionTitle}>Listed by</Text>
          <View style={styles.ownerCardWrap}>
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
          </View>

          {!isOwner && (
            <TouchableOpacity style={styles.reportLink} onPress={handleReport}>
              <Text style={styles.reportLinkText}>Report this listing</Text>
            </TouchableOpacity>
          )}

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
        </HardBlock>
      </ScrollView>

      {!isOwner && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
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
              label={listing.isAvailable ? 'Request' : 'Unavailable'} 
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
  carouselContainer: { position: 'relative', marginBottom: 20 },
  carouselImage: { width: '100%', height: 240, borderRadius: theme.radius.md, borderWidth: theme.hard.borderThin, borderColor: theme.hard.ink },
  dotRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    position: 'absolute',
    bottom: 12,
    width: '100%',
    gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(252,255,252,0.45)' },
  dotActive: { backgroundColor: theme.textOnPrimary, width: 18 },
  noImageBox: { height: 180, backgroundColor: theme.surfaceSubdued, borderRadius: theme.radius.md, borderWidth: theme.hard.borderThin, borderColor: theme.hard.ink, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  noImageLogo: { marginBottom: 12 },
  noImageText: { color: theme.textMuted, fontSize: 16 },
  floatingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 50,
    marginBottom: 20,
    marginHorizontal: 16,
  },
  floatingBtnWrap: {},
  floatingBtn: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.cardBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentWrap: {
    marginHorizontal: 16,
    marginBottom: 40,
  },
  content: {
    padding: 24,
    backgroundColor: theme.cardBackground,
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  badge: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, borderWidth: theme.hard.borderThin, borderColor: theme.hard.ink },
  badgeAvail: { backgroundColor: theme.primarySurface },
  badgeUnavail: { backgroundColor: theme.colors.dangerSurface },
  badgeText: { fontSize: 12, fontWeight: '900', color: theme.text },
  badgeTextUnavailable: { color: theme.colors.danger },
  category: { fontSize: 12, color: theme.textMuted, fontWeight: '700' },
  title: { fontSize: 24, fontWeight: '900', color: theme.text, marginBottom: 6 },
  price: { fontSize: 26, fontWeight: '900', color: theme.primary, marginBottom: 4 },
  perDay: { fontSize: 16, fontWeight: '400', color: theme.textMuted },
  location: { fontSize: 14, color: theme.textMuted, marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: theme.text, marginTop: 24, marginBottom: 10 },
  description: { fontSize: 15, color: theme.textMuted, lineHeight: 22 },
  ownerCardWrap: {
    borderRadius: theme.radius.sm,
    backgroundColor: theme.hard.ink,
  },
  ownerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: theme.cardBackground,
    borderRadius: theme.radius.sm,
    padding: 16,
    borderWidth: theme.hard.border,
    borderColor: theme.hard.ink,
    marginRight: theme.hard.offset.sm,
    marginBottom: theme.hard.offset.sm,
  },
  avatar: { width: 48, height: 48, borderRadius: 24, borderWidth: theme.hard.borderThin, borderColor: theme.hard.ink },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.hard.borderThin,
    borderColor: theme.hard.ink,
  },
  avatarInitial: { color: theme.textOnPrimary, fontSize: 20, fontWeight: '900' },
  ownerName: { fontSize: 15, fontWeight: '800', color: theme.text },
  verified: { fontSize: 12, color: theme.primary, marginTop: 2, fontWeight: '800' },
  profileHint: { fontSize: 12, color: theme.textMuted, marginTop: 4, fontWeight: '700' },
  reportLink: { alignSelf: 'flex-start', marginTop: 12, paddingVertical: 4 },
  reportLinkText: { color: theme.textMuted, fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
  ownerActions: { marginTop: 8 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.surface,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: theme.hard.border,
    borderTopColor: theme.hard.ink,
  },
  footerPrice: { fontSize: 20, fontWeight: '900', color: theme.text },
  footerPerDay: { fontSize: 14, fontWeight: '400', color: theme.textMuted },
  footerCity: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  footerActions: {
    flexDirection: 'row',
    gap: 8,
    flex: 1,
    marginLeft: 20,
    justifyContent: 'flex-end',
  },
})

