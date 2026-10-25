import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Animated, Pressable, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import Feather from '@expo/vector-icons/Feather'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { RouteProp, useIsFocused, useNavigation, useRoute } from '@react-navigation/native'
import { useQuery } from '@tanstack/react-query'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { getBooking } from '../services/bookingsApi'
import { openConversation } from '../services/conversationsApi'
import { queryKeys } from '../services/queryKeys'
import { queryClient } from '../services/queryClient'
import { useRefreshOnFocus } from '../hooks/usePagedList'
import { userMessage } from '../utils/userMessage'
import { useAuth } from '../context/AuthContext'
import { User } from '../types'
import { colors } from '../theme/colors'
import { border, radius, space } from '../theme/tokens'
import { fonts, type } from '../theme/typography'
import Screen from '../components/mockup/Screen'
import IconButton from '../components/mockup/IconButton'
import Card from '../components/mockup/Card'
import Badge from '../components/mockup/Badge'
import Button from '../components/mockup/Button'
import Thumb from '../components/mockup/Thumb'
import { ListRow, RowGroup } from '../components/mockup/RowGroup'
import { SCREEN_WIDTH, fillImageUrl, limitImageUrl } from '../utils/cloudinaryImage'
import { initialsOf } from '../utils/initials'
import { daysBetween, formatRentalDate, rentalDayKey, torontoDayKey } from '@zoink/shared'
import { toast } from '../services/toast'

type Nav = NativeStackNavigationProp<RootStackParamList>
type ScreenRoute = RouteProp<RootStackParamList, 'ActiveRental'>

function shortDate(value: string) {
  return formatRentalDate(value, 'short')
}

/** Calendar days until the due-back day, counted in Toronto. Counting
 *  milliseconds to the stored end (midnight UTC, i.e. 8 PM the evening before
 *  in Toronto) said "ends today" a day early every evening. */
function daysLeft(endDate: string) {
  const endKey = rentalDayKey(endDate)
  const todayKey = torontoDayKey()
  const days = endKey && todayKey ? Math.max(0, daysBetween(todayKey, endKey)) : 0
  if (days === 0) return 'ends today'
  if (days === 1) return '1 day left'
  return `${days} days left`
}

function fullName(user: Pick<User, 'firstName' | 'lastName'>) {
  return `${user.firstName} ${user.lastName}`.trim()
}

