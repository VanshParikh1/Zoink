import React, { useCallback, useState } from 'react'
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { getMyConversations } from '../services/conversationsApi'
import { Conversation } from '../types'
import { theme } from '../theme/colors'
import StateCard from '../components/StateCard'

type Nav = NativeStackNavigationProp<RootStackParamList>

export default function InboxScreen() {
  const nav = useNavigation<Nav>()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const loadConversations = useCallback(async () => {
    try {
      setError('')
      const nextConversations = await getMyConversations()
      setConversations(nextConversations)
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not load your inbox.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadConversations()

      const intervalId = setInterval(() => {
        loadConversations()
      }, 4000)

      return () => clearInterval(intervalId)
    }, [loadConversations])
  )

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={styles.loadingText}>Loading your conversations...</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {
          setRefreshing(true)
          loadConversations()
        }} tintColor={theme.primary} />}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <TouchableOpacity onPress={() => nav.goBack()}>
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Inbox</Text>
            <Text style={styles.subtitle}>
              Listing conversations update here as new messages come in.
            </Text>
            <Text style={styles.summaryText}>
              {conversations.length === 0
                ? 'No active threads yet'
                : `${conversations.length} conversation${conversations.length === 1 ? '' : 's'} in motion`}
            </Text>
          </View>
        }
        ListEmptyComponent={
          error ? (
            <StateCard
              tone="error"
              eyebrow="INBOX ISSUE"
              title="Your inbox couldn’t load"
              body={error}
              actionLabel="Try again"
              onAction={loadConversations}
            />
          ) : (
            <StateCard
              eyebrow="QUIET FOR NOW"
              title="No conversations yet"
              body="Open a listing and tap Message to start talking with an owner before you book."
              actionLabel="Browse rentals"
              onAction={() => nav.navigate('MainApp', { tab: 'Search' })}
            />
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.card, item.unread && styles.cardUnread]}
            onPress={() => nav.navigate('ConversationThread', { conversationId: item.id, title: item.listing.title })}
          >
            <View style={styles.cardTop}>
              <Text style={styles.cardTitle}>{item.listing.title}</Text>
              {item.unread ? <View style={styles.unreadDot} /> : null}
            </View>
            <Text style={styles.cardMeta}>
              {item.lastMessage?.body ?? 'Conversation ready to start'}
            </Text>
            <Text style={styles.cardTime}>
              {new Date(item.updatedAt).toLocaleString()}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.screen },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.screen },
  loadingText: { marginTop: 12, color: theme.textMuted, fontSize: 15 },
  content: { padding: 24, paddingTop: 64, paddingBottom: 32 },
  header: { marginBottom: 8 },
  backText: { color: theme.textMuted, fontSize: 14, fontWeight: '700', marginBottom: 18 },
  title: { color: theme.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: theme.textMuted, fontSize: 15, marginTop: 8 },
  summaryText: { color: theme.textFaint, fontSize: 13, marginTop: 10, fontWeight: '700' },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 14,
  },
  cardUnread: { borderColor: theme.primary },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardTitle: { color: theme.text, fontSize: 17, fontWeight: '900', flex: 1, marginRight: 12 },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.primary },
  cardMeta: { color: theme.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 10 },
  cardTime: { color: theme.textFaint, fontSize: 12 },
})
