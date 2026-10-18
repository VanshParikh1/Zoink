import React, { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Switch, Text } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { TERMS_VERSION, formatDayOf } from '@zoink/shared'
import { RootStackParamList } from '../navigation'
import { useAuth } from '../context/AuthContext'
import { deleteMyAccount, getMyBlocks, getMyProfile, unblockUser, updateNotificationPreferences } from '../services/usersApi'
import { BlockedUser, NotificationPreferences } from '../types'
import { colors } from '../theme/colors'
import { space } from '../theme/tokens'
import { fonts, type } from '../theme/typography'
import Screen from '../components/mockup/Screen'
import ScreenHeader from '../components/mockup/ScreenHeader'
import Card from '../components/mockup/Card'
import { GroupLabel, ListRow, RowGroup } from '../components/mockup/RowGroup'
import Constants from 'expo-constants'

type Nav = NativeStackNavigationProp<RootStackParamList>

const SUPPORT_EMAIL = 'zoinksupport@gmail.com'

const APP_VERSION: string = Constants.expoConfig?.version ?? '—'
const APP_BUILD: string | null =
  Constants.expoConfig?.ios?.buildNumber?.toString() ??
  Constants.expoConfig?.android?.versionCode?.toString() ??
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
  const [termsAcceptedAt, setTermsAcceptedAt] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingKey, setSavingKey] = useState<keyof NotificationPreferences | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [blocks, setBlocks] = useState<BlockedUser[]>([])
  const [unblockingId, setUnblockingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user?.id) return
    try {
      setError('')
      const profile = await getMyProfile(user.id)
      setEmail(profile.email)
      setPrefs(profile.notificationPreferences)
      setTermsAcceptedAt(profile.termsAcceptedAt)
      // Separate from the profile fetch — a failure here shouldn't blank the page.
      getMyBlocks().then(setBlocks).catch(() => {})
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

  function confirmUnblock(blocked: BlockedUser) {
    const name = `${blocked.firstName} ${blocked.lastName}`
    Alert.alert(`Unblock ${name}?`, "You'll see each other's listings and profiles again, and can message and book each other.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock',
        onPress: async () => {
          setUnblockingId(blocked.id)
          try {
            await unblockUser(blocked.id)
            setBlocks((current) => current.filter((b) => b.id !== blocked.id))
          } catch (err: any) {
            Alert.alert('Could not unblock', err?.response?.data?.error ?? 'Please try again.')
          } finally {
            setUnblockingId(null)
          }
        },
      },
    ])
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
    <Screen header={<ScreenHeader title="Settings" back />} contentStyle={styles.content}>
      {loading ? (
        <ActivityIndicator size="large" color={colors.greenText} style={styles.loading} />
      ) : (
        <>
          {error ? (
            <Card shadow={false} padding={space.xxl} contentStyle={styles.problem}>
              <Text style={styles.problemText}>{error}</Text>
            </Card>
          ) : null}

          <GroupLabel>Account</GroupLabel>
          <RowGroup>
            <ListRow icon="mail" label="Email" value={email ?? '—'} />
          </RowGroup>

          <GroupLabel>Notifications</GroupLabel>
          <RowGroup>
            {NOTIFICATION_ROWS.map((row) => (
              <ListRow
                key={row.key}
                label={row.label}
                value={row.hint}
                right={
                  <Switch
                    value={prefs ? prefs[row.key] : true}
                    onValueChange={(value) => togglePref(row.key, value)}
                    disabled={!prefs || savingKey === row.key}
                    trackColor={{ false: colors.tan, true: colors.green }}
                    ios_backgroundColor={colors.tan}
                    accessibilityLabel={row.label}
                  />
                }
              />
            ))}
          </RowGroup>
          <Text style={styles.footnote}>Verification and account-security alerts are always sent.</Text>

          <GroupLabel>Blocked users</GroupLabel>
          {blocks.length === 0 ? (
            <Card shadow={false} padding={space.xxl}>
              <Text style={styles.muted}>
                You haven't blocked anyone. You can block someone from their profile or from a conversation.
              </Text>
            </Card>
          ) : (
            <RowGroup>
              {blocks.map((blocked) => (
                <ListRow
                  key={blocked.id}
                  icon="slash"
                  label={`${blocked.firstName} ${blocked.lastName}`}
                  value={`Blocked ${formatDayOf(blocked.blockedAt, 'long')}`}
                  loading={unblockingId === blocked.id}
                  right={
                    <Pressable
                      onPress={() => confirmUnblock(blocked)}
                      disabled={unblockingId === blocked.id}
                      hitSlop={14}
                      accessibilityRole="button"
                      accessibilityLabel={`Unblock ${blocked.firstName} ${blocked.lastName}`}
                    >
                      <Text style={styles.link}>Unblock</Text>
                    </Pressable>
                  }
                />
              ))}
            </RowGroup>
          )}

          <GroupLabel>Legal</GroupLabel>
          <RowGroup>
            <ListRow
              icon="file-text"
              label="Terms of Service & Privacy Policy"
              value={
                termsAcceptedAt
                  ? `Accepted Terms v${TERMS_VERSION} on ${formatDayOf(termsAcceptedAt, 'long')}`
                  : 'You have not yet accepted the current Terms.'
              }
              onPress={() => nav.navigate('TermsAcceptance', { mode: 'view' })}
            />
          </RowGroup>

          <GroupLabel>Support</GroupLabel>
          <RowGroup>
            <ListRow
              icon="help-circle"
              label="Questions or something not working?"
              value={SUPPORT_EMAIL}
              onPress={() => openUrl(`mailto:${SUPPORT_EMAIL}`)}
            />
          </RowGroup>

          <GroupLabel>About</GroupLabel>
          <RowGroup>
            <ListRow icon="info" label="Version" right={<Text style={styles.value}>{APP_VERSION}{APP_BUILD ? ` (${APP_BUILD})` : ''}</Text>} />
            {/* Dev-only entry to the mockup component gallery; never in release builds. */}
            {__DEV__ ? <ListRow icon="grid" label="Design gallery (dev)" onPress={() => nav.navigate('DesignGallery')} /> : null}
          </RowGroup>

          <RowGroup style={styles.dangerGroup}>
            <ListRow icon="log-out" label="Log out" danger onPress={logout} right={null} />
            <ListRow icon="trash-2" label="Delete account" danger onPress={confirmDelete} loading={deleting} right={null} />
          </RowGroup>
        </>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: {
    gap: space.sm,
  },
  loading: {
    marginTop: 80,
  },
  problem: {
    backgroundColor: colors.tan,
  },
  problemText: {
    ...type.bodySm,
    color: colors.danger,
  },
  footnote: {
    ...type.caption,
    color: colors.mutedAlt,
    marginLeft: space.xs,
  },
  muted: {
    ...type.bodySm,
    color: colors.mutedAlt,
  },
  link: {
    ...type.label,
    color: colors.greenText,
    textDecorationLine: 'underline',
  },
  value: {
    ...type.bodySm,
    fontFamily: fonts.bold,
    color: colors.mutedAlt,
  },
  dangerGroup: {
    marginTop: space.xxl,
  },
})
