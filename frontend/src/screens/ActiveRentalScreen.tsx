import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Animated, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { getBooking } from '../services/bookingsApi'
import { openConversation } from '../services/conversationsApi'
import { useAuth } from '../context/AuthContext'
import { Booking, User } from '../types'
import { theme } from '../theme/colors'

type Nav = NativeStackNavigationProp<RootStackParamList>
type ScreenRoute = RouteProp<RootStackParamList, 'ActiveRental'>

function shortDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function daysLeft(endDate: string) {
  const end = new Date(endDate).getTime()
  const now = Date.now()
  const days = Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)))
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
  const [booking, setBooking] = useState<Booking | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const bannerPulse = useRef(new Animated.Value(0.35)).current

  const loadBooking = useCallback(async () => {
    try {
      const next = await getBooking(route.params.bookingId)
      setBooking(next)
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not load this rental.')
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

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(bannerPulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(bannerPulse, { toValue: 0.35, duration: 900, useNativeDriver: true }),
      ])
    )
    animation.start()
    return () => animation.stop()
  }, [bannerPulse])

  async function openChat() {
    if (!booking) return
    setBusy(true)
    try {
      const conversation = await openConversation(booking.listingId)
      nav.navigate('ConversationThread', {
        conversationId: conversation.id,
        title: booking.listing.title,
      })
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not open chat.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
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
    isOwner && booking.status === 'ACCEPTED'
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

  return (
    <View style={styles.screen}>
      {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.heroImage} /> : <View style={styles.heroFallback} />}
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => nav.goBack()}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        {showReadyBanner ? (
          <TouchableOpacity
            onPress={() => nav.navigate('ZoinkIt', { bookingId: booking.id, mode: showPickupBanner ? 'pickup' : 'return' })}
            style={styles.readyBanner}
          >
            <Animated.View style={[styles.readyPulse, { opacity: bannerPulse }]} />
            <Text style={styles.readyText}>{readyLabel}</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2}>{booking.listing.title}</Text>
          <Text style={styles.categoryPill}>{booking.listing.category}</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.infoRow}>
          <Feather name="clock" size={20} color={theme.primaryDeep} />
          <View style={styles.infoText}>
            <Text style={styles.infoLabel}>{shortDate(booking.startDate)} {'->'} {shortDate(booking.endDate)}</Text>
            <Text style={styles.infoSubtext}>{daysLeft(booking.endDate)}</Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          {otherParty.avatarUrl ? (
            <Image source={{ uri: otherParty.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitial}>{otherParty.firstName.charAt(0)}</Text>
            </View>
          )}
          <View style={styles.infoText}>
            <Text style={styles.infoLabel}>{fullName(otherParty)}</Text>
            <Text style={styles.infoSubtext}>{otherPartyRole}</Text>
          </View>
          <TouchableOpacity style={styles.chatButton} onPress={openChat} disabled={busy}>
            <Text style={styles.chatText}>Chat</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoRow}>
          <Feather name="lock" size={20} color={theme.primaryDeep} />
          <View style={styles.infoText}>
            <Text style={styles.infoLabel}>CAD ${booking.depositAmount.toFixed(2)} held as deposit</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {action ? (
          <TouchableOpacity style={styles.actionButton} onPress={action.onPress} disabled={busy}>
            <Text style={styles.actionText}>{action.label}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.actionButton} onPress={() => nav.navigate('BookingDetail', { bookingId: booking.id })}>
            <Text style={styles.actionText}>View Booking Detail</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  heroImage: { width: '100%', height: 200, borderBottomLeftRadius: 18, borderBottomRightRadius: 18, backgroundColor: theme.primarySurface },
  heroFallback: { width: '100%', height: 200, borderBottomLeftRadius: 18, borderBottomRightRadius: 18, backgroundColor: theme.primarySurface },
  content: { padding: 24, paddingBottom: 40, gap: 18 },
  backText: { color: theme.textMuted, fontSize: 14, fontWeight: '700' },
  readyBanner: {
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: theme.primarySurface,
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: 14,
  },
  readyPulse: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    backgroundColor: 'rgba(109, 216, 50, 0.28)',
  },
  readyText: { color: theme.primaryDeep, fontSize: 14, fontWeight: '900', textAlign: 'center' },
  titleRow: { gap: 10 },
  title: { ...theme.type.screenTitle },
  categoryPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: '#EFEFF1',
    color: theme.textSecondary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    overflow: 'hidden',
    fontSize: 12,
    fontWeight: '900',
  },
  divider: { height: 1, backgroundColor: theme.border },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50 },
  infoText: { flex: 1 },
  infoLabel: { color: '#111114', fontSize: 16, fontWeight: '800' },
  infoSubtext: { color: theme.textMuted, fontSize: 13, fontWeight: '700', marginTop: 2 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.primarySurface },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: theme.primaryDeep, fontSize: 18, fontWeight: '900' },
  chatButton: { borderRadius: 8, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 14, paddingVertical: 9 },
  chatText: { color: '#111114', fontSize: 14, fontWeight: '900' },
  actionButton: { minHeight: 54, borderRadius: 8, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' },
  actionText: { color: theme.textOnPrimary, fontSize: 16, fontWeight: '900' },
})
