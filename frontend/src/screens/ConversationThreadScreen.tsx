import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { RouteProp, useFocusEffect, useIsFocused, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { getConversation, getConversationMessages, markConversationRead, MESSAGES_PAGE_SIZE, sendMessage } from '../services/conversationsApi'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../services/queryKeys'
import type { MessageListItem } from '@zoink/shared'
import { usePolling } from '../hooks/usePolling'
import { THREAD_DETAILS_POLL_MS, THREAD_MESSAGES_POLL_MS } from '../config/polling'
import { ConversationDetail } from '../types'
import { useAuth } from '../context/AuthContext'
import { colors } from '../theme/colors'
import { border, radius, shadow, space } from '../theme/tokens'
import { fonts, type } from '../theme/typography'
import ScreenBackground from '../components/mockup/ScreenBackground'
import IconButton from '../components/mockup/IconButton'
import Card from '../components/mockup/Card'
import Badge from '../components/mockup/Badge'
import Button from '../components/mockup/Button'
import Thumb from '../components/mockup/Thumb'
import HardShadow from '../components/mockup/HardShadow'
import StatePanel from '../components/mockup/StatePanel'
import { bookingStatusBadge } from '../components/mockup/bookingStatus'
import { dailyPriceLabel } from '../components/mockup/listingFormat'
import WaitingOnPaymentBadge from '../components/WaitingOnPaymentBadge'
import DismissKeyboardView from '../components/DismissKeyboardView'
import { initialsOf } from '../utils/initials'
import { confirmBlockUser } from '../utils/confirmBlockUser'
import { fillImageUrl } from '../utils/cloudinaryImage'

type Nav = NativeStackNavigationProp<RootStackParamList>
type ScreenRoute = RouteProp<RootStackParamList, 'ConversationThread'>

const AVATAR = 42
const LISTING_THUMB = 44
const SEND_SIZE = 48
const INPUT_MIN_HEIGHT = 46
const INPUT_MAX_LINES = 4
const INPUT_PADDING_V = 10
const BUBBLE_RADIUS = 20
const BUBBLE_TAIL = 6
const DAY_MS = 24 * 60 * 60 * 1000

// A poll that was already in flight when a message was sent can return that
// message too; keep one copy per id.
function appendNew(current: MessageListItem[], incoming: MessageListItem[]) {
  const seen = new Set(current.map((message) => message.id))
  const fresh = incoming.filter((message) => !seen.has(message.id))
  return fresh.length > 0 ? [...current, ...fresh] : current
}

type Row =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'message'; key: string; message: MessageListItem; isMine: boolean; groupStart: boolean; groupEnd: boolean }

/** "Today", "Yesterday", "Oct 20" (plus the year when it isn't this year). Upper-cased by type.eyebrow. */
function dayLabel(date: Date) {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (date.getTime() >= startOfToday) return 'Today'
  if (date.getTime() >= startOfToday - DAY_MS) return 'Yesterday'
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  })
}

/**
 * Day separators plus sender groups: consecutive messages from the same person
 * on the same day form one group, and only its last bubble gets the tail
 * corner and the time.
 */
function buildRows(messages: MessageListItem[], myId: string | undefined): Row[] {
  const rows: Row[] = []
  let lastDay = ''
  messages.forEach((message, index) => {
    const date = new Date(message.createdAt)
    const day = date.toDateString()
    const prev = messages[index - 1]
    const next = messages[index + 1]
    if (day !== lastDay) {
      rows.push({ kind: 'day', key: `day-${day}`, label: dayLabel(date) })
      lastDay = day
    }
    const sameAsPrev = Boolean(prev) && prev.senderId === message.senderId && new Date(prev.createdAt).toDateString() === day
    const sameAsNext = Boolean(next) && next.senderId === message.senderId && new Date(next.createdAt).toDateString() === day
    rows.push({
      kind: 'message',
      key: message.id,
      message,
      isMine: message.senderId === myId,
      groupStart: !sameAsPrev,
      groupEnd: !sameAsNext,
    })
  })
  return rows
}

