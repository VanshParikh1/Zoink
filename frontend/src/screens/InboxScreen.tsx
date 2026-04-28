import React, { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { getMyConversations } from '../services/conversationsApi'
import { Conversation } from '../types'
import { theme } from '../theme/colors'

type Nav = NativeStackNavigationProp<RootStackParamList>

export default function InboxScreen() {
  const nav = useNavigation<Nav>()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadConversations = useCallback(async () => {
    try {
      const nextConversations = await getMyConversations()
      setConversations(nextConversations)
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not load your inbox.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadConversations()
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
            <Text style={styles.subtitle}>Listing conversations update here as new messages come in.</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.emptyText}>No conversations yet.</Text>}
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
  content: { padding: 24, paddingTop: 64, paddingBottom: 32 },
  header: { marginBottom: 8 },
  backText: { color: theme.textMuted, fontSize: 14, fontWeight: '700', marginBottom: 18 },
  title: { color: theme.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: theme.textMuted, fontSize: 15, marginTop: 8 },
  emptyText: { color: theme.textMuted, fontSize: 15, marginTop: 24 },
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
