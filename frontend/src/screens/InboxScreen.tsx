import React, { useCallback, useState } from 'react'
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View, Image, Platform } from 'react-native'
import { BlurView } from 'expo-blur'
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

  const renderHeader = () => (
    <View style={styles.headerInner}>
      <Text style={styles.title}>Messages</Text>
      <Text style={styles.subtitle}>
        {conversations.length === 0
          ? 'No active threads yet'
          : `${conversations.length} conversation${conversations.length === 1 ? '' : 's'} in motion`}
      </Text>
    </View>
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
      <View style={styles.header}>
        {renderHeader()}
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {
          setRefreshing(true)
          loadConversations()
        }} tintColor={theme.primary} colors={[theme.primary]} />}
        contentContainerStyle={styles.content}
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
              activeOpacity={0.75}
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
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: 24, paddingBottom: 120, paddingTop: 16 },
  header: {
    paddingTop: 56,
    paddingBottom: 16,
    zIndex: 10,
  },
  headerInner: {
    paddingHorizontal: 24,
  },
  title: { color: theme.text, fontSize: 28, fontWeight: '500', marginBottom: 4, letterSpacing: -0.5 },
  subtitle: { color: theme.textMuted, fontSize: 14, fontWeight: '300' },
  glassCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.glassFill,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.glassBorder,
    borderTopColor: theme.glassHighlight,
    borderBottomColor: theme.glassBorderBottom,
    marginBottom: 12,
    shadowColor: theme.glassShadow,
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  glassCardUnread: {
    borderColor: theme.glassPrimaryBorder,
    backgroundColor: theme.glassPrimaryFill,
  },
  cardLeft: {
    position: 'relative',
    marginRight: 16,
  },
  glassThumbnailImage: {
    width: 64,
    height: 64,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.glassBorder,
  },
  glassThumbnail: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.glassBorder,
  },
  glassThumbnailEmoji: {
    fontSize: 28,
  },
  unreadDot: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.primary,
    borderWidth: 2,
    borderColor: '#FFFFFF',
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
    fontWeight: '500',
    flex: 1,
    marginRight: 12,
  },
  cardPrice: {
    color: theme.primary,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardTime: {
    color: theme.textFaint,
    fontSize: 12,
    fontWeight: '300',
  },
  cardMeta: {
    color: theme.textMuted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '300',
  },
  cardMetaUnread: {
    color: theme.text,
    fontWeight: '500',
  },
})
