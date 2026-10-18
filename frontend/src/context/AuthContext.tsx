
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import * as SecureStore from 'expo-secure-store'
import { Alert, Platform } from 'react-native'
import api, { setApiToken, setSessionEndedHandler } from '../services/api'
import { decodeJwtPayload, isJwtExpired } from '../services/sessionToken'
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
          const payload = DEMO_MODE && stored === DEMO_TOKEN ? DEMO_USER : tryParseJWT(stored)
          if (!payload) {
            // e.g. a demo-mode token left behind after switching demo mode off,
            // or a session past its expiry. Drop it and start signed out
            // instead of opening the app "signed in" with every request failing.
            console.warn('Stored session token is unusable or expired; clearing it')
            await deleteTokenAsync(TOKEN_KEY)
            setApiToken(null)
            return
          }
          setApiToken(stored)
          setToken(stored)
          setUser(payload)
          api.defaults.headers.common['Authorization'] = `Bearer ${stored}`
        } else {
          setApiToken(null)
        }
      } catch (e) {
        console.error('Failed to load token', e)
      } finally {
        setIsLoading(false)
      }
    }
    loadToken()
  }, [])

  // The server stopped accepting the session mid-use (token expired, account
  // deleted): api.ts has already dropped the stored token; sign out here so
  // navigation goes back to Login, and say why once.
  useEffect(() => {
    setSessionEndedHandler(() => {
      delete api.defaults.headers.common['Authorization']
      setToken(null)
      setUser(null)
      Alert.alert('Signed out', 'Your session has ended. Please log in again.')
    })
    return () => setSessionEndedHandler(null)
  }, [])

  useEffect(() => {
    if (!token || !user || user.verificationStatus !== 'VERIFIED' || DEMO_MODE) {
      return
    }

    syncPushToken().catch((error) => {
      console.warn('Failed to sync push token', error)
    })
  }, [token, user])

  // `newUser` is only used in DEMO_MODE, where there's no real JWT to decode.
  // For a real session the user is derived from the token itself — the
  // /auth and /users responses only carry a subset of the claims (they omit
  // termsVersion/privacyVersion), and trusting that subset left `user`
  // missing fields the navigation gates check, stranding the client on the
  // terms screen until an app reload re-decoded the token.
  const saveSession = useCallback(async (newToken: string, newUser: User) => {
    await setTokenAsync(TOKEN_KEY, newToken)
    setApiToken(newToken)
    api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`
    const resolvedUser = DEMO_MODE && newToken === DEMO_TOKEN ? newUser : parseJWT(newToken)
    setToken(newToken)
    setUser(resolvedUser)
  }, [])

  const register = useCallback(async (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    phone: string,
    university: University,
    acceptedTermsVersion: string,
    acceptedPrivacyVersion: string,
    ageAttested: boolean
  ) => {
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
  }, [saveSession])

  const login = useCallback(async (email: string, password: string) => {
    if (DEMO_MODE) {
      await saveSession(DEMO_TOKEN, {
        ...DEMO_USER,
        email: email.trim().toLowerCase() || DEMO_USER.email,
      })
      return
    }

    const res = await api.post('/auth/login', { email, password })
    await saveSession(res.data.token, res.data.user)
  }, [saveSession])

  const logout = useCallback(async () => {
    if (!DEMO_MODE && token) {
      await clearPushToken()
    }
    await deleteTokenAsync(TOKEN_KEY)
    setApiToken(null)
    delete api.defaults.headers.common['Authorization']
    setToken(null)
    setUser(null)
  }, [token])

  // Called after OTP verification — swaps in the new VERIFIED token
  const setVerified = useCallback((newToken: string) => {
    const payload = DEMO_MODE && newToken === DEMO_TOKEN ? DEMO_USER : parseJWT(newToken)
    setToken(newToken)
    setUser(payload)
    setTokenAsync(TOKEN_KEY, newToken)
    setApiToken(newToken)
    api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`
  }, [])

  // Called from the re-acceptance gate (TermsAcceptanceScreen, mode 'update')
  // — stamps the current terms/privacy versions server-side and swaps in the
  // fresh token so the gate in Navigation() clears immediately.
  const acceptTerms = useCallback(async () => {
    if (DEMO_MODE) {
      await saveSession(DEMO_TOKEN, { ...DEMO_USER, ...user })
      return
    }

    const res = await api.post('/users/me/accept-terms')
    await saveSession(res.data.token, res.data.user)
  }, [saveSession, user])

  // Stable unless auth state actually changes, so every useAuth() consumer
  // isn't re-rendered whenever the provider renders.
  const value = useMemo(
    () => ({ user, token, isLoading, register, login, logout, setVerified, acceptTerms }),
    [user, token, isLoading, register, login, logout, setVerified, acceptTerms]
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

// null when the token isn't a decodable JWT or has expired.
function tryParseJWT(token: string): User | null {
  const json = decodeJwtPayload(token)
  if (!json || isJwtExpired(json)) return null
  return toUser(json)
}

// Decode JWT payload without a library — JWTs are just base64 encoded JSON
function parseJWT(token: string): User {
  const json = decodeJwtPayload(token)
  if (!json) throw new Error('Session token could not be decoded')
  return toUser(json)
}

function toUser(json: Record<string, any>): User {
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
