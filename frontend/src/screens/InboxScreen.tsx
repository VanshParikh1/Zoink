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
          <View style={styles.showcase}>
            <Text style={styles.showcaseTitle}>Button Style Preview</Text>

            {/* 1. LIME → DEEP GREEN (diagonal) */}
            <TouchableOpacity 
              style={styles.btnWrap} 
              activeOpacity={0.8}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}) }}
            >
              <LinearGradient colors={[theme.primary, theme.primaryDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btn}>
                <Text style={styles.btnText}>Continue</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* 2. SOFT MINT → LIME → DEEP (three-stop) */}
            <TouchableOpacity style={styles.btnWrap} activeOpacity={0.8}>
              <LinearGradient colors={['rgba(150, 232, 90, 1)', theme.primary, theme.primaryDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btn}>
                <Text style={styles.btnText}>Create account</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* 3. LIME → FOREST (less neon) */}
            <TouchableOpacity style={styles.btnWrap} activeOpacity={0.8}>
              <LinearGradient colors={[theme.primary, 'rgba(78, 168, 34, 1)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btn}>
                <Text style={styles.btnText}>Get started</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* 4. LEFT → RIGHT (flatter) */}
            <TouchableOpacity style={styles.btnWrap} activeOpacity={0.8}>
              <LinearGradient colors={[theme.primaryDeep, theme.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btn}>
                <Text style={styles.btnText}>Post to Zoink</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* 5. GHOST */}
            <TouchableOpacity 
              style={styles.ghostBtn}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}) }}
            >
              <Text style={styles.ghostText}>Learn more</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => {
          const imageUrl = item.listing.images?.[0]?.url
          return (
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
  showcase: {
    marginTop: 20,
    gap: 16,
  },
  showcaseTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  btnWrap: {
    width: '100%',
  },
  btn: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textOnPrimary,
  },
  ghostBtn: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 10,
    backgroundColor: 'rgba(109, 216, 50, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(109, 216, 50, 0.30)',
    alignItems: 'center',
  },
  ghostText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.primaryDeep,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.cardBackground,
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  cardUnread: {
    borderColor: theme.primary,
    backgroundColor: theme.primarySurface,
  },
  cardLeft: {
    position: 'relative',
    marginRight: 16,
  },
  thumbnailImage: {
    width: 64,
    height: 64,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
  thumbnailPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: theme.surfaceSubdued,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  thumbnailEmoji: {
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
    color: theme.textDisabled,
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

