import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as SecureStore from 'expo-secure-store'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import ProfileCard from '../components/ProfileCard'
import { useAuth } from '../context/AuthContext'
import { RootStackParamList } from '../navigation'
import { getMyProfile, updateMyProfile, uploadMyAvatar } from '../services/usersApi'
import { MyProfile } from '../types'
import { theme } from '../theme/colors'

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

  const syncForm = useCallback((nextProfile: MyProfile) => {
    setForm({
      firstName: nextProfile.firstName,
      lastName: nextProfile.lastName,
      phone: nextProfile.phone ?? '',
      bio: nextProfile.bio ?? '',
    })
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
  }, [syncForm, user?.id])

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
      setProfile((current) => (current ? { ...current, avatarUrl: uploaded.avatarUrl } : current))
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
        phone: form.phone || undefined,
        bio: form.bio || undefined,
      }
    : profile

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {
        setRefreshing(true)
        loadProfile()
      }} tintColor={theme.primary} colors={[theme.primary]} />}
      showsVerticalScrollIndicator={false}
    >
      {showProfilePrompt ? (
        <View style={styles.promptCard}>
          <Text style={styles.promptEyebrow}>ONE-TIME TIP</Text>
          <Text style={styles.promptTitle}>Make your Zoink profile memorable</Text>
          <Text style={styles.promptBody}>
            This card is the first impression. Add a photo, a short bio, and clean details so people feel good renting from you.
          </Text>
          <TouchableOpacity style={styles.promptButton} onPress={dismissProfilePrompt}>
            <Text style={styles.promptButtonText}>Got it</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <ProfileCard profile={displayProfile} />

      <View style={styles.avatarRow}>
        {profile.avatarUrl ? <Image source={{ uri: profile.avatarUrl }} style={styles.avatarThumb} /> : <View style={styles.avatarThumbFallback} />}
        <TouchableOpacity style={styles.avatarButton} onPress={handlePickAvatar} disabled={uploading}>
          <Text style={styles.avatarButtonText}>{uploading ? 'Uploading photo...' : 'Change photo'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.actions}>
        {!editing ? (
          <TouchableOpacity style={styles.primaryButton} onPress={() => setEditing(true)}>
            <Text style={styles.primaryButtonText}>Edit profile details</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.actionPair}>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => {
              syncForm(profile)
              setEditing(false)
            }}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButton} onPress={handleSave} disabled={saving}>
              <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Save changes'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.quickActionsPanel}>
        <Text style={styles.panelTitle}>Manage your Zoink account</Text>
        <View style={styles.quickActionRow}>
          <TouchableOpacity style={styles.quickActionButton} onPress={() => nav.navigate('MyListings')}>
            <Text style={styles.quickActionButtonText}>My listings</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickActionButton} onPress={() => nav.navigate('BookingHistory')}>
            <Text style={styles.quickActionButtonText}>My bookings</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.quickActionRow}>
          <TouchableOpacity style={styles.quickActionButton} onPress={() => nav.navigate('BookingRequests')}>
            <Text style={styles.quickActionButtonText}>Requests</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickActionButton} onPress={() => nav.navigate('MainApp', { tab: 'Inbox' })}>
            <Text style={styles.quickActionButtonText}>Inbox</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Profile basics</Text>

        <Text style={styles.label}>First name</Text>
        <TextInput
          value={form.firstName}
          onChangeText={(value) => setForm((current) => ({ ...current, firstName: value }))}
          editable={editing}
          style={[styles.input, !editing && styles.inputDisabled]}
          placeholder="First name"
          placeholderTextColor={theme.textFaint}
        />

        <Text style={styles.label}>Last name</Text>
        <TextInput
          value={form.lastName}
          onChangeText={(value) => setForm((current) => ({ ...current, lastName: value }))}
          editable={editing}
          style={[styles.input, !editing && styles.inputDisabled]}
          placeholder="Last name"
          placeholderTextColor={theme.textFaint}
        />

        <Text style={styles.label}>Phone</Text>
        <TextInput
          value={form.phone}
          onChangeText={(value) => setForm((current) => ({ ...current, phone: value }))}
          editable={editing}
          style={[styles.input, !editing && styles.inputDisabled]}
          placeholder="Optional contact number"
          placeholderTextColor={theme.textFaint}
          keyboardType="phone-pad"
        />

        <Text style={styles.label}>Quote or bio</Text>
        <TextInput
          value={form.bio}
          onChangeText={(value) => setForm((current) => ({ ...current, bio: value }))}
          editable={editing}
          style={[styles.input, styles.bioInput, !editing && styles.inputDisabled]}
          placeholder="Add a quick line that feels like you"
          placeholderTextColor={theme.textFaint}
          multiline
        />
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Why this card works</Text>
        <Text style={styles.note}>Your photo and quote set the vibe before anyone opens a chat.</Text>
        <Text style={styles.note}>The two rating tracks show what kind of owner and borrower you are.</Text>
        <Text style={styles.note}>Badges can grow naturally as more Week 8 reviews come in.</Text>
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={logout}>
        <Text style={styles.signOutButtonText}>Sign out</Text>
      </TouchableOpacity>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 18, paddingTop: 56, paddingBottom: 140 },
  loadingScreen: {
    flex: 1,
    backgroundColor: theme.screen,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  promptCard: {
    backgroundColor: theme.surface,
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  promptEyebrow: {
    color: theme.primary,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  promptTitle: {
    color: theme.text,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 30,
  },
  promptBody: {
    color: theme.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
    marginBottom: 14,
  },
  promptButton: {
    alignSelf: 'flex-start',
    backgroundColor: theme.primary,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  promptButtonText: {
    color: theme.primaryText,
    fontSize: 14,
    fontWeight: '900',
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 16,
    marginBottom: 12,
  },
  avatarThumb: {
    width: 52,
    height: 52,
    borderRadius: 16,
  },
  avatarThumbFallback: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: theme.surfaceSoft,
  },
  avatarButton: {
    backgroundColor: theme.colors.inkBase,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
  avatarButtonText: {
    color: theme.primary,
    fontWeight: '900',
    fontSize: 14,
  },
  actions: { marginBottom: 14 },
  actionPair: { flexDirection: 'row', gap: 10 },
  quickActionsPanel: {
    backgroundColor: theme.surface,
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  quickActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  quickActionButton: {
    flex: 1,
    backgroundColor: theme.screen,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: 14,
    alignItems: 'center',
  },
  quickActionButtonText: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '800',
  },
  primaryButton: {
    flex: 1,
    backgroundColor: theme.primary,
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: theme.primaryText,
    fontSize: 15,
    fontWeight: '900',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: theme.surface,
    paddingVertical: 15,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '800',
  },
  panel: {
    backgroundColor: theme.surface,
    borderRadius: 24,
    padding: 18,
    marginTop: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  panelTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 14,
  },
  label: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
    marginTop: 6,
  },
  input: {
    backgroundColor: theme.screen,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: theme.text,
    fontSize: 15,
  },
  inputDisabled: {
    opacity: 0.72,
  },
  bioInput: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
  note: {
    color: theme.textMuted,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 10,
  },
  signOutButton: {
    marginTop: 18,
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.28)',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
  },
  signOutButtonText: {
    color: theme.colors.danger,
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