export default function ConversationThreadScreen() {
  const nav = useNavigation<Nav>()
  const insets = useSafeAreaInsets()
  const route = useRoute<ScreenRoute>()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const conversationId = route.params.conversationId
  const [messages, setMessages] = useState<MessageListItem[]>([])
  // Older history is fetched a page at a time as the user scrolls up.
  const [hasOlder, setHasOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const userScrolledRef = useRef(false)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [sendError, setSendError] = useState('')
  const isFocused = useIsFocused()
  // The header, lender CTA and payment banner, from one single-conversation
  // fetch so all three stay consistent with each other; polled while open.
  const conversationQuery = useQuery({
    queryKey: queryKeys.conversation(conversationId),
    queryFn: () => getConversation(conversationId),
    refetchInterval: isFocused ? THREAD_DETAILS_POLL_MS : false,
  })
  const conversation: ConversationDetail | null = conversationQuery.data ?? null
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const latestMessageId = useRef<string | undefined>(undefined)
  const listRef = useRef<FlatList<Row>>(null)
  // Tracks whether the user is scrolled near the bottom already, so an
  // incoming message doesn't yank them away from history they're reading.
  // Starts true so the very first load (fresh open, or reopening into
  // unread messages) always lands on the newest message.
  const isNearBottomRef = useRef(true)
  const hasScrolledRef = useRef(false)
  // Set by sending: keep jumping to the end as rows below get laid out, until
  // the user drags. One jump into a long, partly measured list lands short.
  const pinToEndRef = useRef(false)

  const loadMessages = useCallback(async (incremental = false) => {
    try {
      if (!incremental) {
        setError('')
      }
      const nextMessages = await getConversationMessages(conversationId, incremental ? { after: latestMessageId.current } : {})
      if (incremental) {
        if (nextMessages.length > 0) {
          setMessages((current) => appendNew(current, nextMessages))
          latestMessageId.current = nextMessages[nextMessages.length - 1]?.id
        }
        return nextMessages
      } else {
        setMessages(nextMessages)
        setHasOlder(nextMessages.length === MESSAGES_PAGE_SIZE)
        latestMessageId.current = nextMessages[nextMessages.length - 1]?.id
      }
    } catch (err: any) {
      if (!incremental) {
        setError(err?.response?.data?.error ?? 'Could not load messages.')
      }
    } finally {
      setLoading(false)
    }
    return []
  }, [conversationId])

  // Scrolling up past the oldest loaded message fetches the page before it.
  // Only after the user has scrolled: the list starts at the top for a moment
  // before it jumps to the newest message.
  const loadOlder = useCallback(async () => {
    const oldest = messages[0]
    if (!userScrolledRef.current || !hasOlder || loadingOlder || !oldest) return
    setLoadingOlder(true)
    try {
      const older = await getConversationMessages(conversationId, { before: oldest.id })
      setMessages((current) => {
        const seen = new Set(current.map((message) => message.id))
        return [...older.filter((message) => !seen.has(message.id)), ...current]
      })
      setHasOlder(older.length === MESSAGES_PAGE_SIZE)
    } catch {
      // Stays as it is; scrolling up again retries.
    } finally {
      setLoadingOlder(false)
    }
  }, [messages, hasOlder, loadingOlder, conversationId])

  const loadConversation = conversationQuery.refetch

  // Opening (or returning to) the thread loads everything and marks it read.
  useFocusEffect(
    useCallback(() => {
      loadMessages()
      loadConversation()
      markConversationRead(route.params.conversationId).catch(() => {})
    }, [loadMessages, loadConversation, route.params.conversationId])
  )

  // While it's on screen and the app is in the foreground: new messages every
  // few seconds, marking the thread read only when the other person actually
  // sent something; the header / payment banner state far less often.
  const pollMessages = useCallback(async () => {
    const incoming = await loadMessages(true)
    if (incoming.some((message) => message.senderId !== user?.id)) {
      markConversationRead(route.params.conversationId).catch(() => {})
    }
  }, [loadMessages, route.params.conversationId, user?.id])
  usePolling(pollMessages, THREAD_MESSAGES_POLL_MS, isFocused)

  // The composer drops its safe-area padding while the keyboard is up (the
  // keyboard already covers the home indicator). iOS gets the "will" events so
  // the padding changes together with the keyboard animation.
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const show = Keyboard.addListener(showEvent, () => setKeyboardOpen(true))
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardOpen(false))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])

  async function handleSend() {
    const trimmed = body.trim()
    if (!trimmed) return

    setSending(true)
    setSendError('')
    try {
      const message = await sendMessage(route.params.conversationId, trimmed)
      // Sending your own message should always carry you down to it,
      // even if you had scrolled up to read older history.
      isNearBottomRef.current = true
      pinToEndRef.current = true
      setMessages((current) => appendNew(current, [message]))
      latestMessageId.current = message.id
      setBody('')
      // Explicitly, once the new row is laid out: the list keeps its visible
      // rows in place for older pages (maintainVisibleContentPosition), which
      // otherwise holds a reader far up the history where they were.
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 50)
      // The inbox shows the latest message.
      queryClient.invalidateQueries({ queryKey: queryKeys.inbox })
    } catch (err: any) {
      setSendError(err?.response?.data?.error ?? 'Could not send that message.')
    } finally {
      setSending(false)
    }
  }

  const rows = useMemo(() => buildRows(messages, user?.id), [messages, user?.id])

  const isOwner = Boolean(conversation && conversation.ownerId === user?.id)
  const isRenter = Boolean(conversation && conversation.renterId === user?.id)
  // Backend returns in-flight bookings (PENDING/ACCEPTED/ACTIVE) newest-updated
  // first, so [0] is "the active booking for this conversation".
  const activeBooking = conversation?.bookings?.[0] ?? null
  const listing = conversation?.listing ?? null
  const needsPayment = isRenter && Boolean(conversation?.acceptedUnpaidBookingId)
  // Lender-side counterpart to the renter's "Pay now" CTA — a passive status
  // badge, since the owner just waits for the renter to pay.
  const awaitingPayment = isOwner && Boolean(conversation?.acceptedUnpaidBookingId)
  // Lender header CTA: review-before-accept stays intact — this only routes to
  // BookingDetailScreen, it never one-tap-accepts.
  const showApproveCta = isOwner && activeBooking?.status === 'PENDING'
  const listingImageUrl = listing?.images?.[0]?.url ?? null
  // The other participant in this thread — owner sees the renter, renter sees
  // the owner. Mirrors the "who am I talking to" line in InboxScreen.
  const otherParty = conversation
    ? conversation.ownerId === user?.id
      ? conversation.renter
      : conversation.owner
    : null
  const otherPartyName = otherParty
    ? [otherParty.firstName, otherParty.lastName].filter(Boolean).join(' ')
    : null
  // The API doesn't send the other person's university, only their
  // verification status.
  const otherPartyCaption = otherParty
    ? `${otherParty.verificationStatus && otherParty.verificationStatus !== 'VERIFIED' ? 'Student' : 'Verified student'} · ${
        isOwner ? 'renter' : 'owner'
      }`
    : null
  const statusBadge = activeBooking ? bookingStatusBadge(activeBooking.status) : null
  const canSend = body.trim().length > 0 && !sending

  function openSafetyMenu() {
    if (!otherParty) return
    const name = otherPartyName ?? 'this user'
    const report = () =>
      nav.navigate('FileReport', { targetType: 'USER', targetId: otherParty.id, targetLabel: name })
    // Pop to the root: this thread and their listing are hidden once blocked.
    const block = () => confirmBlockUser({ id: otherParty.id, name }, () => nav.popToTop())

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', `Report ${name}`, `Block ${name}`],
          cancelButtonIndex: 0,
          destructiveButtonIndex: 2,
        },
        (index) => {
          if (index === 1) report()
          if (index === 2) block()
        },
      )
    } else {
      Alert.alert(name, undefined, [
        { text: 'Report user', onPress: report },
        { text: 'Block user', style: 'destructive', onPress: block },
        { text: 'Cancel', style: 'cancel' },
      ])
    }
  }

  function openMessageMenu(message: MessageListItem) {
    const snippet = message.body.length > 60 ? `${message.body.slice(0, 57)}...` : message.body
    const report = () =>
      nav.navigate('FileReport', { targetType: 'MESSAGE', targetId: message.id, targetLabel: `"${snippet}"` })

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Report message'], cancelButtonIndex: 0, destructiveButtonIndex: 1 },
        (index) => {
          if (index === 1) report()
        },
      )
    } else {
      Alert.alert('Message', undefined, [
        { text: 'Report message', style: 'destructive', onPress: report },
        { text: 'Cancel', style: 'cancel' },
      ])
    }
  }

  function renderRow({ item }: { item: Row }) {
    if (item.kind === 'day') {
      return (
        <View style={styles.dayWrap}>
          <Text style={styles.dayPill}>{item.label}</Text>
        </View>
      )
    }
    const { message, isMine, groupStart, groupEnd } = item
    return (
      <View style={[styles.messageRow, isMine ? styles.mineRow : styles.theirsRow, { marginTop: groupStart ? space.md : 4 }]}>
        <Pressable
          // Long-press to report — only the other person's messages.
          disabled={isMine}
          accessibilityRole={isMine ? 'text' : 'button'}
          onLongPress={() => openMessageMenu(message)}
          delayLongPress={350}
          accessibilityHint={isMine ? undefined : 'Long press to report this message'}
          style={({ pressed }) => [
            styles.bubble,
            isMine ? styles.mine : styles.theirs,
            groupEnd ? (isMine ? styles.mineTail : styles.theirsTail) : null,
            pressed ? styles.bubblePressed : null,
          ]}
        >
          <Text style={[styles.bubbleText, isMine && styles.mineText]}>{message.body}</Text>
        </Pressable>
        {groupEnd ? (
          <Text style={styles.time}>
            {new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </Text>
        ) : null}
      </View>
    )
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ScreenBackground />
        <ActivityIndicator size="large" color={colors.greenText} />
        <Text style={styles.loadingText}>Loading the conversation...</Text>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <ScreenBackground />
      <StatusBar style="dark" />
      {/*
        Keyboard: iOS pads the whole column by the keyboard height so the
        composer sits right on the keyboard; Android already resizes the window
        (softwareKeyboardLayoutMode "resize"), so it only adjusts the height.
        The list re-pins to the newest message whenever its height changes.
      */}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <DismissKeyboardView>
          <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
            <IconButton accessibilityLabel="Go back" onPress={() => nav.goBack()}>
              <Feather name="chevron-left" size={24} color={colors.ink} />
            </IconButton>
            <Thumb
              size={AVATAR}
              style={styles.avatar}
              initials={otherParty ? initialsOf(otherParty) : undefined}
              source={otherParty?.avatarUrl ? { uri: fillImageUrl(otherParty.avatarUrl, { width: AVATAR * 2, height: AVATAR * 2 }) } : undefined}
            />
            <View style={styles.headerText}>
              <Text style={styles.headerName} numberOfLines={1}>
                {otherPartyName ?? route.params.title ?? 'Conversation'}
              </Text>
              {otherPartyCaption ? <Text style={styles.headerCaption} numberOfLines={1}>{otherPartyCaption}</Text> : null}
            </View>
            {otherParty ? (
              <IconButton accessibilityLabel="More options: report or block this user" onPress={openSafetyMenu}>
                <Feather name="more-vertical" size={20} color={colors.ink} />
              </IconButton>
            ) : null}
          </View>

          {listing && conversation ? (
            <Card shadow="sm" padding={space.lg} style={styles.pinned} contentStyle={styles.pinnedContent}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`View listing: ${listing.title}`}
                onPress={() => nav.navigate('ListingDetail', { listingId: conversation.listingId })}
                style={({ pressed }) => [styles.pinnedRow, pressed ? styles.pinnedPressed : null]}
              >
                <Thumb
                  size={LISTING_THUMB}
                  style={styles.listingThumb}
                  source={listingImageUrl ? { uri: fillImageUrl(listingImageUrl, { width: LISTING_THUMB * 2, height: LISTING_THUMB * 2 }) } : undefined}
                />
                <View style={styles.pinnedText}>
                  <Text style={styles.pinnedTitle} numberOfLines={1}>{listing.title}</Text>
                  <Text style={styles.pinnedPrice} numberOfLines={1}>{dailyPriceLabel(listing.dailyPrice)}</Text>
                </View>
                {statusBadge ? <Badge label={statusBadge.label} variant={statusBadge.variant} /> : null}
              </Pressable>

              {showApproveCta || needsPayment ? (
                <View style={styles.pinnedActions}>
                  {showApproveCta ? (
                    <Button
                      label="Approve rental"
                      size="sm"
                      onPress={() => nav.navigate('BookingDetail', { bookingId: activeBooking!.id })}
                      style={styles.pinnedAction}
                    />
                  ) : null}
                  {needsPayment ? (
                    <Button
                      label="Pay now"
                      size="sm"
                      onPress={() => nav.navigate('Pay', { bookingId: conversation.acceptedUnpaidBookingId! })}
                      style={styles.pinnedAction}
                    />
                  ) : null}
                </View>
              ) : null}
              {awaitingPayment ? <WaitingOnPaymentBadge /> : null}
            </Card>
          ) : null}

          {error ? (
            <View style={styles.stateWrap}>
              <StatePanel
                title="This conversation couldn't load"
                body={error}
                action={{
                  label: 'Try again',
                  variant: 'primary',
                  onPress: () => {
                    setLoading(true)
                    loadMessages()
                  },
                }}
              />
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={rows}
              keyExtractor={(item) => item.key}
              renderItem={renderRow}
              style={styles.flex}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              onScrollBeginDrag={() => {
                userScrolledRef.current = true
                pinToEndRef.current = false
              }}
              onStartReached={loadOlder}
              onStartReachedThreshold={0.5}
              // Prepending older messages keeps the ones on screen in place.
              maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
              ListHeaderComponent={loadingOlder ? <ActivityIndicator style={styles.olderLoading} color={colors.greenText} /> : null}
              onScroll={(e) => {
                const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent
                const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height
                isNearBottomRef.current = pinToEndRef.current || distanceFromBottom < 120
              }}
              scrollEventThrottle={100}
              onContentSizeChange={() => {
                if (isNearBottomRef.current) {
                  // The first jump is instant: an animated one reports
                  // mid-scroll offsets that would clear isNearBottomRef before
                  // the pinned card / keyboard resize re-pins the list.
                  listRef.current?.scrollToEnd({ animated: hasScrolledRef.current && !pinToEndRef.current })
                  hasScrolledRef.current = true
                }
              }}
              // The keyboard opening shrinks the list from the bottom; without
              // this the newest messages would slide under the composer.
              // Deferred a frame so the list has its new height first.
              onLayout={() => {
                if (isNearBottomRef.current) {
                  requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }))
                }
              }}
              ListEmptyComponent={
                <StatePanel
                  title="No messages yet"
                  body="Send the first note to confirm dates, pickup details, or anything else before the booking moves forward."
                />
              }
              showsVerticalScrollIndicator={false}
            />
          )}
        </DismissKeyboardView>

        <View style={[styles.composer, { paddingBottom: keyboardOpen ? space.sm : insets.bottom + space.sm }]}>
          {sendError ? (
            <Pressable accessibilityRole="button" onPress={handleSend} disabled={sending} style={styles.sendErrorWrap}>
              <Text style={styles.sendError}>Not sent: tap to retry</Text>
              <Text style={styles.sendErrorReason} numberOfLines={2}>{sendError}</Text>
            </Pressable>
          ) : null}
          <View style={[styles.composerRow, sending ? styles.sending : null]}>
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="Write a message"
              placeholderTextColor={colors.mutedAlt}
              style={styles.input}
              multiline
              maxLength={2000}
            />
            <HardShadow
              pressable
              offset="xs"
              radius={SEND_SIZE / 2}
              disabled={!canSend}
              onPress={handleSend}
              accessibilityRole="button"
              accessibilityLabel="Send message"
              accessibilityState={{ disabled: !canSend, busy: sending }}
            >
              <View style={[styles.send, !canSend ? styles.sendDisabled : null]}>
                <Feather name="arrow-up" size={22} color={canSend ? colors.ink : colors.mutedAlt} />
              </View>
            </HardShadow>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  olderLoading: {
    marginVertical: space.md,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: {
    flex: 1,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: space.lg,
    backgroundColor: colors.bg,
  },
  loadingText: {
    ...type.bodySm,
    color: colors.mutedAlt,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.xxl,
    paddingBottom: space.md,
    backgroundColor: colors.surface,
    borderBottomWidth: border.base,
    borderBottomColor: colors.ink,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: colors.lime,
  },
  headerText: {
    flex: 1,
  },
  headerName: {
    ...type.button,
    letterSpacing: -0.4,
    color: colors.ink,
  },
  headerCaption: {
    ...type.caption,
    color: colors.mutedAlt,
  },
  pinned: {
    marginTop: space.lg,
    marginHorizontal: space.xxl,
  },
  pinnedContent: {
    gap: space.md,
  },
  pinnedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
  },
  pinnedPressed: {
    opacity: 0.7,
  },
  listingThumb: {
    borderRadius: 10,
  },
  pinnedText: {
    flex: 1,
  },
  pinnedTitle: {
    ...type.bodySm,
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  pinnedPrice: {
    ...type.labelSm,
    color: colors.greenText,
  },
  pinnedActions: {
    flexDirection: 'row',
    gap: space.md,
  },
  pinnedAction: {
    flex: 1,
  },
  stateWrap: {
    padding: space.xxl,
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: space.xxl,
    paddingTop: space.sm,
    paddingBottom: space.xxl,
  },
  dayWrap: {
    alignItems: 'center',
    marginTop: space.xxl,
    marginBottom: space.xs,
  },
  dayPill: {
    ...type.eyebrow,
    color: colors.ink,
    backgroundColor: colors.surface,
    borderWidth: border.thin,
    borderColor: colors.ink,
    borderRadius: radius.pill,
    overflow: 'hidden',
    paddingHorizontal: space.md,
    paddingVertical: 4,
  },
  messageRow: {
    maxWidth: '78%',
  },
  mineRow: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  theirsRow: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubble: {
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderRadius: BUBBLE_RADIUS,
  },
  mine: {
    backgroundColor: colors.ink,
  },
  // The theirs bubble's border counts toward its padding, so both bubbles
  // have the same outer size for the same text.
  theirs: {
    backgroundColor: colors.surface,
    borderWidth: border.thin,
    borderColor: colors.ink,
    paddingHorizontal: space.xl - border.thin,
    paddingVertical: space.md - border.thin,
  },
  mineTail: {
    borderBottomRightRadius: BUBBLE_TAIL,
  },
  theirsTail: {
    borderBottomLeftRadius: BUBBLE_TAIL,
  },
  bubblePressed: {
    opacity: 0.8,
  },
  bubbleText: {
    ...type.bodySm,
    color: colors.ink,
  },
  mineText: {
    color: colors.onInk,
  },
  time: {
    ...type.caption,
    color: colors.mutedAlt,
    marginTop: 4,
    marginHorizontal: space.xs,
  },
  composer: {
    gap: space.xs,
    paddingHorizontal: space.xxl,
    paddingTop: space.md,
    backgroundColor: colors.surface,
    borderTopWidth: border.base,
    borderTopColor: colors.ink,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.md,
  },
  sending: {
    opacity: 0.6,
  },
  input: {
    ...type.bodySm,
    flex: 1,
    color: colors.ink,
    backgroundColor: colors.bg,
    borderWidth: border.base,
    borderColor: colors.ink,
    borderRadius: INPUT_MIN_HEIGHT / 2,
    minHeight: INPUT_MIN_HEIGHT,
    maxHeight: type.bodySm.lineHeight * INPUT_MAX_LINES + INPUT_PADDING_V * 2 + border.base * 2,
    paddingHorizontal: space.xxl,
    paddingTop: INPUT_PADDING_V,
    paddingBottom: INPUT_PADDING_V,
    textAlignVertical: 'top',
  },
  send: {
    width: SEND_SIZE,
    height: SEND_SIZE,
    borderRadius: SEND_SIZE / 2,
    backgroundColor: colors.green,
    borderWidth: border.base,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: {
    backgroundColor: colors.tan,
  },
  sendErrorWrap: {
    alignSelf: 'flex-start',
  },
  sendError: {
    ...type.labelSm,
    color: colors.danger,
  },
  sendErrorReason: {
    ...type.caption,
    color: colors.mutedAlt,
  },
})
