import React, { useState } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { useIsFocused, useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { useConversationsFeed, useSharedInboxFeed } from '../context/InboxContext'
import { useMainTab } from '../context/MainTabContext'
import { colors } from '../theme/colors'
import { radius, shadow, space } from '../theme/tokens'
import { fonts, type } from '../theme/typography'
import { useTabBarClearance } from '../components/mockup/tabBarMetrics'
import { useAuth } from '../context/AuthContext'
import Screen from '../components/mockup/Screen'
import ScreenHeader from '../components/mockup/ScreenHeader'
import Card from '../components/mockup/Card'
import Badge from '../components/mockup/Badge'
import Thumb from '../components/mockup/Thumb'
import StatePanel from '../components/mockup/StatePanel'
import PaymentNeededBadge from '../components/PaymentNeededBadge'
import WaitingOnPaymentBadge from '../components/WaitingOnPaymentBadge'
import { Conversation } from '../types'
import { initialsOf } from '../utils/initials'
import { fillImageUrl } from '../utils/cloudinaryImage'

type Nav = NativeStackNavigationProp<RootStackParamList>

const AVATAR = 44
const SKELETON_ROWS = [0, 1, 2, 3]

/** "2:14 PM" today, "Yesterday", otherwise "Oct 20". */
function rowTime(iso: string) {
  const date = new Date(iso)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (date.getTime() >= startOfToday) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (date.getTime() >= startOfToday - 24 * 60 * 60 * 1000) return 'Yesterday'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function InboxScreen() {
  const tabBarClearance = useTabBarClearance()
  const nav = useNavigation<Nav>()
  const { user } = useAuth()
  // Pushed as a standalone route (not one of the main tabs) it gets a back button.
  const insideTabs = useMainTab() !== null
  // Inside MainAppScreen the list shares the feed behind the tab's unread dot;
  // on the standalone Inbox route it runs its own.
  const sharedFeed = useSharedInboxFeed()
  const isFocused = useIsFocused()
  const ownFeed = useConversationsFeed(sharedFeed === null && isFocused)
  const { conversations, loading, refresh } = sharedFeed ?? ownFeed
  const [refreshing, setRefreshing] = useState(false)

  const renderRow = ({ item }: { item: Conversation }) => {
    const otherUser = item.ownerId === user?.id ? item.renter : item.owner
    // The renter gets a tappable "Payment needed" badge; the owner gets a
    // matching non-tappable "Waiting on payment" badge for the same
    // accepted-but-unpaid booking.
    const needsPayment = Boolean(item.acceptedUnpaidBookingId) && item.renterId === user?.id
    const awaitingPayment = Boolean(item.acceptedUnpaidBookingId) && item.ownerId === user?.id
    const name = [otherUser.firstName, otherUser.lastName].filter(Boolean).join(' ')

    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name}${item.unread ? ', unread' : ''}, ${item.listing.title}`}
        style={({ pressed }) => (pressed ? styles.pressed : null)}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { })
          nav.navigate('ConversationThread', { conversationId: item.id, title: item.listing.title })
        }}
      >
        <Card
          shadow={item.unread ? 'sm' : false}
          padding={space.lg}
          // Read rows reserve the shadow's space so every row is the same width.
          style={item.unread ? null : styles.shadowSpace}
          contentStyle={styles.row}
        >
          <Thumb
            size={AVATAR}
            style={styles.avatar}
            initials={initialsOf(otherUser)}
            source={otherUser.avatarUrl ? { uri: fillImageUrl(otherUser.avatarUrl, { width: AVATAR * 2, height: AVATAR * 2 }) } : undefined}
          />

          <View style={styles.middle}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>{name}</Text>
              <Text style={styles.time}>{rowTime(item.lastMessage?.createdAt ?? item.updatedAt)}</Text>
            </View>
            <Text style={[styles.preview, item.unread && styles.previewUnread]} numberOfLines={1}>
              {item.lastMessage?.body ?? 'Conversation ready to start'}
            </Text>
            <Text style={styles.listing} numberOfLines={1}>{item.listing.title}</Text>
            {needsPayment ? (
              <PaymentNeededBadge onPress={() => nav.navigate('Pay', { bookingId: item.acceptedUnpaidBookingId! })} />
            ) : null}
            {awaitingPayment ? <WaitingOnPaymentBadge /> : null}
          </View>

          {/* The API only reports read/unread, not a count. */}
          {item.unread ? <Badge label="New" variant="lime" /> : null}
        </Card>
      </Pressable>
    )
  }

  return (
    <Screen
      scroll={false}
      contentStyle={styles.screenContent}
      header={<ScreenHeader title="Inbox" back={!insideTabs} />}
    >
      <FlatList
        data={loading ? [] : conversations}
        keyExtractor={(item) => item.id}
        renderItem={renderRow}
        ItemSeparatorComponent={Separator}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              refresh().finally(() => setRefreshing(false))
            }}
            tintColor={colors.greenText}
            colors={[colors.green]}
          />
        }
        contentContainerStyle={[styles.listContent, { paddingBottom: tabBarClearance + space.xxl }]}
        ListEmptyComponent={
          loading ? (
            <View style={styles.skeletons}>
              {SKELETON_ROWS.map((key) => <SkeletonRow key={key} />)}
            </View>
          ) : (
            <StatePanel
              title="No messages yet"
              body="When you contact an owner or someone requests your item, the conversation will appear here."
              action={{ label: 'Browse items', onPress: () => nav.navigate('MainApp', { tab: 'Home' }) }}
            />
          )
        }
        style={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  )
}

function Separator() {
  return <View style={styles.separator} />
}

function SkeletonRow() {
  return (
    <Card shadow={false} padding={space.lg} style={styles.shadowSpace} contentStyle={styles.row}>
      <View style={[styles.avatar, styles.skeletonAvatar]} />
      <View style={styles.middle}>
        <View style={[styles.skeletonLine, styles.skeletonName]} />
        <View style={[styles.skeletonLine, styles.skeletonPreview]} />
        <View style={[styles.skeletonLine, styles.skeletonListing]} />
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  screenContent: {
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: space.screen,
  },
  separator: {
    height: space.md,
  },
  pressed: {
    opacity: 0.85,
  },
  shadowSpace: {
    paddingRight: shadow.sm,
    paddingBottom: shadow.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: colors.lime,
  },
  middle: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.sm,
  },
  name: {
    ...type.bodySm,
    fontFamily: fonts.bold,
    color: colors.ink,
    flex: 1,
  },
  time: {
    ...type.caption,
    color: colors.mutedAlt,
  },
  preview: {
    ...type.bodySm,
    color: colors.mutedAlt,
  },
  previewUnread: {
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  listing: {
    ...type.caption,
    color: colors.greenText,
  },
  skeletons: {
    gap: space.md,
  },
  skeletonAvatar: {
    backgroundColor: colors.tan,
  },
  skeletonLine: {
    height: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.tan,
    marginVertical: 3,
  },
  skeletonName: {
    width: '45%',
  },
  skeletonPreview: {
    width: '85%',
  },
  skeletonListing: {
    width: '35%',
  },
})
