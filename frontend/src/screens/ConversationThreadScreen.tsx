import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { getConversation, getConversationMessages, markConversationRead, sendMessage } from '../services/conversationsApi'
import { Message, ConversationDetail } from '../types'
import { useAuth } from '../context/AuthContext'
import { theme } from '../theme/colors'
import StateCard from '../components/StateCard'
import ScreenBackground from '../components/ScreenBackground'
import DismissKeyboardView from '../components/DismissKeyboardView'

type Nav = NativeStackNavigationProp<RootStackParamList>
type ScreenRoute = RouteProp<RootStackParamList, 'ConversationThread'>

export default function ConversationThreadScreen() {
  const nav = useNavigation<Nav>()
  const insets = useSafeAreaInsets()
  const route = useRoute<ScreenRoute>()
  const { user } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [sendError, setSendError] = useState('')
  const [conversation, setConversation] = useState<ConversationDetail | null>(null)
  const latestMessageId = useRef<string | undefined>(undefined)
  const listRef = useRef<FlatList<Message>>(null)
  // Tracks whether the user is scrolled near the bottom already, so an
  // incoming message doesn't yank them away from history they're reading.
  // Starts true so the very first load (fresh open, or reopening into
  // unread messages) always lands on the newest message.
  const isNearBottomRef = useRef(true)

  const loadMessages = useCallback(async (incremental = false) => {
    try {
      if (!incremental) {
        setError('')
      }
      const nextMessages = await getConversationMessages(route.params.conversationId, incremental ? latestMessageId.current : undefined)
      if (incremental) {
        if (nextMessages.length > 0) {
          setMessages((current) => [...current, ...nextMessages])
          latestMessageId.current = nextMessages[nextMessages.length - 1]?.id
        }
      } else {
        setMessages(nextMessages)
        latestMessageId.current = nextMessages[nextMessages.length - 1]?.id
      }
    } catch (err: any) {
      if (!incremental) {
        setError(err?.response?.data?.error ?? 'Could not load messages.')
      }
    } finally {
      setLoading(false)
    }
  }, [nav, route.params.conversationId])

  const loadConversation = useCallback(async () => {
    try {
      // Single-conversation fetch: powers the listing-context header, the
      // lender CTA, and the bottom payment banner (acceptedUnpaidBookingId),
      // so all three stay consistent with each other.
      const next = await getConversation(route.params.conversationId)
      setConversation(next)
    } catch {
      // Non-critical — the header/banner just won't show if this fails.
    }
  }, [route.params.conversationId])

  useFocusEffect(
    useCallback(() => {
      loadMessages()
      loadConversation()
      markConversationRead(route.params.conversationId).catch(() => {})

      const intervalId = setInterval(() => {
        loadMessages(true)
        loadConversation()
        markConversationRead(route.params.conversationId).catch(() => {})
      }, 4000)

      return () => clearInterval(intervalId)
    }, [loadMessages, loadConversation, route.params.conversationId])
  )

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
      setMessages((current) => [...current, message])
      latestMessageId.current = message.id
      setBody('')
    } catch (err: any) {
      setSendError(err?.response?.data?.error ?? 'Could not send that message.')
    } finally {
      setSending(false)
    }
  }

  const isOwner = Boolean(conversation && conversation.ownerId === user?.id)
  const isRenter = Boolean(conversation && conversation.renterId === user?.id)
  // Backend returns in-flight bookings (PENDING/ACCEPTED/ACTIVE) newest-updated
  // first, so [0] is "the active booking for this conversation".
  const activeBooking = conversation?.bookings?.[0] ?? null
  const listing = conversation?.listing ?? null
  const listingThumb = listing?.images?.[0]?.url
  const needsPayment = isRenter && Boolean(conversation?.acceptedUnpaidBookingId)
  // Lender header CTA: review-before-accept stays intact — this only routes to
  // BookingDetailScreen, it never one-tap-accepts.
  const showApproveCta = isOwner && activeBooking?.status === 'PENDING'
  const contextLabel =
    activeBooking && !showApproveCta
      ? activeBooking.status === 'ACCEPTED'
        ? isOwner ? 'Rental accepted · waiting on payment' : 'Rental accepted'
        : activeBooking.status === 'ACTIVE'
          ? 'Rental in progress'
          : null
      : null

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={styles.loadingText}>Loading the conversation...</Text>
      </View>
    )
  }

  return (
    <DismissKeyboardView>
      <ScreenBackground>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => nav.goBack()}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{route.params.title ?? 'Conversation'}</Text>

          {listing ? (
            <TouchableOpacity
              style={styles.listingContext}
              activeOpacity={0.8}
              onPress={() => nav.navigate('ListingDetail', { listingId: conversation!.listingId })}
            >
              {listingThumb ? (
                <Image source={{ uri: listingThumb }} style={styles.listingThumb} />
              ) : (
                <View style={[styles.listingThumb, styles.listingThumbFallback]}>
                  <Text style={styles.listingThumbFallbackText}>{listing.category?.[0] ?? '?'}</Text>
                </View>
              )}
              <View style={styles.listingContextBody}>
                <Text style={styles.listingContextTitle} numberOfLines={1}>{listing.title}</Text>
                <Text style={styles.listingContextLink}>View listing</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <Text style={styles.subtitle}>
              Keep the details in one place before pickup, during the rental, and on return day.
            </Text>
          )}

          {showApproveCta ? (
            <TouchableOpacity
              style={styles.approveCta}
              activeOpacity={0.85}
              onPress={() => nav.navigate('BookingDetail', { bookingId: activeBooking!.id })}
            >
              <Text style={styles.approveCtaText}>Approve Rental</Text>
            </TouchableOpacity>
          ) : contextLabel ? (
            <Text style={styles.contextLabel}>{contextLabel}</Text>
          ) : null}
        </View>

        {error ? (
          <View style={styles.stateWrap}>
            <StateCard
              tone="error"
              eyebrow="THREAD ISSUE"
              title="This conversation couldn't load"
              body={error}
              actionLabel="Try again"
              onAction={() => {
                setLoading(true)
                loadMessages()
              }}
              secondaryActionLabel="Go back"
              onSecondaryAction={() => nav.goBack()}
            />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            onScroll={(e) => {
              const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent
              const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height
              isNearBottomRef.current = distanceFromBottom < 120
            }}
            scrollEventThrottle={100}
            onContentSizeChange={() => {
              if (isNearBottomRef.current) {
                listRef.current?.scrollToEnd({ animated: true })
              }
            }}
            ListEmptyComponent={
              <View style={styles.stateWrap}>
                <StateCard
                  eyebrow="START THE THREAD"
                  title="No messages yet"
                  body="Send the first note to confirm dates, pickup details, or anything else before the booking moves forward."
                />
              </View>
            }
            renderItem={({ item }) => {
              const isMine = item.senderId === user?.id
              return (
                <View style={[styles.bubble, isMine ? styles.myBubble : styles.theirBubble]}>
                  <Text style={[styles.bubbleText, isMine && styles.myBubbleText]}>{item.body}</Text>
                  <Text style={[styles.timeText, isMine && styles.myBubbleText]}>
                    {new Date(item.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </Text>
                </View>
              )
            }}
          />
        )}

        {needsPayment && conversation ? (
          <TouchableOpacity
            style={styles.paymentBanner}
            activeOpacity={0.85}
            onPress={() => nav.navigate('Pay', { bookingId: conversation.acceptedUnpaidBookingId! })}
          >
            <Text style={styles.paymentBannerText}>
              {conversation.owner.firstName} accepted your request! Tap to pay
            </Text>
          </TouchableOpacity>
        ) : null}

        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 18) }]}>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Write a message"
            placeholderTextColor={theme.textDisabled}
            style={styles.input}
            maxLength={2000}
          />
          <TouchableOpacity style={styles.sendButton} onPress={handleSend} disabled={sending}>
            <Text style={styles.sendText}>{sending ? '...' : 'Send'}</Text>
          </TouchableOpacity>
          {sendError ? <Text style={styles.sendError}>{sendError}</Text> : null}
      </View>
      </KeyboardAvoidingView>
      </ScreenBackground>
    </DismissKeyboardView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.screen },
  loadingText: { marginTop: 12, color: theme.textMuted, fontSize: 15 },
  header: { paddingHorizontal: 20, paddingTop: 64, paddingBottom: 14 },
  backText: { color: theme.textMuted, fontSize: 14, fontWeight: '700', marginBottom: 18 },
  title: { ...theme.type.screenTitle },
  subtitle: { color: theme.textMuted, fontSize: 15, lineHeight: 22, marginTop: 8 },
  listingContext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    padding: 10,
    borderRadius: theme.radius.md,
    borderWidth: theme.hard.borderThin,
    borderColor: theme.hard.ink,
    backgroundColor: theme.surface,
  },
  listingThumb: { width: 44, height: 44, borderRadius: theme.radius.sm, backgroundColor: theme.surfaceSubdued },
  listingThumbFallback: { alignItems: 'center', justifyContent: 'center' },
  listingThumbFallbackText: { color: theme.textMuted, fontSize: 18, fontWeight: '900' },
  listingContextBody: { flex: 1 },
  listingContextTitle: { color: theme.text, fontSize: 15, fontWeight: '800' },
  listingContextLink: { color: theme.primaryDeep, fontSize: 12, fontWeight: '800', marginTop: 2 },
  approveCta: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.primary,
    borderWidth: theme.hard.borderThin,
    borderColor: theme.hard.ink,
  },
  approveCtaText: { color: theme.textOnPrimary, fontSize: 14, fontWeight: '900' },
  contextLabel: { color: theme.textMuted, fontSize: 13, fontWeight: '700', marginTop: 12 },
  listContent: { paddingHorizontal: 20, paddingBottom: 16, gap: 10, flexGrow: 1 },
  stateWrap: { paddingVertical: 8 },
  bubble: {
    maxWidth: '82%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  myBubble: { alignSelf: 'flex-end', backgroundColor: theme.primary },
  theirBubble: { alignSelf: 'flex-start', backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  bubbleText: { color: theme.text, fontSize: 15, lineHeight: 20 },
  myBubbleText: { color: theme.textOnPrimary },
  timeText: { color: theme.textDisabled, fontSize: 11, marginTop: 8 },
  paymentBanner: {
    marginHorizontal: 20,
    marginBottom: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: theme.warningSurface,
    borderWidth: 1,
    borderColor: theme.warning,
  },
  paymentBannerText: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  composer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    backgroundColor: theme.surface,
  },
  input: {
    flex: 1,
    backgroundColor: theme.screen,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.text,
  },
  sendButton: {
    minWidth: 72,
    borderRadius: 16,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  sendText: { color: theme.textOnPrimary, fontWeight: '900', fontSize: 14 },
  sendError: {
    color: theme.colors.danger,
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: theme.surface,
  },
})

