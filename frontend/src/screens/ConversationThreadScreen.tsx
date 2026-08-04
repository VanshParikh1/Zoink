import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import ScreenBackground from '../components/ScreenBackground'
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { getConversationMessages, markConversationRead, sendMessage } from '../services/conversationsApi'
import { Message } from '../types'
import { useAuth } from '../context/AuthContext'
import { theme } from '../theme/colors'
import StateCard from '../components/StateCard'

type Nav = NativeStackNavigationProp<RootStackParamList>
type ScreenRoute = RouteProp<RootStackParamList, 'ConversationThread'>

export default function ConversationThreadScreen() {
  const nav = useNavigation<Nav>()
  const route = useRoute<ScreenRoute>()
  const { user } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [sendError, setSendError] = useState('')
  const latestMessageId = useRef<string | undefined>(undefined)

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

  useFocusEffect(
    useCallback(() => {
      loadMessages()
      markConversationRead(route.params.conversationId).catch(() => {})

      const intervalId = setInterval(() => {
        loadMessages(true)
        markConversationRead(route.params.conversationId).catch(() => {})
      }, 4000)

      return () => clearInterval(intervalId)
    }, [loadMessages, route.params.conversationId])
  )

  async function handleSend() {
    const trimmed = body.trim()
    if (!trimmed) return

    setSending(true)
    setSendError('')
    try {
      const message = await sendMessage(route.params.conversationId, trimmed)
      setMessages((current) => [...current, message])
      latestMessageId.current = message.id
      setBody('')
    } catch (err: any) {
      setSendError(err?.response?.data?.error ?? 'Could not send that message.')
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={styles.loadingText}>Loading the conversation...</Text>
      </View>
    )
  }

  return (
    <ScreenBackground>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => nav.goBack()}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{route.params.title ?? 'Conversation'}</Text>
          <Text style={styles.subtitle}>
            Keep the details in one place before pickup, during the rental, and on return day.
          </Text>
        </View>

        {error ? (
          <View style={styles.stateWrap}>
            <StateCard
              tone="error"
              eyebrow="THREAD ISSUE"
              title="This conversation couldnâ€™t load"
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
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
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

        <View style={styles.composer}>
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
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.screen },
  loadingText: { marginTop: 12, color: theme.textMuted, fontSize: 15 },
  header: { paddingHorizontal: 20, paddingTop: 64, paddingBottom: 14 },
  backText: { color: theme.textMuted, fontSize: 14, fontWeight: '700', marginBottom: 18 },
  title: { color: theme.text, fontSize: 24, fontWeight: '900' },
  subtitle: { color: theme.textMuted, fontSize: 14, lineHeight: 20, marginTop: 8 },
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
  composer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 18,
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

