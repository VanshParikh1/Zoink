import React, { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import ScreenBackground from '../components/ScreenBackground'
import StateCard from '../components/StateCard'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { listReports, resolveReport } from '../services/adminApi'
import { AdminReportListItem, ReportStatus } from '../types'
import { theme } from '../theme/colors'

type Nav = NativeStackNavigationProp<RootStackParamList>

const REASON_LABELS: Record<string, string> = {
  SPAM: 'Spam',
  SCAM: 'Scam',
  INAPPROPRIATE: 'Inappropriate content',
  HARASSMENT: 'Harassment',
  OTHER: 'Other',
}

const FILTERS: { label: string; value: ReportStatus | undefined }[] = [
  { label: 'All', value: undefined },
  { label: 'Open', value: 'OPEN' },
  { label: 'Reviewed', value: 'REVIEWED' },
  { label: 'Dismissed', value: 'DISMISSED' },
]

function statusTone(status: ReportStatus) {
  switch (status) {
    case 'OPEN':
      return styles.statusYellow
    case 'REVIEWED':
      return styles.statusGreen
    case 'DISMISSED':
      return styles.statusGrey
    default:
      return styles.statusGrey
  }
}

export default function AdminReportsScreen() {
  const nav = useNavigation<Nav>()
  const [reports, setReports] = useState<AdminReportListItem[]>([])
  const [filter, setFilter] = useState<ReportStatus | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const [activeReport, setActiveReport] = useState<AdminReportListItem | null>(null)
  const [adminNotes, setAdminNotes] = useState('')
  const [resolving, setResolving] = useState(false)

  const loadReports = useCallback(async (status: ReportStatus | undefined) => {
    try {
      setError('')
      const next = await listReports(status)
      setReports(next)
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not load reports.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      loadReports(filter)
    }, [loadReports, filter])
  )

  function openResolve(report: AdminReportListItem) {
    setActiveReport(report)
    setAdminNotes('')
  }

  async function handleResolve(status: 'REVIEWED' | 'DISMISSED') {
    if (!activeReport) return

    setResolving(true)
    try {
      await resolveReport(activeReport.id, {
        status,
        adminNotes: adminNotes.trim().length > 0 ? adminNotes.trim() : undefined,
      })
      setActiveReport(null)
      loadReports(filter)
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not resolve this report.')
    } finally {
      setResolving(false)
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
    <ScreenBackground>
      <FlatList
        data={reports}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              loadReports(filter)
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
            <Text style={styles.title}>Report queue</Text>
            <Text style={styles.subtitle}>Review reports filed against listings and users for misconduct.</Text>

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
            <StateCard tone="error" eyebrow="REPORT QUEUE" title="Couldn't load reports" body={error} actionLabel="Try again" onAction={() => loadReports(filter)} />
          ) : (
            <StateCard eyebrow="ALL CLEAR" title="No reports here" body="Nothing matches this filter right now." />
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => openResolve(item)} disabled={item.status !== 'OPEN'}>
            <View style={styles.cardRow}>
              <Text style={styles.cardTitle}>
                {item.targetType === 'LISTING' ? 'Listing' : 'User'} · {REASON_LABELS[item.reason] ?? item.reason}
              </Text>
              <Text style={[styles.pill, statusTone(item.status)]}>{item.status}</Text>
            </View>
            <Text style={styles.cardTarget} numberOfLines={1}>{item.targetLabel}</Text>
            {item.description ? (
              <Text style={styles.cardMeta} numberOfLines={2}>{item.description}</Text>
            ) : null}
            <View style={styles.cardFooter}>
              <Text style={styles.cardFooterText}>{item.reporter.firstName} · {item.reporter.email}</Text>
            </View>
          </TouchableOpacity>
        )}
      />

      <Modal visible={!!activeReport} animationType="slide" transparent onRequestClose={() => setActiveReport(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Resolve report</Text>
            {activeReport ? (
              <Text style={styles.modalSubtitle}>
                {activeReport.targetType === 'LISTING' ? 'Listing' : 'User'} · {REASON_LABELS[activeReport.reason] ?? activeReport.reason}
              </Text>
            ) : null}
            {activeReport ? (
              <Text style={styles.modalTarget}>{activeReport.targetLabel}</Text>
            ) : null}
            {activeReport?.description ? (
              <Text style={styles.modalDescription}>{activeReport.description}</Text>
            ) : null}

            <Text style={styles.label}>Admin notes (optional)</Text>
            <TextInput
              value={adminNotes}
              onChangeText={setAdminNotes}
              editable={!resolving}
              multiline
              maxLength={1000}
              placeholder="Notes about how this was reviewed."
              placeholderTextColor={theme.textMuted}
              style={styles.input}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.dismissButton]}
                onPress={() => handleResolve('DISMISSED')}
                disabled={resolving}
              >
                <Text style={styles.dismissButtonText}>Dismiss</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.reviewedButton]}
                onPress={() => handleResolve('REVIEWED')}
                disabled={resolving}
              >
                {resolving ? <ActivityIndicator color={theme.textOnPrimary} /> : <Text style={styles.reviewedButtonText}>Mark reviewed</Text>}
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={() => setActiveReport(null)} disabled={resolving}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  cardTarget: { color: theme.primary, fontSize: 13, fontWeight: '800' },
  cardMeta: { color: theme.textMuted, fontSize: 14, lineHeight: 20 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardFooterText: { color: theme.textDisabled, fontSize: 12, fontWeight: '700', flex: 1 },
  pill: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 10,
    fontWeight: '900',
  },
  statusYellow: { backgroundColor: '#FFF5D6', color: '#8A5A00' },
  statusGrey: { backgroundColor: '#EFEFF1', color: '#6D7175' },
  statusGreen: { backgroundColor: theme.primarySurface, color: theme.primaryDeep },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 14,
  },
  modalTitle: { color: theme.text, fontSize: 20, fontWeight: '900' },
  modalSubtitle: { color: theme.primary, fontSize: 14, fontWeight: '800' },
  modalTarget: { color: theme.text, fontSize: 14, fontWeight: '700' },
  modalDescription: { color: theme.textMuted, fontSize: 14, lineHeight: 20 },
  label: { color: theme.text, fontSize: 15, fontWeight: '900' },
  input: {
    minHeight: 90,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: 'transparent',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.text,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalButton: { flex: 1, minHeight: 50, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  dismissButton: { backgroundColor: theme.surfaceSubdued, borderWidth: 1, borderColor: theme.border },
  dismissButtonText: { color: theme.text, fontSize: 15, fontWeight: '900' },
  reviewedButton: { backgroundColor: theme.primary },
  reviewedButtonText: { color: theme.textOnPrimary, fontSize: 15, fontWeight: '900' },
  cancelText: { color: theme.textMuted, fontSize: 14, fontWeight: '700', textAlign: 'center', paddingTop: 4 },
})
