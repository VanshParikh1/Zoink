import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Linking,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as SecureStore from 'expo-secure-store'
import * as Haptics from 'expo-haptics'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import ProfileCard from '../components/ProfileCard'
import { useAuth } from '../context/AuthContext'
import { RootStackParamList } from '../navigation'
import { getMyProfile, updateMyProfile, uploadMyAvatar, getStripeConnectStatus, onboardStripeConnect, StripeConnectStatus } from '../services/usersApi'
import { MyProfile } from '../types'
import { theme } from '../theme/colors'
import ZoinkButton from '../components/ZoinkButton'
import ZoinkFullLogo from '../components/ZoinkFullLogo'
import ScreenBackground from '../components/ScreenBackground'
import DismissKeyboardView from '../components/DismissKeyboardView'

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
  const nav = useNavigation<Nav>()
  const { user, logout } = useAuth()
  const [profile, setProfile] = useState<MyProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [showProfilePrompt, setShowProfilePrompt] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    bio: '',
  })
  const [stripeStatus, setStripeStatus] = useState<StripeConnectStatus | null>(null)

  const syncForm = useCallback((nextProfile: MyProfile) => {
    setForm({
      firstName: nextProfile.firstName,
      lastName: nextProfile.lastName,
      phone: nextProfile.phone ?? '',
      bio: nextProfile.bio ?? '',
    })
  }, [])

  const refreshStripeStatus = useCallback(async () => {
    const status = await getStripeConnectStatus()
    setStripeStatus(status)
  }, [])

  const loadProfile = useCallback(async () => {
    if (!user?.id) return

    try {
      setError('')
      const nextProfile = await getMyProfile(user.id)
      setProfile(nextProfile)
      syncForm(nextProfile)
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not load your profile right now.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }

    try {
      await refreshStripeStatus()
    } catch (err) {
      // Ignore stripe fetch errors quietly
    }
  }, [refreshStripeStatus, syncForm, user?.id])

  useFocusEffect(
    useCallback(() => {
      loadProfile()
    }, [loadProfile])
  )

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

  useEffect(() => {
    if (!user?.id) return

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshStripeStatus().catch(() => {})
      }
    })

    return () => subscription.remove()
  }, [refreshStripeStatus, user?.id])

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
      setProfile((current) => (current ? { ...current, avatarUrl: uploaded.avatarUrl ?? current.avatarUrl } : current))
    } catch (err: any) {
      Alert.alert('Upload failed', err?.response?.data?.error ?? 'Could not update your avatar.')
    } finally {
      setUploading(false)
    }
  }

  async function handleSave() {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      Alert.alert('Missing details', 'First and last name are required.')
      return
    }

    try {
      setSaving(true)
      await updateMyProfile({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim() || undefined,
        bio: form.bio.trim() || undefined,
      })
      await loadProfile()
      setEditing(false)
    } catch (err: any) {
      Alert.alert('Save failed', err?.response?.data?.error ?? 'Could not save your profile.')
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
      Alert.alert('Payouts Error', err?.response?.data?.error ?? 'Could not start payouts setup.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    )
  }

  if (!profile) {
    return (
      <View style={styles.loadingScreen}>
        <Text style={styles.errorText}>{error || 'Profile not found.'}</Text>
      </View>
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

  const initials = `${profile.firstName?.[0] ?? ''}${profile.lastName?.[0] ?? ''}`.toUpperCase() || '?'

  return (
    <DismissKeyboardView>
      <ScreenBackground>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {
          setRefreshing(true)
          loadProfile()
        }} tintColor={theme.primary} colors={[theme.primary]} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerInner}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={styles.headerTitle}>Profile</Text>
              <ZoinkFullLogo width={160} height={48} />
            </View>
          </View>
        </View>

        {showProfilePrompt ? (
          <View style={styles.promptCard}>
            <Text style={styles.promptTitle}>Make your Zoink profile memorable</Text>
            <Text style={styles.promptBody}>
              Add a photo, a short bio, and clean details so people feel good renting from you.
            </Text>
            <TouchableOpacity
              style={styles.promptButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                dismissProfilePrompt()
              }}
            >
              <Text style={styles.promptButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <ProfileCard profile={displayProfile} />

        <View style={styles.panel}>
          <View style={styles.panelHeaderRow}>
            <Text style={styles.panelTitle}>Profile basics</Text>
            {!editing ? (
              <TouchableOpacity
                style={styles.editLink}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                  setEditing(true)
                }}
              >
                <Text style={styles.editLinkText}>Edit</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.avatarSection}>
            <TouchableOpacity
              style={styles.avatarTap}
              activeOpacity={0.8}
              disabled={uploading}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                handlePickAvatar()
              }}
            >
              {profile.avatarUrl ? (
                <Image source={{ uri: profile.avatarUrl }} style={styles.avatarLarge} />
              ) : (
                <View style={styles.avatarLargeFallback}>
                  <Text style={styles.avatarLargeFallbackText}>{initials}</Text>
                </View>
              )}
              <View style={styles.avatarEditBadge}>
                <Text style={styles.avatarEditBadgeText}>✎</Text>
              </View>
            </TouchableOpacity>
            <Text style={styles.avatarHint}>{uploading ? 'Uploading photo…' : 'Tap to change photo'}</Text>
          </View>

          <View style={styles.divider} />

          {editing ? (
            <>
              <Text style={styles.label}>First name</Text>
              <TextInput
                value={form.firstName}
                onChangeText={(value) => setForm((current) => ({ ...current, firstName: value }))}
                style={styles.input}
                placeholder="First name"
                placeholderTextColor={theme.textDisabled}
                maxLength={50}
              />

              <Text style={styles.label}>Last name</Text>
              <TextInput
                value={form.lastName}
                onChangeText={(value) => setForm((current) => ({ ...current, lastName: value }))}
                style={styles.input}
                placeholder="Last name"
                placeholderTextColor={theme.textDisabled}
                maxLength={50}
              />

              <Text style={styles.label}>Phone</Text>
              <TextInput
                value={form.phone}
                onChangeText={(value) => setForm((current) => ({ ...current, phone: value }))}
                style={styles.input}
                placeholder="Optional contact number"
                placeholderTextColor={theme.textDisabled}
                keyboardType="phone-pad"
              />

              <Text style={styles.label}>Quote or bio</Text>
              <TextInput
                value={form.bio}
                onChangeText={(value) => setForm((current) => ({ ...current, bio: value }))}
                style={[styles.input, styles.bioInput]}
                placeholder="Add a quick line that feels like you"
                placeholderTextColor={theme.textDisabled}
                multiline
                maxLength={300}
              />

              <View style={styles.actionPair}>
                <ZoinkButton
                  label="Cancel"
                  variant="inset"
                  onPress={() => {
                    syncForm(profile)
                    setEditing(false)
                  }}
                  style={{ flex: 1 }}
                />
                <ZoinkButton
                  label="Save changes"
                  variant="stamped"
                  onPress={handleSave}
                  isLoading={saving}
                  style={{ flex: 1 }}
                />
              </View>
            </>
          ) : (
            <View>
              <View style={styles.readRow}>
                <Text style={styles.readLabel}>Name</Text>
                <Text style={styles.readValue}>{profile.firstName} {profile.lastName}</Text>
              </View>
              <View style={styles.readRow}>
                <Text style={styles.readLabel}>Phone</Text>
                <Text style={styles.readValue}>{profile.phone || 'Not set'}</Text>
              </View>
              <View style={[styles.readRow, styles.readRowLast]}>
                <Text style={styles.readLabel}>Bio</Text>
                <Text style={styles.readValue}>{profile.bio || 'Not set'}</Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Manage your Zoink account</Text>
          <View style={styles.quickActionRow}>
            <TouchableOpacity
              style={styles.quickActionButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                nav.navigate('MyListings')
              }}
            >
              <Text style={styles.quickActionButtonText}>My listings</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickActionButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                nav.navigate('BookingHistory')
              }}
            >
              <Text style={styles.quickActionButtonText}>My bookings</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.quickActionRow}>
            <TouchableOpacity
              style={styles.quickActionButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                nav.navigate('BookingRequests')
              }}
            >
              <Text style={styles.quickActionButtonText}>Requests</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickActionButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                nav.navigate('MainApp', { tab: 'Inbox' })
              }}
            >
              <Text style={styles.quickActionButtonText}>Inbox</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.quickActionRow}>
            <TouchableOpacity
              style={styles.quickActionButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                nav.navigate('Settings')
              }}
            >
              <Text style={styles.quickActionButtonText}>Settings</Text>
            </TouchableOpacity>
          </View>
        </View>

        {user?.role === 'ADMIN' ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Admin</Text>
            <View style={styles.quickActionRow}>
              <TouchableOpacity
                style={styles.quickActionButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                  nav.navigate('AdminDisputes')
                }}
              >
                <Text style={styles.quickActionButtonText}>Review disputes</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickActionButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                  nav.navigate('AdminReports')
                }}
              >
                <Text style={styles.quickActionButtonText}>Review reports</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Payouts</Text>
          {!stripeStatus?.connected ? (
            <>
              <Text style={styles.note}>
                Connect Stripe to start accepting bookings and receive payouts from your rentals.
              </Text>
              <ZoinkButton
                label="Set up payouts"
                variant="stamped"
                onPress={handleSetupPayouts}
                isLoading={saving}
              />
            </>
          ) : stripeStatus.payoutsEnabled ? (
            <View style={styles.stripeStatusRow}>
              <View style={styles.stripeStatusIcon}>
                <Text style={styles.stripeStatusIconText}>✓</Text>
              </View>
              <Text style={styles.stripeReadyText}>Ready to accept bookings</Text>
            </View>
          ) : (
            <>
              <Text style={styles.note}>
                Stripe account under review. Finish any remaining details in Stripe to enable payouts.
              </Text>
              <ZoinkButton
                label={stripeStatus.detailsSubmitted ? 'Refresh payout status' : 'Finish payout setup'}
                variant="stamped"
                onPress={stripeStatus.detailsSubmitted ? refreshStripeStatus : handleSetupPayouts}
                isLoading={saving}
              />
            </>
          )}
        </View>

        <ZoinkButton
          label="Sign out"
          variant="danger"
          onPress={logout}
          style={{ marginTop: 4 }}
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </ScrollView>
      </KeyboardAvoidingView>
      </ScreenBackground>
    </DismissKeyboardView>
  )
}

