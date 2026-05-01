import React, { useCallback, useState } from 'react'
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View, Image } from 'react-native'
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
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {
          setRefreshing(true)
          loadConversations()
        }} tintColor={theme.primary} colors={[theme.primary]} />}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Messages</Text>
            <Text style={styles.subtitle}>
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
        renderItem={({ item }) => {
          const imageUrl = item.listing.images?.[0]?.url
          return (
            <TouchableOpacity
              style={[styles.glassCard, item.unread && styles.glassCardUnread]}
              onPress={() => nav.navigate('ConversationThread', { conversationId: item.id, title: item.listing.title })}
            >
              <View style={styles.cardLeft}>
                {imageUrl ? (
                  <Image source={{ uri: imageUrl }} style={styles.glassThumbnailImage} />
                ) : (
                  <View style={styles.glassThumbnail}>
                    <Text style={styles.glassThumbnailEmoji}>{item.listing.category || '💬'}</Text>
                  </View>
                )}
                {item.unread ? <View style={styles.unreadDot} /> : null}
              </View>

              <View style={styles.cardRight}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{item.listing.title}</Text>
                  <Text style={styles.cardTime}>
                    {new Date(item.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </Text>
                </View>
                <Text style={styles.cardPrice}>${item.listing.dailyPrice} / day</Text>
                <Text style={[styles.cardMeta, item.unread && styles.cardMetaUnread]} numberOfLines={2}>
                  {item.lastMessage?.body ?? 'Conversation ready to start'}
                </Text>
              </View>
            </TouchableOpacity>
          )
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent' },
  content: { paddingHorizontal: 24, paddingBottom: 120 },
  header: { marginBottom: 24, paddingTop: 56 },
  title: { color: theme.text, fontSize: 28, fontWeight: '900', marginBottom: 4 },
  subtitle: { color: theme.textMuted, fontSize: 14, fontWeight: '600' },
  glassCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 16,
  },
  glassCardUnread: {
    borderColor: 'rgba(22,255,110,0.3)',
    backgroundColor: 'rgba(22,255,110,0.05)',
  },
  cardLeft: {
    position: 'relative',
    marginRight: 18,
  },
  glassThumbnailImage: {
    width: 72,
    height: 72,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  glassThumbnail: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  glassThumbnailEmoji: {
    fontSize: 32,
  },
  unreadDot: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.primary,
    borderWidth: 2,
    borderColor: theme.screen,
  },
  cardRight: {
    flex: 1,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  cardTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '900',
    flex: 1,
    marginRight: 12,
  },
  cardPrice: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  cardTime: {
    color: theme.textFaint,
    fontSize: 12,
    fontWeight: '600',
  },
  cardMeta: {
    color: theme.textMuted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  cardMetaUnread: {
    color: theme.text,
    fontWeight: '600',
  },
})
