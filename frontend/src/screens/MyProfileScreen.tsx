import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  AppState,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  Linking,
} from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import * as ImagePicker from 'expo-image-picker'
import * as SecureStore from 'expo-secure-store'
import * as Haptics from 'expo-haptics'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuth } from '../context/AuthContext'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../services/queryKeys'
import { userMessage } from '../utils/userMessage'
import { useIsTabActive, useMainTab, useTabLoad } from '../context/MainTabContext'
import { PAYOUT_STATUS_MAX_AGE_MS } from '../config/polling'
import { RootStackParamList } from '../navigation'
import { getMyProfile, updateMyProfile, uploadMyAvatar, getStripeConnectStatus, onboardStripeConnect, StripeConnectStatus } from '../services/usersApi'
import { MyProfile } from '../types'
import { colors } from '../theme/colors'
import { space } from '../theme/tokens'
import { fonts, type } from '../theme/typography'
import { useTabBarClearance } from '../components/mockup/tabBarMetrics'
import Screen from '../components/mockup/Screen'
import ScreenHeader from '../components/mockup/ScreenHeader'
import ProfileHeader from '../components/mockup/ProfileHeader'
import Card from '../components/mockup/Card'
import InkCard from '../components/mockup/InkCard'
import Button from '../components/mockup/Button'
import TextField from '../components/mockup/TextField'
import { GroupLabel, ListRow, RowGroup } from '../components/mockup/RowGroup'
import { universityFromEmail } from '../utils/university'
import { useRenderProbe } from '../utils/perfMarks'
import { toast } from '../services/toast'

type Nav = NativeStackNavigationProp<RootStackParamList>
const PROFILE_PROMPT_KEY_PREFIX = 'zoink_profile_prompt_seen'

async function setPromptSeen(key: string) {
  if (Platform.OS === 'web') {
    localStorage.setItem(key, '1')
    return
  }
  await SecureStore.setItemAsync(key, '1')
}

async function getPromptSeen(key: string) {
  if (Platform.OS === 'web') {
    return localStorage.getItem(key)
  }
  return await SecureStore.getItemAsync(key)
}

