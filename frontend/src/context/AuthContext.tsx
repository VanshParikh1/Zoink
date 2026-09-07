
import React, { createContext, useContext, useEffect, useState } from 'react'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import api from '../services/api'
import { DEMO_MODE, DEMO_TOKEN, DEMO_USER } from '../config/demoMode'
import { clearPushToken, syncPushToken } from '../services/pushNotifications'
import type { University } from '@zoink/shared'

const TOKEN_KEY = 'zoink_jwt'

async function setTokenAsync(key: string, value: string) {
  if (Platform.OS === 'web') {
    return localStorage.setItem(key, value)
  }
  return await SecureStore.setItemAsync(key, value)
}

async function getTokenAsync(key: string) {
  if (Platform.OS === 'web') {
    return localStorage.getItem(key)
  }
  return await SecureStore.getItemAsync(key)
}

async function deleteTokenAsync(key: string) {
  if (Platform.OS === 'web') {
    return localStorage.removeItem(key)
  }
  return await SecureStore.deleteItemAsync(key)
}

type User = {
  id: string
  email: string
  firstName: string
  verificationStatus: 'PENDING' | 'SUBMITTED' | 'VERIFIED' | 'FAILED'
  role: 'USER' | 'ADMIN'
  termsVersion: string | null
  privacyVersion: string | null
}

type AuthContextType = {
  user: User | null
  token: string | null
  isLoading: boolean
  register: (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    phone: string,
    university: University,
    acceptedTermsVersion: string,
    acceptedPrivacyVersion: string,
    ageAttested: boolean
  ) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  setVerified: (newToken: string) => void
  acceptTerms: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // On app launch, check if a token is already stored
  useEffect(() => {
    async function loadToken() {
      try {
        const stored = await getTokenAsync(TOKEN_KEY)
        if (stored) {
          const payload = DEMO_MODE && stored === DEMO_TOKEN ? DEMO_USER : parseJWT(stored)
          setToken(stored)
          setUser(payload)
          api.defaults.headers.common['Authorization'] = `Bearer ${stored}`
        }
      } catch (e) {
        console.error('Failed to load token', e)
      } finally {
        setIsLoading(false)
      }
    }
    loadToken()
  }, [])

  useEffect(() => {
    if (!token || !user || user.verificationStatus !== 'VERIFIED' || DEMO_MODE) {
      return
    }

    syncPushToken().catch((error) => {
      console.warn('Failed to sync push token', error)
    })
  }, [token, user])

  async function register(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    phone: string,
    university: University,
    acceptedTermsVersion: string,
    acceptedPrivacyVersion: string,
    ageAttested: boolean
  ) {
    if (DEMO_MODE) {
      await saveSession(DEMO_TOKEN, {
        ...DEMO_USER,
        email: email.trim().toLowerCase(),
        firstName: firstName.trim() || DEMO_USER.firstName,
      })
      return
    }

    const res = await api.post('/auth/register', {
      email,
      password,
      firstName,
      lastName,
      phone,
      university,
      acceptedTermsVersion,
      acceptedPrivacyVersion,
      ageAttested,
    })
    await saveSession(res.data.token, res.data.user)
  }

  async function login(email: string, password: string) {
    if (DEMO_MODE) {
      await saveSession(DEMO_TOKEN, {
        ...DEMO_USER,
        email: email.trim().toLowerCase() || DEMO_USER.email,
      })
      return
    }

    const res = await api.post('/auth/login', { email, password })
    await saveSession(res.data.token, res.data.user)
  }

  async function logout() {
    if (!DEMO_MODE && token) {
      await clearPushToken()
    }
    await deleteTokenAsync(TOKEN_KEY)
    delete api.defaults.headers.common['Authorization']
    setToken(null)
    setUser(null)
  }

  // Called after OTP verification — swaps in the new VERIFIED token
  function setVerified(newToken: string) {
    const payload = DEMO_MODE && newToken === DEMO_TOKEN ? DEMO_USER : parseJWT(newToken)
    setToken(newToken)
    setUser(payload)
    setTokenAsync(TOKEN_KEY, newToken)
    api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`
  }

  // Called from the re-acceptance gate (TermsAcceptanceScreen, mode 'update')
  // — stamps the current terms/privacy versions server-side and swaps in the
  // fresh token so the gate in Navigation() clears immediately.
  async function acceptTerms() {
    if (DEMO_MODE) {
      await saveSession(DEMO_TOKEN, { ...DEMO_USER, ...user })
      return
    }

    const res = await api.post('/users/me/accept-terms')
    await saveSession(res.data.token, res.data.user)
  }

  // `newUser` is only used in DEMO_MODE, where there's no real JWT to decode.
  // For a real session the user is derived from the token itself — the
  // /auth and /users responses only carry a subset of the claims (they omit
  // termsVersion/privacyVersion), and trusting that subset left `user`
  // missing fields the navigation gates check, stranding the client on the
  // terms screen until an app reload re-decoded the token.
  async function saveSession(newToken: string, newUser: User) {
    await setTokenAsync(TOKEN_KEY, newToken)
    api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`
    const resolvedUser = DEMO_MODE && newToken === DEMO_TOKEN ? newUser : parseJWT(newToken)
    setToken(newToken)
    setUser(resolvedUser)
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, register, login, logout, setVerified, acceptTerms }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

// Decode JWT payload without a library — JWTs are just base64 encoded JSON
function parseJWT(token: string): User {
  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
  const json = JSON.parse(atob(base64))
  return {
    id: json.userId,
    email: json.email ?? '',
    firstName: json.firstName ?? '',
    verificationStatus: json.verificationStatus,
    role: json.role === 'ADMIN' ? 'ADMIN' : 'USER',
    termsVersion: json.termsVersion ?? null,
    privacyVersion: json.privacyVersion ?? null,
  }
}
