import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import Feather from '@expo/vector-icons/Feather'
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { RootStackParamList } from '../navigation'
import { getListing, setAvailability, deleteListing } from '../services/listingsApi'
import { openConversation } from '../services/conversationsApi'
import { useAuth } from '../context/AuthContext'
import { Listing } from '../types'
import { colors } from '../theme/colors'
import { border, radius, space } from '../theme/tokens'
import { fonts, type } from '../theme/typography'
import { categoryAbbreviation } from '../config/categories'
import { fillImageUrl } from '../utils/cloudinaryImage'
import Screen from '../components/mockup/Screen'
import Button from '../components/mockup/Button'
import IconButton from '../components/mockup/IconButton'
import Badge from '../components/mockup/Badge'
import Card from '../components/mockup/Card'
import Thumb from '../components/mockup/Thumb'
import HardShadow from '../components/mockup/HardShadow'
import { dailyPriceLabel, distanceLabel, listingDisplay } from '../components/mockup/listingFormat'
import LocationMapPreview from '../components/LocationMapPreview'

type Nav = NativeStackNavigationProp<RootStackParamList>
type Route = RouteProp<RootStackParamList, 'ListingDetail'>

// Hero photo area: about 30% of the screen, clamped for very small and very
// tall phones. The status-bar inset is added on top (the hero runs under it).
const HERO_MIN = 220
const HERO_MAX = 280
const HERO_SCREEN_SHARE = 0.29
const NO_PHOTO_THUMB = 132
const AVATAR = 40

function initialsOf(firstName?: string, lastName?: string) {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?'
}

