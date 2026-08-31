import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { useAuth } from '../context/AuthContext'
import { deleteMyAccount, getMyProfile, updateNotificationPreferences } from '../services/usersApi'
import { NotificationPreferences } from '../types'
import { theme } from '../theme/colors'
import ScreenBackground from '../components/ScreenBackground'
import ZoinkButton from '../components/ZoinkButton'
import appJson from '../../app.json'

type Nav = NativeStackNavigationProp<RootStackParamList>

const PRIVACY_URL = 'https://zoink.app/privacy'
const TERMS_URL = 'https://zoink.app/terms'
const SUPPORT_EMAIL = 'support@zoink.app'

const APP_VERSION: string = (appJson as any)?.expo?.version ?? '—'
const APP_BUILD: string | null =
  (appJson as any)?.expo?.ios?.buildNumber?.toString() ??
  (appJson as any)?.expo?.android?.versionCode?.toString() ??
  null

const NOTIFICATION_ROWS: { key: keyof NotificationPreferences; label: string; hint: string }[] = [
  { key: 'notifyMessages', label: 'Messages', hint: 'New messages in your conversations' },
  { key: 'notifyBookingActivity', label: 'Booking activity', hint: 'Requests, approvals, declines, and cancellations' },
  { key: 'notifyPaymentsPayouts', label: 'Payments & payouts', hint: 'Payment confirmations and payout notices' },
  { key: 'notifyDepositUpdates', label: 'Deposit updates', hint: 'When a security deposit is released back to you' },
  { key: 'notifyReviews', label: 'Reviews', hint: 'When someone leaves you a review' },
]