export default function MyProfileScreen() {
  useRenderProbe('profile')
  const tabBarClearance = useTabBarClearance()
  const nav = useNavigation<Nav>()
  // Pushed as a standalone route (not one of the main tabs) it gets a back button.
  const insideTabs = useMainTab() !== null
  const { user, logout } = useAuth()
  const queryClient = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [showProfilePrompt, setShowProfilePrompt] = useState(false)
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    bio: '',
  })
  const [formErrors, setFormErrors] = useState<{ firstName?: string; lastName?: string }>({})

  // Loaded the first time the Profile tab opens (it's mounted behind Home).
  const [opened, setOpened] = useState(false)
  const profileKey = queryKeys.myProfile(user?.id ?? '')
  const profileQuery = useQuery({
    queryKey: profileKey,
    queryFn: () => getMyProfile(user!.id),
    enabled: opened && Boolean(user?.id),
  })
  const profile = profileQuery.data ?? null
  const loading = !opened || profileQuery.isPending
  const error = profileQuery.isError ? userMessage(profileQuery.error, { action: 'Could not load your profile right now.' }) : ''

  // The status endpoint makes a live Stripe API call, so routine reloads reuse
  // a recent answer; explicit refreshes (pull-to-refresh, the button, coming
  // back from Stripe's onboarding in the browser) always ask again.
  const stripeKey = ['users', 'me', 'payouts'] as const
  const stripeQuery = useQuery({
    queryKey: stripeKey,
    queryFn: getStripeConnectStatus,
    enabled: opened && Boolean(user?.id),
    staleTime: PAYOUT_STATUS_MAX_AGE_MS,
    retry: false,
  })
  const stripeStatus: StripeConnectStatus | null = stripeQuery.data ?? null
  const refreshStripeStatus = useCallback(async (_force = true) => {
    await queryClient.invalidateQueries({ queryKey: stripeKey })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient])

  const syncForm = useCallback((nextProfile: MyProfile) => {
    setForm({
      firstName: nextProfile.firstName,
      lastName: nextProfile.lastName,
      phone: nextProfile.phone ?? '',
      bio: nextProfile.bio ?? '',
    })
  }, [])
  // The form follows the profile as loaded, except while it's being edited.
  useEffect(() => {
    if (profile && !editing) syncForm(profile)
  }, [profile, editing, syncForm])

  useTabLoad('MyProfile', useCallback(() => {
    if (!opened) setOpened(true)
    else queryClient.refetchQueries({ queryKey: ['users', 'me'], type: 'active', stale: true })
  }, [opened, queryClient]))

  const [refreshing, setRefreshing] = useState(false)
  async function refreshAll() {
    setRefreshing(true)
    try {
      await Promise.all([profileQuery.refetch(), refreshStripeStatus(true)])
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    if (!user?.id) return

    const promptKey = `${PROFILE_PROMPT_KEY_PREFIX}_${user.id}`
    getPromptSeen(promptKey)
      .then((value) => {
        setShowProfilePrompt(!value)
      })
      .catch(() => {
        setShowProfilePrompt(true)
      })
  }, [user?.id])

  // Returning to the app from Stripe's onboarding page. Only while the
  // Profile tab is the one showing; other tabs don't display payout status.
  const isProfileActive = useIsTabActive('MyProfile')
  useEffect(() => {
    if (!user?.id || !isProfileActive) return

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshStripeStatus(true).catch(() => { })
      }
    })

    return () => subscription.remove()
  }, [isProfileActive, refreshStripeStatus, user?.id])

  async function dismissProfilePrompt() {
    if (user?.id) {
      await setPromptSeen(`${PROFILE_PROMPT_KEY_PREFIX}_${user.id}`)
    }
    setShowProfilePrompt(false)
  }

  async function handlePickAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (permission.status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access to update your profile photo.')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 5],
      quality: 0.8,
    })

    if (result.canceled || !result.assets[0]?.uri) return

    try {
      setUploading(true)
      const uploaded = await uploadMyAvatar(result.assets[0].uri)
      queryClient.setQueryData<MyProfile>(profileKey, (current) =>
        current ? { ...current, avatarUrl: uploaded.avatarUrl ?? current.avatarUrl } : current
      )
    } catch (err: any) {
      toast.failure(err, { action: "Couldn't update your photo. Please try again." })
    } finally {
      setUploading(false)
    }
  }

  async function handleSave() {
    const nextErrors = {
      firstName: form.firstName.trim() ? undefined : 'First name is required.',
      lastName: form.lastName.trim() ? undefined : 'Last name is required.',
    }
    setFormErrors(nextErrors)
    if (nextErrors.firstName || nextErrors.lastName) return

    try {
      setSaving(true)
      await updateMyProfile({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim() || undefined,
        bio: form.bio.trim() || undefined,
      })
      await profileQuery.refetch()
      queryClient.invalidateQueries({ queryKey: ['users', 'profile'] })
      setEditing(false)
      toast.success('Profile saved.')
    } catch (err: any) {
      toast.failure(err, { action: "Couldn't save your profile. Please try again." })
    } finally {
      setSaving(false)
    }
  }

  async function handleSetupPayouts() {
    try {
      setSaving(true)
      const { url } = await onboardStripeConnect()
      Linking.openURL(url)
    } catch (err: any) {
      toast.failure(err, { action: "Couldn't start payout setup. Please try again." })
    } finally {
      setSaving(false)
    }
  }

  function setField(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
    if (key === 'firstName' || key === 'lastName') {
      setFormErrors((current) => (current[key] ? { ...current, [key]: undefined } : current))
    }
  }

  function go(action: () => void) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { })
    action()
  }

  const header = <ScreenHeader title="Profile" back={!insideTabs} />

  if (loading) {
    return (
      <Screen scroll={false} header={header} contentStyle={styles.centered}>
        <ActivityIndicator size="large" color={colors.greenText} />
      </Screen>
    )
  }

  if (!profile) {
    return (
      <Screen scroll={false} header={header}>
        <Card shadow={false} padding={space.xxl} contentStyle={styles.problem}>
          <Text style={styles.problemText}>{error || 'Profile not found.'}</Text>
        </Card>
      </Screen>
    )
  }

  const displayProfile = editing
    ? {
      ...profile,
      firstName: form.firstName || profile.firstName,
      lastName: form.lastName || profile.lastName,
      phone: form.phone || null,
      bio: form.bio || null,
    }
    : profile

  const university = universityFromEmail(profile.email)
  const verified = profile.verificationStatus === 'VERIFIED' ? 'Verified student' : 'Student'
  const caption = university ? `${university} · ${verified}` : verified

  return (
    <Screen
      keyboardAvoiding
      header={header}
      contentStyle={[styles.content, { paddingBottom: tabBarClearance + space.xxl }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refreshAll}
          tintColor={colors.greenText}
          colors={[colors.green]}
        />
      }
    >
      {showProfilePrompt ? (
        <InkCard title="Make your Zoink profile memorable" body="Add a photo, a short bio, and clean details so people feel good renting from you.">
          <Button label="Got it" variant="secondary" size="sm" onPress={() => go(dismissProfilePrompt)} style={styles.inkAction} />
        </InkCard>
      ) : null}

      <ProfileHeader profile={displayProfile} caption={caption} onAvatarPress={() => go(handlePickAvatar)} avatarBusy={uploading}>
        {!editing ? <Button label="Edit profile" variant="secondary" onPress={() => go(() => setEditing(true))} /> : null}
      </ProfileHeader>

      {editing ? (
        <Card shadow={false} padding={space.xxl} contentStyle={styles.form}>
          <TextField
            label="First name"
            value={form.firstName}
            onChangeText={(value) => setField('firstName', value)}
            placeholder="First name"
            maxLength={50}
            error={formErrors.firstName}
          />
          <TextField
            label="Last name"
            value={form.lastName}
            onChangeText={(value) => setField('lastName', value)}
            placeholder="Last name"
            maxLength={50}
            error={formErrors.lastName}
          />
          <TextField
            label="Phone"
            value={form.phone}
            onChangeText={(value) => setField('phone', value)}
            placeholder="Optional contact number"
            keyboardType="phone-pad"
          />
          <TextField
            label="Quote or bio"
            value={form.bio}
            onChangeText={(value) => setField('bio', value)}
            placeholder="Add a quick line that feels like you"
            multiline
            maxLength={300}
          />
          <View style={styles.formActions}>
            <Button
              label="Cancel"
              variant="secondary"
              onPress={() => {
                syncForm(profile)
                setFormErrors({})
                setEditing(false)
              }}
              style={styles.flex}
            />
            <Button label="Save" onPress={handleSave} loading={saving} style={styles.flex} />
          </View>
        </Card>
      ) : (
        <>
          <GroupLabel>Details</GroupLabel>
          <RowGroup>
            <ListRow icon="mail" label="Email" value={profile.email} />
            <ListRow icon="phone" label="Phone" value={profile.phone || 'Not set'} />
          </RowGroup>
        </>
      )}

      <GroupLabel>Payouts</GroupLabel>
      {!stripeStatus?.connected ? (
        <Card shadow={false} padding={space.xxl} contentStyle={styles.banner}>
          <Text style={styles.bannerText}>Connect Stripe to start accepting bookings and receive payouts from your rentals.</Text>
          <Button label="Set up payouts" onPress={handleSetupPayouts} loading={saving} />
        </Card>
      ) : stripeStatus.payoutsEnabled ? (
        <Card shadow={false} padding={space.xxl} contentStyle={[styles.successBody, styles.bannerRow]}>
          <Feather name="check-circle" size={20} color={colors.ink} />
          <Text style={styles.bannerTitle}>Ready to accept bookings</Text>
        </Card>
      ) : (
        <Card shadow={false} padding={space.xxl} contentStyle={styles.banner}>
          <Text style={styles.bannerText}>Stripe account under review. Finish any remaining details in Stripe to enable payouts.</Text>
          <Button
            label={stripeStatus.detailsSubmitted ? 'Refresh payout status' : 'Finish payout setup'}
            onPress={stripeStatus.detailsSubmitted ? () => refreshStripeStatus(true) : handleSetupPayouts}
            loading={saving}
          />
        </Card>
      )}

      <GroupLabel>Your Zoink</GroupLabel>
      <RowGroup>
        <ListRow icon="package" label="My listings" onPress={() => go(() => nav.navigate('MyListings'))} />
        <ListRow icon="calendar" label="My bookings" onPress={() => go(() => nav.navigate('BookingHistory'))} />
        <ListRow icon="inbox" label="Requests" onPress={() => go(() => nav.navigate('BookingRequests'))} />
        <ListRow icon="message-square" label="Inbox" onPress={() => go(() => nav.navigate('MainApp', { tab: 'Inbox' }))} />
        <ListRow icon="settings" label="Settings" onPress={() => go(() => nav.navigate('Settings'))} />
      </RowGroup>

      {user?.role === 'ADMIN' ? (
        <>
          <GroupLabel>Admin</GroupLabel>
          <RowGroup>
            <ListRow icon="shield" label="Review disputes" onPress={() => go(() => nav.navigate('AdminDisputes'))} />
            <ListRow icon="flag" label="Review reports" onPress={() => go(() => nav.navigate('AdminReports'))} />
          </RowGroup>
        </>
      ) : null}

      <RowGroup style={styles.dangerGroup}>
        <ListRow icon="log-out" label="Sign out" danger onPress={logout} right={null} />
      </RowGroup>

      {error ? (
        <Card shadow={false} padding={space.xxl} style={styles.problemCard} contentStyle={styles.problem}>
          <Text style={styles.problemText}>{error}</Text>
        </Card>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    gap: space.lg,
  },
  inkAction: {
    alignSelf: 'flex-start',
  },
  form: {
    gap: space.xxl,
  },
  formActions: {
    flexDirection: 'row',
    gap: space.md,
  },
  flex: {
    flex: 1,
  },
  banner: {
    gap: space.lg,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  bannerText: {
    ...type.bodySm,
    color: colors.muted,
  },
  bannerTitle: {
    ...type.bodySm,
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  successBody: {
    backgroundColor: colors.lime,
  },
  dangerGroup: {
    marginTop: space.xxl,
  },
  problemCard: {
    marginTop: space.sm,
  },
  problem: {
    backgroundColor: colors.tan,
  },
  problemText: {
    ...type.bodySm,
    color: colors.danger,
  },
})
