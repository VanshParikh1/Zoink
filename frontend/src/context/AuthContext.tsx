
import React, { createContext, useContext, useEffect, useState } from 'react'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import api from '../services/api'
import { DEMO_MODE, DEMO_TOKEN, DEMO_USER } from '../config/demoMode'

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
}

type AuthContextType = {
  user: User | null
  token: string | null
  isLoading: boolean
  register: (email: string, password: string, firstName: string, lastName: string) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  setVerified: (newToken: string) => void
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

  async function register(email: string, password: string, firstName: string, lastName: string) {
    if (DEMO_MODE) {
      await saveSession(DEMO_TOKEN, {
        ...DEMO_USER,
        email: email.trim().toLowerCase(),
        firstName: firstName.trim() || DEMO_USER.firstName,
      })
      return
    }

    const res = await api.post('/auth/register', { email, password, firstName, lastName })
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

  async function saveSession(newToken: string, newUser: User) {
    await setTokenAsync(TOKEN_KEY, newToken)
    api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`
    setToken(newToken)
    setUser(newUser)
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, register, login, logout, setVerified }}>
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
  }
}