export default function SettingsScreen() {
  const nav = useNavigation<Nav>()
  const { user, logout } = useAuth()

  const [email, setEmail] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingKey, setSavingKey] = useState<keyof NotificationPreferences | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    if (!user?.id) return
    try {
      setError('')
      const profile = await getMyProfile(user.id)
      setEmail(profile.email)
      setPrefs(profile.notificationPreferences)
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not load your settings.')
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load])
  )

  async function togglePref(key: keyof NotificationPreferences, value: boolean) {
    if (!prefs) return
    const previous = prefs
    setPrefs({ ...prefs, [key]: value })
    setSavingKey(key)
    try {
      const next = await updateNotificationPreferences({ [key]: value })
      setPrefs(next)
    } catch (err: any) {
      setPrefs(previous)
      Alert.alert('Could not save', err?.response?.data?.error ?? 'Please try again.')
    } finally {
      setSavingKey(null)
    }
  }

  function confirmDelete() {
    Alert.alert(
      'Delete your account?',
      'Your profile will be anonymized and your listings taken down. Your past bookings, reviews, and disputes stay on record for the people you rented with.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', style: 'destructive', onPress: confirmDeleteFinal },
      ]
    )
  }

  function confirmDeleteFinal() {
    Alert.alert(
      'This cannot be undone',
      'You will be signed out immediately and will not be able to sign back in with this account.',
      [
        { text: 'Keep my account', style: 'cancel' },
        { text: 'Delete account', style: 'destructive', onPress: runDelete },
      ]
    )
  }

  async function runDelete() {
    setDeleting(true)
    try {
      await deleteMyAccount()
      await logout()
    } catch (err: any) {
      setDeleting(false)
      Alert.alert('Could not delete account', err?.response?.data?.error ?? 'Please try again.')
    }
  }

  function openUrl(url: string) {
    Linking.openURL(url).catch(() => Alert.alert('Could not open link', url))
  }

  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => nav.goBack()}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Settings</Text>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : (
          <>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {/* Account */}
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Account</Text>
              <View style={styles.readRow}>
                <Text style={styles.readLabel}>Email</Text>
                <Text style={styles.readValue}>{email ?? '—'}</Text>
              </View>
              <ZoinkButton label="Log out" variant="inset" onPress={logout} style={{ marginTop: 14 }} />
              <ZoinkButton
                label="Delete account"
                variant="danger"
                onPress={confirmDelete}
                isLoading={deleting}
                style={{ marginTop: 10 }}
              />
            </View>

            {/* Notifications */}
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Notifications</Text>
              {NOTIFICATION_ROWS.map((row, index) => (
                <View
                  key={row.key}
                  style={[styles.toggleRow, index === NOTIFICATION_ROWS.length - 1 && styles.toggleRowLast]}
                >
                  <View style={styles.toggleTextWrap}>
                    <Text style={styles.toggleLabel}>{row.label}</Text>
                    <Text style={styles.toggleHint}>{row.hint}</Text>
                  </View>
                  <Switch
                    value={prefs ? prefs[row.key] : true}
                    onValueChange={(value) => togglePref(row.key, value)}
                    disabled={!prefs || savingKey === row.key}
                    trackColor={{ true: theme.primary, false: theme.border }}
                  />
                </View>
              ))}
              <Text style={styles.footnote}>
                Verification and account-security alerts are always sent.
              </Text>
            </View>

            {/* Legal */}
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Legal</Text>
              <TouchableOpacity style={styles.linkRow} onPress={() => openUrl(PRIVACY_URL)}>
                <Text style={styles.linkRowText}>Privacy Policy</Text>
                <Text style={styles.linkRowChevron}>›</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.linkRow, styles.linkRowLast]} onPress={() => openUrl(TERMS_URL)}>
                <Text style={styles.linkRowText}>Terms of Service</Text>
                <Text style={styles.linkRowChevron}>›</Text>
              </TouchableOpacity>
            </View>

            {/* Support */}
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Support</Text>
              <Text style={styles.readValue}>Questions or something not working?</Text>
              <TouchableOpacity style={styles.linkRow} onPress={() => openUrl(`mailto:${SUPPORT_EMAIL}`)}>
                <Text style={styles.linkRowText}>{SUPPORT_EMAIL}</Text>
                <Text style={styles.linkRowChevron}>›</Text>
              </TouchableOpacity>
            </View>

            {/* About */}
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>About</Text>
              <View style={styles.readRow}>
                <Text style={styles.readLabel}>Version</Text>
                <Text style={styles.readValue}>
                  {APP_VERSION}
                  {APP_BUILD ? ` (${APP_BUILD})` : ''}
                </Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </ScreenBackground>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 18, paddingBottom: 120 },
  header: { paddingTop: theme.header.stackTop, paddingBottom: 8 },
  backText: { color: theme.textMuted, fontSize: 14, fontWeight: '700', marginBottom: 18 },
  title: { ...theme.type.screenTitle },
  loadingBox: { paddingVertical: 80, alignItems: 'center' },
  errorText: {
    color: theme.colors.danger,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 12,
  },
  panel: {
    backgroundColor: theme.primarySurface,
    borderRadius: theme.radius.md,
    padding: 18,
    marginTop: 14,
    borderWidth: theme.hard.border,
    borderColor: theme.hard.ink,
  },
  panelTitle: { color: theme.text, fontSize: 18, fontWeight: '900', marginBottom: 6 },
  readRow: { paddingVertical: 12 },
  readLabel: {
    color: theme.primaryDeep,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  readValue: { color: theme.text, fontSize: 15, fontWeight: '600', lineHeight: 21 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(78, 168, 34, 0.28)',
  },
  toggleRowLast: { borderBottomWidth: 0 },
  toggleTextWrap: { flex: 1 },
  toggleLabel: { color: theme.text, fontSize: 15, fontWeight: '800' },
  toggleHint: { color: theme.textMuted, fontSize: 13, marginTop: 2, lineHeight: 18 },
  footnote: { color: theme.textMuted, fontSize: 12, fontWeight: '600', marginTop: 12 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(78, 168, 34, 0.28)',
  },
  linkRowLast: { borderBottomWidth: 0 },
  linkRowText: { color: theme.text, fontSize: 15, fontWeight: '700' },
  linkRowChevron: { color: theme.textMuted, fontSize: 20, fontWeight: '700' },
})
