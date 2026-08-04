import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import ScreenBackground from '../components/ScreenBackground'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import ProfileCard from '../components/ProfileCard'
import { RootStackParamList } from '../navigation'
import { getPublicProfile } from '../services/usersApi'
import { useAuth } from '../context/AuthContext'
import { PublicProfile } from '../types'
import { theme } from '../theme/colors'

type Nav = NativeStackNavigationProp<RootStackParamList>
type ScreenRoute = RouteProp<RootStackParamList, 'PublicProfile'>

export default function PublicProfileScreen() {
  const nav = useNavigation<Nav>()
  const route = useRoute<ScreenRoute>()
  const { user } = useAuth()
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async () => {
    try {
      const data = await getPublicProfile(route.params.userId)
      setProfile(data)
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not load this profile.')
      nav.goBack()
    } finally {
      setLoading(false)
    }
  }, [nav, route.params.userId])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    )
  }

  if (!profile) return null

  const isSelf = profile.id === user?.id

  return (
    <ScreenBackground>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <ProfileCard profile={profile} />

        {!isSelf && (
          <TouchableOpacity
            style={styles.reportLink}
            onPress={() =>
              nav.navigate('FileReport', {
                targetType: 'USER',
                targetId: profile.id,
                targetLabel: `${profile.firstName} ${profile.lastName}`,
              })
            }
          >
            <Text style={styles.reportLinkText}>Report this user</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </ScreenBackground>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 18, paddingTop: theme.header.stackTop, paddingBottom: 32 },
  loadingScreen: {
    flex: 1,
    backgroundColor: theme.screen,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: theme.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 16,
  },
  backButtonText: {
    color: theme.text,
    fontWeight: '800',
  },
  eyebrow: {
    color: theme.primary,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  title: {
    ...theme.type.screenTitle,
  },
  subtitle: {
    color: theme.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
    marginBottom: 18,
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
    marginBottom: 12,
  },
  note: {
    color: theme.textMuted,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 10,
  },
  reportLink: {
    alignSelf: 'center',
    marginTop: 20,
    paddingVertical: 8,
  },
  reportLinkText: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
})