export default function ListingDetailScreen() {
  const nav = useNavigation<Nav>()
  const route = useRoute<Route>()
  const insets = useSafeAreaInsets()
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()
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
        <ActivityIndicator size="large" color={colors.greenText} />
      </View>
    )
  }

  if (!listing) return null

  const photos = listing.images
  const heroHeight = Math.min(HERO_MAX, Math.max(HERO_MIN, Math.round(windowHeight * HERO_SCREEN_SHARE))) + insets.top
  const { deposit } = listingDisplay(listing)
  // "$X / day · Category", plus the distance only when the API sent one.
  const distanceKm = (listing as { distanceKm?: number | null }).distanceKm
  const priceWithCategory = [dailyPriceLabel(listing.dailyPrice), listing.category, distanceLabel(distanceKm)]
    .filter(Boolean)
    .join(' · ')
  const owner = listing.owner

  const hero = (
    <View style={[styles.hero, { height: heroHeight }]}>
      {photos.length > 0 ? (
        <FlatList
          data={photos}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) => {
            setActiveImg(Math.round(event.nativeEvent.contentOffset.x / windowWidth))
          }}
          renderItem={({ item, index }) => (
            <Pressable
              accessibilityRole="imagebutton"
              accessibilityLabel={`Photo ${index + 1} of ${photos.length}, open full screen`}
              onPress={() =>
                nav.navigate('PhotoViewer', {
                  photos: photos.map((img) => img.url),
                  initialIndex: index,
                })
              }
            >
              <Image
                source={{ uri: fillImageUrl(item.url, { width: windowWidth, height: heroHeight }) }}
                style={{ width: windowWidth, height: heroHeight }}
                resizeMode="cover"
              />
            </Pressable>
          )}
        />
      ) : (
        <View style={[styles.noPhotos, { paddingTop: insets.top }]}>
          <HardShadow offset="xl" radius={30}>
            <Thumb
              size={NO_PHOTO_THUMB}
              initials={categoryAbbreviation(listing.category)}
              initialsSize={38}
              style={styles.noPhotoThumb}
            />
          </HardShadow>
        </View>
      )}

      <View style={[styles.heroControls, { top: insets.top + space.sm }]} pointerEvents="box-none">
        <IconButton
          accessibilityLabel="Go back"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
            nav.goBack()
          }}
        >
          <Feather name="chevron-left" size={24} color={colors.ink} />
        </IconButton>
        <View style={styles.heroRight} pointerEvents="box-none">
          {photos.length > 1 ? (
            <Badge label={`${activeImg + 1} of ${photos.length} photos`} variant="surface" size={13} />
          ) : null}
          <IconButton
            accessibilityLabel="Share this listing"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
              handleShare()
            }}
          >
            <Feather name="share" size={18} color={colors.ink} />
          </IconButton>
        </View>
      </View>
    </View>
  )

  const footer = !isOwner ? (
    <View style={styles.footer}>
      <View style={styles.footerPriceBlock}>
        <Text style={styles.footerPrice}>${Number(listing.dailyPrice).toFixed(2)}/day</Text>
        <Text style={styles.footerCity}>{listing.city}</Text>
      </View>
      <Button
        label={listing.isAvailable ? 'Request' : 'Unavailable'}
        onPress={() => nav.navigate('BookingRequest', { listingId: listing.id })}
        disabled={!listing.isAvailable}
        style={styles.footerButton}
      />
    </View>
  ) : undefined

  return (
    <Screen edgeToEdgeTop contentStyle={styles.screenContent} footer={footer}>
      {hero}

      <View style={styles.body}>
        <Badge
          label={listing.isAvailable ? 'Available' : 'Unavailable'}
          variant={listing.isAvailable ? 'green' : 'surface'}
        />
        <Text style={styles.title}>{listing.title}</Text>
        <Text style={styles.priceLine}>
          {priceWithCategory}
        </Text>

        <Card shadow={false} padding={space.lg}>
          <View style={styles.ownerRow}>
            <Pressable
              style={styles.ownerTap}
              onPress={() => nav.navigate('PublicProfile', { userId: owner.id })}
              accessibilityRole="button"
              accessibilityLabel={`Listed by ${owner.firstName} ${owner.lastName}, view profile`}
            >
              <Thumb
                size={AVATAR}
                source={owner.avatarUrl ? { uri: fillImageUrl(owner.avatarUrl, { width: AVATAR, height: AVATAR }) } : undefined}
                initials={initialsOf(owner.firstName, owner.lastName)}
                initialsSize={15}
                style={styles.avatar}
              />
              <View style={styles.ownerText}>
                <Text style={styles.ownerName} numberOfLines={1}>
                  {owner.firstName} {owner.lastName}
                </Text>
                {owner.verificationStatus === 'VERIFIED' ? (
                  <Text style={styles.caption}>Verified student</Text>
                ) : null}
                {listing.reviewCount > 0 && listing.avgRating != null ? (
                  <View style={styles.ratingRow}>
                    <Feather name="star" size={12} color={colors.ink} />
                    <Text style={styles.caption}>
                      {listing.avgRating.toFixed(1)} · {listing.reviewCount} {listing.reviewCount === 1 ? 'review' : 'reviews'}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
            {!isOwner ? <Button label="Message" variant="secondary" size="sm" onPress={handleMessageOwner} /> : null}
          </View>
        </Card>

        <Card shadow={false} padding={space.lg}>
          <View style={styles.depositRow}>
            <Feather name="lock" size={18} color={colors.ink} />
            <Text style={styles.depositLabel}>Deposit</Text>
            {deposit ? (
              <Text style={styles.depositValue}>{deposit}</Text>
            ) : (
              <Text style={styles.depositNone}>No deposit</Text>
            )}
          </View>
        </Card>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About this item</Text>
          <Text style={styles.bodyText}>{listing.description}</Text>
        </View>

        {listing.latitude != null && listing.longitude != null ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>General area</Text>
            <LocationMapPreview latitude={listing.latitude} longitude={listing.longitude} height={140} zoom={13} hint={null} />
            <Text style={styles.caption}>{listing.city}</Text>
          </View>
        ) : null}

        {!isOwner ? (
          <Button label="Report this listing" variant="link" onPress={handleReport} />
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Manage listing</Text>
            <Button
              label="Edit details"
              variant="secondary"
              onPress={() => nav.navigate('EditListing', { listingId: listing.id })}
            />
            <Button
              label={listing.isAvailable ? 'Mark as unavailable' : 'Mark as available'}
              variant="secondary"
              onPress={handleToggleAvailability}
              loading={toggling}
            />
            <Button label="Delete listing" variant="secondary" onPress={handleDelete} />
          </View>
        )}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  screenContent: { paddingHorizontal: 0 },
  hero: {
    width: '100%',
    backgroundColor: colors.green,
    borderBottomWidth: border.base,
    borderBottomColor: colors.ink,
    overflow: 'hidden',
  },
  noPhotos: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noPhotoThumb: {
    borderRadius: 30,
  },
  heroControls: {
    position: 'absolute',
    left: space.xxl,
    right: space.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  body: {
    padding: space.screen,
    gap: space.lg,
  },
  title: {
    ...type.h1,
    color: colors.ink,
  },
  priceLine: {
    ...type.price,
    fontSize: type.body.fontSize,
    lineHeight: 20,
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
  },
  ownerTap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
  },
  avatar: {
    borderRadius: AVATAR / 2,
    backgroundColor: colors.lime,
  },
  ownerText: {
    flex: 1,
    gap: 2,
  },
  ownerName: {
    ...type.bodySm,
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  caption: {
    ...type.caption,
    color: colors.mutedAlt,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  depositRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  depositLabel: {
    ...type.bodySm,
    fontFamily: fonts.bold,
    color: colors.ink,
    flex: 1,
  },
  depositValue: {
    ...type.bodySm,
    fontFamily: fonts.black,
    color: colors.ink,
  },
  depositNone: {
    ...type.bodySm,
    color: colors.mutedAlt,
  },
  section: {
    gap: space.sm,
    marginTop: space.sm,
  },
  sectionTitle: {
    ...type.section,
    color: colors.ink,
  },
  bodyText: {
    ...type.body,
    color: colors.muted,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
  },
  footerPriceBlock: {
    gap: 2,
  },
  footerPrice: {
    ...type.button,
    color: colors.ink,
  },
  footerCity: {
    ...type.caption,
    color: colors.mutedAlt,
  },
  footerButton: {
    flex: 1,
  },
})
