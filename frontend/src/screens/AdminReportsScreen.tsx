import React, { useState } from 'react'
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { listReports, resolveReport } from '../services/adminApi'
import { queryKeys } from '../services/queryKeys'
import { usePagedList } from '../hooks/usePagedList'
import { userMessage } from '../utils/userMessage'
import { AdminReportListItem, ReportStatus, ReportTargetType } from '../types'
import { colors } from '../theme/colors'
import { radius, shadow, space } from '../theme/tokens'
import { fonts, type } from '../theme/typography'
import Screen from '../components/mockup/Screen'
import ScreenHeader from '../components/mockup/ScreenHeader'
import Card from '../components/mockup/Card'
import Chip from '../components/mockup/Chip'
import Badge from '../components/mockup/Badge'
import Button from '../components/mockup/Button'
import TextField from '../components/mockup/TextField'
import StatePanel from '../components/mockup/StatePanel'
import { reportStatusBadge } from '../components/mockup/adminStatus'
import { toast } from '../services/toast'

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

const TARGET_TYPE_LABELS: Record<ReportTargetType, string> = {
  USER: 'User',
  LISTING: 'Listing',
  MESSAGE: 'Message',
}

export default function AdminReportsScreen() {
  const [filter, setFilter] = useState<ReportStatus | undefined>(undefined)
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const feed = usePagedList<AdminReportListItem>(queryKeys.adminReports(filter), (cursor) => listReports(filter, cursor))
  const { items: reports, loading, refreshing } = feed
  const error = feed.error ? userMessage(feed.error, { action: 'Could not load reports.' }) : ''

  const [activeReport, setActiveReport] = useState<AdminReportListItem | null>(null)
  const [adminNotes, setAdminNotes] = useState('')
  const [resolving, setResolving] = useState(false)

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
      // Every filter's list may have changed (the report left OPEN).
      queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] })
      toast.success(status === 'DISMISSED' ? 'Report dismissed.' : 'Report marked reviewed.')
    } catch (err: any) {
      toast.failure(err, { action: "Couldn't update this report. Please try again." })
    } finally {
      setResolving(false)
    }
  }

  const header = <ScreenHeader title="Report queue" back />

  if (loading) {
    return (
      <Screen scroll={false} header={header} contentStyle={styles.centered}>
        <ActivityIndicator size="large" color={colors.greenText} />
      </Screen>
    )
  }

  return (
    <Screen scroll={false} header={header} contentStyle={styles.screenContent}>
      <FlatList
        data={reports}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={feed.refresh}
            tintColor={colors.greenText}
            colors={[colors.green]}
          />
        }
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxl }]}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={styles.subtitle}>Review reports filed against listings and users for misconduct.</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {FILTERS.map((item) => (
                <Chip key={item.label} label={item.label} active={filter === item.value} onPress={() => setFilter(item.value)} />
              ))}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          error ? (
            <StatePanel
              title="Couldn't load reports"
              body={error}
              action={{ label: 'Try again', onPress: () => feed.retry(), variant: 'primary' }}
            />
          ) : (
            <StatePanel title="No reports here" body="Nothing matches this filter right now." />
          )
        }
        ItemSeparatorComponent={Separator}
        onEndReached={feed.loadMore}
        onEndReachedThreshold={1}
        ListFooterComponent={feed.loadingMore ? <ActivityIndicator style={styles.footer} color={colors.greenText} /> : null}
        renderItem={({ item }) => {
          const badge = reportStatusBadge(item.status)
          const title = `${TARGET_TYPE_LABELS[item.targetType]} · ${REASON_LABELS[item.reason] ?? item.reason}`
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${title}, ${badge.label}`}
              accessibilityState={{ disabled: item.status !== 'OPEN' }}
              onPress={() => openResolve(item)}
              disabled={item.status !== 'OPEN'}
              style={({ pressed }) => (pressed ? styles.pressed : null)}
            >
              <Card shadow={item.status === 'OPEN' ? 'sm' : false} padding={space.xxl} style={item.status === 'OPEN' ? null : styles.shadowSpace} contentStyle={styles.card}>
                <View style={styles.cardRow}>
                  <Text style={styles.cardTitle}>{title}</Text>
                  <Badge label={badge.label} variant={badge.variant} />
                </View>
                <Text style={styles.cardTarget} numberOfLines={item.targetType === 'MESSAGE' ? 3 : 1}>{item.targetLabel}</Text>
                {item.description ? <Text style={styles.cardBody} numberOfLines={2}>{item.description}</Text> : null}
                <Text style={styles.caption} numberOfLines={1}>{item.reporter.firstName} · {item.reporter.email}</Text>
              </Card>
            </Pressable>
          )
        }}
        showsVerticalScrollIndicator={false}
      />

      <Modal visible={!!activeReport} animationType="fade" transparent onRequestClose={() => setActiveReport(null)}>
        <KeyboardAvoidingView style={styles.scrim} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Card radius="hero" shadow="lg" padding={space.screen} style={styles.sheet} contentStyle={styles.sheetBody}>
            <Text style={styles.sheetTitle}>Resolve report</Text>
            {activeReport ? (
              <>
                <Text style={styles.cardTitle}>
                  {TARGET_TYPE_LABELS[activeReport.targetType]} · {REASON_LABELS[activeReport.reason] ?? activeReport.reason}
                </Text>
                <Text style={styles.cardTarget}>{activeReport.targetLabel}</Text>
                {activeReport.description ? <Text style={styles.cardBody}>{activeReport.description}</Text> : null}
              </>
            ) : null}
            <TextField
              label="Admin notes (optional)"
              value={adminNotes}
              onChangeText={setAdminNotes}
              editable={!resolving}
              multiline
              maxLength={1000}
              placeholder="Notes about how this was reviewed."
            />
            <View style={styles.sheetActions}>
              <Button label="Mark reviewed" onPress={() => handleResolve('REVIEWED')} loading={resolving} />
              <Button label="Dismiss" variant="secondary" onPress={() => handleResolve('DISMISSED')} disabled={resolving} />
              <Button label="Cancel" variant="link" onPress={() => setActiveReport(null)} disabled={resolving} style={styles.cancel} />
            </View>
          </Card>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  )
}

function Separator() {
  return <View style={styles.separator} />
}

const styles = StyleSheet.create({
  centered: { alignItems: 'center', justifyContent: 'center' },
  screenContent: { paddingHorizontal: 0, paddingBottom: 0 },
  content: { paddingHorizontal: space.screen },
  listHeader: { gap: space.lg, marginBottom: space.lg },
  subtitle: { ...type.bodySm, color: colors.mutedAlt },
  chips: { gap: space.sm, paddingVertical: space.xs },
  separator: { height: space.lg },
  footer: { marginTop: space.lg },
  pressed: { opacity: 0.85 },
  shadowSpace: { paddingRight: shadow.sm, paddingBottom: shadow.sm },
  card: { gap: space.sm },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.lg },
  cardTitle: { ...type.bodySm, fontFamily: fonts.bold, color: colors.ink, flex: 1 },
  cardTarget: { ...type.bodySm, color: colors.ink },
  cardBody: { ...type.bodySm, color: colors.muted },
  caption: { ...type.caption, color: colors.mutedAlt },
  scrim: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'center', padding: space.screen },
  sheet: { width: '100%' },
  sheetBody: { gap: space.lg, borderRadius: radius.hero },
  sheetTitle: { ...type.section, color: colors.ink },
  sheetActions: { gap: space.md, marginTop: space.xs },
  cancel: { alignSelf: 'center' },
})
