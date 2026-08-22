import React, { useCallback, useState } from 'react'
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View, Image, Platform } from 'react-native'
import * as Haptics from 'expo-haptics'
import { LinearGradient } from 'expo-linear-gradient'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { getMyConversations } from '../services/conversationsApi'
import { Conversation } from '../types'
import { theme } from '../theme/colors'
import StateCard from '../components/StateCard'
import { useAuth } from '../context/AuthContext'
import ScreenBackground from '../components/ScreenBackground'
import PaymentNeededBadge from '../components/PaymentNeededBadge'

type Nav = NativeStackNavigationProp<RootStackParamList>

export default function InboxScreen() {
  const nav = useNavigation<Nav>()
  const { user } = useAuth()
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
    <ScreenBackground>
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
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No messages yet</Text>
            <Text style={styles.emptyText}>
              When you contact an owner or someone requests your item, the conversation will appear here.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const otherUser = item.ownerId === user?.id ? item.renter : item.owner
          const otherInitials = `${otherUser.firstName?.[0] || ''}${otherUser.lastName?.[0] || ''}`.toUpperCase()
          const imageUrl = item.listing.images?.[0]?.url
          // Only the renter can pay — the owner sees the same thread with no
          // badge, since there's nothing for them to tap.
          const needsPayment = Boolean(item.acceptedUnpaidBookingId) && item.renterId === user?.id

          return (
            <View style={styles.cardWrap}>
              <TouchableOpacity
                activeOpacity={0.75}
                style={[styles.card, item.unread && styles.cardUnread]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                  nav.navigate('ConversationThread', { conversationId: item.id, title: item.listing.title })
                }}
              >
                <View style={styles.cardLeft}>
                  {imageUrl ? (
                    <Image source={{ uri: imageUrl }} style={styles.thumbnailImage} />
                  ) : (
                    <View style={styles.thumbnailPlaceholder}>
                      <Text style={styles.thumbnailEmoji}>{item.listing.category || '🗨'}</Text>
                    </View>
                  )}
                  {item.unread ? <View style={styles.unreadDot} /> : null}
                </View>

                <View style={styles.cardRight}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{item.listing.title}</Text>
                  <Text style={styles.cardItemName} numberOfLines={1}>{otherUser.firstName} {otherUser.lastName}</Text>
                  {needsPayment ? (
                    <PaymentNeededBadge
                      onPress={() => nav.navigate('Pay', { bookingId: item.acceptedUnpaidBookingId! })}
                    />
                  ) : null}
                  <Text style={[styles.cardMeta, item.unread && styles.cardMetaUnread]} numberOfLines={2}>
                    {item.lastMessage?.body ?? 'Conversation ready to start'}
                  </Text>
                </View>

                <View style={styles.cardMetaColumn}>
                  <Text style={styles.cardTime}>
                    {new Date(item.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </Text>
                  <View style={styles.miniAvatar}>
                    <Text style={styles.miniAvatarText}>{otherInitials}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            </View>
          )
        }}
      />
    </ScreenBackground>
  )
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: 24, paddingBottom: 120, paddingTop: 16 },
  header: {
    paddingTop: theme.header.tabTop,
    paddingBottom: 16,
    zIndex: 10,
  },
  headerInner: {
    paddingHorizontal: 24,
  },
  title: { ...theme.type.screenTitle, marginBottom: 4 },
  subtitle: { color: theme.textMuted, fontSize: 15, fontWeight: '400' },
  emptyState: { alignItems: 'center', marginTop: 60, paddingHorizontal: 20 },
  emptyTitle: { color: theme.text, fontSize: 18, fontWeight: '500', marginBottom: 8 },
  emptyText: { color: theme.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  cardWrap: {
    borderRadius: theme.radius.sm,
    backgroundColor: theme.hard.ink,
    marginBottom: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.cardBackground,
    borderRadius: theme.radius.sm,
    padding: 12,
    borderWidth: theme.hard.border,
    borderColor: theme.hard.ink,
    marginRight: theme.hard.offset.sm,
    marginBottom: theme.hard.offset.sm,
  },
  cardUnread: {
    backgroundColor: theme.primarySurface,
  },
  cardLeft: {
    position: 'relative',
    marginRight: 16,
  },
  thumbnailImage: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.sm,
    borderWidth: theme.hard.borderThin,
    borderColor: theme.hard.ink,
  },
  thumbnailPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.surfaceSubdued,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.hard.borderThin,
    borderColor: theme.hard.ink,
  },
  thumbnailEmoji: {
    fontSize: 28,
  },
  miniAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.hard.borderThin,
    borderColor: theme.hard.ink,
  },
  miniAvatarText: {
    color: theme.primaryDeep,
    fontSize: 13,
    fontWeight: '800',
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
    marginRight: 12,
  },
  cardTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 2,
  },
  cardItemName: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardMetaColumn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  cardTime: {
    color: theme.textDisabled,
    fontSize: 11,
    fontWeight: '600',
  },
  cardMeta: {
    color: theme.textMuted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '300',
  },
  cardMetaUnread: {
    color: theme.text,
    fontWeight: '700',
  },
})