const styles = StyleSheet.create({
  header: {
    paddingTop: theme.header.tabTop,
    paddingBottom: 16,
    zIndex: 10,
  },
  headerInner: {
    paddingHorizontal: 24,
  },
  headerTitle: {
    ...theme.type.screenTitle,
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  container: { flex: 1 },
  content: { paddingHorizontal: 18, paddingBottom: 140 },
  loadingScreen: {
    flex: 1,
    backgroundColor: theme.screen,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  promptCard: {
    backgroundColor: theme.primarySurface,
    borderRadius: theme.radius.md,
    padding: 18,
    marginBottom: 16,
    borderWidth: theme.hard.border,
    borderColor: theme.hard.ink,
  },
  promptTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
  },
  promptBody: {
    color: theme.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 14,
  },
  promptButton: {
    alignSelf: 'flex-start',
    backgroundColor: theme.primary,
    borderRadius: theme.radius.sm,
    borderWidth: theme.hard.borderThin,
    borderColor: theme.hard.ink,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  promptButtonText: {
    color: theme.textOnPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  actionPair: { flexDirection: 'row', gap: 10, marginTop: 18 },
  panel: {
    backgroundColor: theme.primarySurface,
    borderRadius: theme.radius.md,
    padding: 18,
    marginTop: 14,
    borderWidth: theme.hard.border,
    borderColor: theme.hard.ink,
  },
  panelHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  panelTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '900',
  },
  editLink: {
    backgroundColor: theme.primary,
    borderRadius: theme.radius.pill,
    borderWidth: theme.hard.borderThin,
    borderColor: theme.hard.ink,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  editLinkText: {
    color: theme.textOnPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 4,
  },
  avatarTap: {
    position: 'relative',
  },
  avatarLarge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: theme.hard.border,
    borderColor: theme.hard.ink,
  },
  avatarLargeFallback: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.hard.border,
    borderColor: theme.hard.ink,
  },
  avatarLargeFallbackText: {
    color: theme.textOnPrimary,
    fontSize: 28,
    fontWeight: '900',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.hard.ink,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.hard.borderThin,
    borderColor: theme.hard.ink,
  },
  avatarEditBadgeText: {
    color: theme.primary,
    fontSize: 13,
  },
  avatarHint: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 10,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(78, 168, 34, 0.28)',
    marginVertical: 18,
  },
  label: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
    marginTop: 6,
  },
  input: {
    backgroundColor: theme.surface,
    borderWidth: theme.hard.borderThin,
    borderColor: theme.hard.ink,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: theme.text,
    fontSize: 15,
  },
  bioInput: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
  readRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(78, 168, 34, 0.28)',
  },
  readRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  readLabel: {
    color: theme.primaryDeep,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  readValue: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
  },
  quickActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  quickActionButton: {
    flex: 1,
    backgroundColor: theme.surface,
    borderRadius: theme.radius.sm,
    borderWidth: theme.hard.borderThin,
    borderColor: theme.hard.ink,
    paddingVertical: 14,
    alignItems: 'center',
  },
  quickActionButtonText: {
    color: theme.primaryDeep,
    fontSize: 14,
    fontWeight: '800',
  },
  note: {
    color: theme.textMuted,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 10,
  },
  stripeStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stripeStatusIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.hard.borderThin,
    borderColor: theme.hard.ink,
  },
  stripeStatusIconText: {
    color: theme.textOnPrimary,
    fontSize: 15,
    fontWeight: '900',
  },
  stripeReadyText: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '900',
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 14,
  },
})
