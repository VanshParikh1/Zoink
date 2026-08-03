import React, { useCallback, useState } from 'react'
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import ScreenBackground from '../components/ScreenBackground'
import StateCard from '../components/StateCard'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { listDisputes } from '../services/adminApi'
import { AdminDisputeListItem, DisputeStatus } from '../types'
import { theme } from '../theme/colors'

type Nav = NativeStackNavigationProp<RootStackParamList>

const REASON_LABELS: Record<string, string> = {
  ITEM_DAMAGED: 'Item was damaged',
  ITEM_NOT_RETURNED: 'Item was not returned',
  ITEM_NOT_AS_DESCRIBED: 'Item not as described',
  PAYMENT_ISSUE: 'Payment issue',
  OTHER: 'Other',
}

const FILTERS: { label: string; value: DisputeStatus | undefined }[] = [
  { label: 'All', value: undefined },
  { label: 'Open', value: 'OPEN' },
  { label: 'Under Review', value: 'UNDER_REVIEW' },
  { label: 'Refunded', value: 'RESOLVED_REFUND' },
  { label: 'No Action', value: 'RESOLVED_NO_ACTION' },
  { label: 'Dismissed', value: 'DISMISSED' },
]

function statusTone(status: DisputeStatus) {
  switch (status) {
    case 'OPEN':
      return styles.statusYellow
    case 'UNDER_REVIEW':
      return styles.statusBlue
    case 'RESOLVED_REFUND':
    case 'RESOLVED_NO_ACTION':
      return styles.statusGreen
    case 'DISMISSED':
      return styles.statusGrey
    default:
      return styles.statusGrey
  }
}

export default function AdminDisputesScreen() {
  const nav = useNavigation<Nav>()
  const [disputes, setDisputes] = useState<AdminDisputeListItem[]>([])
  const [filter, setFilter] = useState<DisputeStatus | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const loadDisputes = useCallback(async (status: DisputeStatus | undefined) => {
    try {
      setError('')
      const next = await listDisputes(status)
      setDisputes(next)
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not load disputes.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      loadDisputes(filter)
    }, [loadDisputes, filter])
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
      <FlatList
        data={disputes}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              loadDisputes(filter)
            }}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <TouchableOpacity onPress={() => nav.goBack()}>
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Dispute queue</Text>
            <Text style={styles.subtitle}>Review and resolve disputes raised across all bookings.</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chipsContainer}>
              {FILTERS.map((item) => {
                const isSelected = filter === item.value
                return (
                  <TouchableOpacity
                    key={item.label}
                    style={[styles.chip, isSelected ? styles.chipSelected : styles.chipUnselected]}
                    onPress={() => setFilter(item.value)}
                  >
                    <Text style={isSelected ? styles.chipTextSelected : styles.chipTextUnselected}>{item.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          error ? (
            <StateCard tone="error" eyebrow="DISPUTE QUEUE" title="Couldn't load disputes" body={error} actionLabel="Try again" onAction={() => loadDisputes(filter)} />
          ) : (
            <StateCard eyebrow="ALL CLEAR" title="No disputes here" body="Nothing matches this filter right now." />
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => nav.navigate('AdminDisputeDetail', { disputeId: item.id })}>
            <View style={styles.cardRow}>
              <Text style={styles.cardTitle}>{REASON_LABELS[item.reason] ?? item.reason}</Text>
              <Text style={[styles.pill, statusTone(item.status)]}>{item.status.replace(/_/g, ' ')}</Text>
            </View>
            <Text style={styles.cardMeta} numberOfLines={2}>{item.description}</Text>
            <View style={styles.cardFooter}>
              <Text style={styles.cardFooterText}>{item.raisedByUser.firstName} · {item.raisedByUser.email}</Text>
              <Text style={styles.cardPrice}>${Number(item.booking.totalPrice).toFixed(2)}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </ScreenBackground>
  )
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.screen },
  content: { padding: 24, paddingTop: 64, paddingBottom: 32, gap: 14 },
  header: { marginBottom: 8 },
  backText: { color: theme.textMuted, fontSize: 14, fontWeight: '700', marginBottom: 18 },
  title: { color: theme.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: theme.textMuted, fontSize: 15, marginTop: 8 },
  chipsScroll: { marginTop: 16, flexGrow: 0 },
  chipsContainer: { gap: 8, flexDirection: 'row', paddingRight: 24 },
  chip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: theme.border },
  chipSelected: { backgroundColor: theme.primary, borderColor: theme.primary },
  chipUnselected: { backgroundColor: theme.surfaceSubdued },
  chipTextSelected: { color: theme.textOnPrimary, fontWeight: '800', fontSize: 13 },
  chipTextUnselected: { color: theme.textMuted, fontWeight: '700', fontSize: 13 },
  card: {
    backgroundColor: theme.cardBackground,
    borderRadius: 8,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    marginBottom: 14,
    gap: 10,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  cardTitle: { color: theme.text, fontSize: 16, fontWeight: '900', flex: 1 },
  cardMeta: { color: theme.textMuted, fontSize: 14, lineHeight: 20 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardFooterText: { color: theme.textDisabled, fontSize: 12, fontWeight: '700', flex: 1 },
  cardPrice: { color: theme.primary, fontSize: 15, fontWeight: '900' },
  pill: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 10,
    fontWeight: '900',
  },
  statusYellow: { backgroundColor: '#FFF5D6', color: '#8A5A00' },
  statusBlue: { backgroundColor: '#E1F0FF', color: '#185EA8' },
  statusGrey: { backgroundColor: '#EFEFF1', color: '#6D7175' },
  statusGreen: { backgroundColor: theme.primarySurface, color: theme.primaryDeep },
})
