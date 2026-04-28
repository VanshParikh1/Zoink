import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { getConversationMessages, sendMessage } from '../services/conversationsApi'
import { Message } from '../types'
import { useAuth } from '../context/AuthContext'
import { theme } from '../theme/colors'

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
  const latestMessageId = useRef<string | undefined>(undefined)

  const loadMessages = useCallback(async (incremental = false) => {
    try {
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
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not load messages.')
      if (!incremental) {
        nav.goBack()
      }
    } finally {
      setLoading(false)
    }
  }, [nav, route.params.conversationId])

  useFocusEffect(
    useCallback(() => {
      loadMessages()

      const intervalId = setInterval(() => {
        loadMessages(true)
      }, 4000)

      return () => clearInterval(intervalId)
    }, [loadMessages])
  )

  async function handleSend() {
    const trimmed = body.trim()
    if (!trimmed) return

    setSending(true)
    try {
      const message = await sendMessage(route.params.conversationId, trimmed)
      setMessages((current) => [...current, message])
      latestMessageId.current = message.id
      setBody('')
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not send that message.')
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{route.params.title ?? 'Conversation'}</Text>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
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

      <View style={styles.composer}>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Write a message"
          placeholderTextColor={theme.textFaint}
          style={styles.input}
        />
        <TouchableOpacity style={styles.sendButton} onPress={handleSend} disabled={sending}>
          <Text style={styles.sendText}>{sending ? '...' : 'Send'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.screen },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.screen },
  header: { paddingHorizontal: 20, paddingTop: 64, paddingBottom: 14 },
  backText: { color: theme.textMuted, fontSize: 14, fontWeight: '700', marginBottom: 18 },
  title: { color: theme.text, fontSize: 24, fontWeight: '900' },
  listContent: { paddingHorizontal: 20, paddingBottom: 16, gap: 10 },
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
  myBubbleText: { color: theme.primaryText },
  timeText: { color: theme.textFaint, fontSize: 11, marginTop: 8 },
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
  sendText: { color: theme.primaryText, fontWeight: '900', fontSize: 14 },
})