export default function ActiveRentalScreen() {
  const nav = useNavigation<Nav>()
  const route = useRoute<ScreenRoute>()
  const { user } = useAuth()
  const insets = useSafeAreaInsets()
  const bookingId = route.params.bookingId
  const bookingQuery = useQuery({ queryKey: queryKeys.booking(bookingId), queryFn: () => getBooking(bookingId) })
  useRefreshOnFocus(queryKeys.booking(bookingId))
  const booking = bookingQuery.data ?? null
  const loading = bookingQuery.isPending
  useEffect(() => {
    if (bookingQuery.isError && !booking) {
      Alert.alert('Error', userMessage(bookingQuery.error, { action: 'Could not load this rental.' }))
      nav.goBack()
    }
  }, [bookingQuery.isError, bookingQuery.error, booking, nav])
  const [busy, setBusy] = useState(false)
  const bannerPulse = useRef(new Animated.Value(0.35)).current
  const isFocused = useIsFocused()

  // The banner's pulse runs on the native driver, and only while this
  // screen is the one showing.
  useEffect(() => {
    if (!isFocused) return
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(bannerPulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(bannerPulse, { toValue: 0.35, duration: 900, useNativeDriver: true }),
      ])
    )
    animation.start()
    return () => animation.stop()
  }, [bannerPulse, isFocused])

  async function openChat() {
    if (!booking) return
    setBusy(true)
    try {
      const conversation = await openConversation(booking.listingId)
      // A first message here creates the conversation in the inbox.
      queryClient.invalidateQueries({ queryKey: queryKeys.inbox })
      nav.navigate('ConversationThread', {
        conversationId: conversation.id,
        title: booking.listing.title,
      })
    } catch (err: any) {
      toast.failure(err, { action: "Couldn't open the chat. Please try again." })
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <Screen scroll={false} contentStyle={styles.centered}>
        <ActivityIndicator size="large" color={colors.greenText} />
      </Screen>
    )
  }

  if (!booking) return null

  const isOwner = booking.ownerId === user?.id
  const isRenter = booking.renterId === user?.id
  const otherParty = isOwner ? booking.renter : booking.owner
  const otherPartyRole = isOwner ? 'Renter' : 'Owner'
  const imageUrl = booking.listing.images[0]?.url
  const showPickupBanner = booking.status === 'PICKUP_PENDING' && isRenter
  const showReturnBanner = booking.status === 'RETURN_PENDING' && isOwner
  const showReadyBanner = showPickupBanner || showReturnBanner
  const readyLabel = showPickupBanner ? 'Owner is ready - tap to Zoink It' : 'Renter is ready - tap to Zoink It'

  const action =
    isOwner && booking.status === 'CONFIRMED'
      ? { label: 'Start Handoff', onPress: () => nav.navigate('ZoinkIt', { bookingId: booking.id, mode: 'pickup' }) }
      : booking.status === 'PICKUP_PENDING'
        ? { label: 'Zoink It', onPress: () => nav.navigate('ZoinkIt', { bookingId: booking.id, mode: 'pickup' }) }
        : isRenter && booking.status === 'ACTIVE'
          ? { label: 'Start Return', onPress: () => nav.navigate('ZoinkIt', { bookingId: booking.id, mode: 'return' }) }
          : booking.status === 'RETURN_PENDING'
            ? { label: 'Zoink It', onPress: () => nav.navigate('ZoinkIt', { bookingId: booking.id, mode: 'return' }) }
            : booking.status === 'COMPLETED'
              ? { label: 'View Rental Summary', onPress: () => nav.navigate('BookingDetail', { bookingId: booking.id }) }
              : null
  const footerAction = action ?? {
    label: 'View Booking Detail',
    onPress: () => nav.navigate('BookingDetail', { bookingId: booking.id }),
  }

  return (
    <Screen
      edgeToEdgeTop
      contentStyle={styles.content}
      footer={
        <Button
          label={footerAction.label}
          // The two-tap handoff gets the big Zoink button, like ZoinkItScreen.
          variant={footerAction.label === 'Zoink It' ? 'zoink' : 'primary'}
          onPress={footerAction.onPress}
          disabled={busy}
        />
      }
    >
      <View style={styles.hero}>
        {imageUrl ? (
          <Image source={{ uri: limitImageUrl(imageUrl, { width: SCREEN_WIDTH }) }} style={styles.heroImage} cachePolicy="memory-disk" />
        ) : null}
        <IconButton accessibilityLabel="Go back" onPress={() => nav.goBack()} style={[styles.back, { top: insets.top + space.sm }]}>
          <Feather name="chevron-left" size={24} color={colors.ink} />
        </IconButton>
      </View>

      {showReadyBanner ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => nav.navigate('ZoinkIt', { bookingId: booking.id, mode: showPickupBanner ? 'pickup' : 'return' })}
          style={({ pressed }) => (pressed ? styles.pressed : null)}
        >
          <Card shadow="sm" padding={space.lg} contentStyle={styles.ready}>
            <Animated.View style={[styles.readyDot, { opacity: bannerPulse }]} />
            <Text style={styles.readyText}>{readyLabel}</Text>
            <Feather name="chevron-right" size={20} color={colors.ink} />
          </Card>
        </Pressable>
      ) : null}

      <View style={styles.titleBlock}>
        <Text style={styles.title} numberOfLines={2}>{booking.listing.title}</Text>
        <Badge label={booking.listing.category} variant="surface" />
      </View>

      <RowGroup>
        <ListRow icon="clock" label={`${shortDate(booking.startDate)} → ${shortDate(booking.endDate)}`} value={daysLeft(booking.endDate)} />
        <ListRow
          leading={
            <Thumb
              size={AVATAR}
              style={styles.avatar}
              initials={initialsOf(otherParty)}
              source={otherParty.avatarUrl ? { uri: fillImageUrl(otherParty.avatarUrl, { width: AVATAR * 2, height: AVATAR * 2 }) } : undefined}
            />
          }
          label={fullName(otherParty)}
          value={otherPartyRole}
          right={<Button label="Chat" variant="secondary" size="sm" onPress={openChat} disabled={busy} />}
        />
        <ListRow icon="lock" label={`CAD $${booking.depositAmount.toFixed(2)} held as deposit`} />
      </RowGroup>
    </Screen>
  )
}

const AVATAR = 40

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    gap: space.xxl,
  },
  hero: {
    height: 240,
    marginHorizontal: -space.screen,
    backgroundColor: colors.tan,
    borderBottomWidth: border.base,
    borderBottomColor: colors.ink,
    borderBottomLeftRadius: radius.hero,
    borderBottomRightRadius: radius.hero,
    overflow: 'hidden',
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
  },
  back: {
    position: 'absolute',
    left: space.xxl,
  },
  pressed: {
    opacity: 0.85,
  },
  ready: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.lime,
  },
  readyDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.ink,
  },
  readyText: {
    ...type.bodySm,
    fontFamily: fonts.bold,
    color: colors.ink,
    flex: 1,
  },
  titleBlock: {
    gap: space.sm,
  },
  title: {
    ...type.h2,
    color: colors.ink,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: colors.lime,
  },
})
