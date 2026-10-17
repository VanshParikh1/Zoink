import axios from 'axios'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import { DEMO_MODE } from '../config/demoMode'

const TOKEN_KEY = 'zoink_jwt'
const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000'

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    // Do NOT set a global Content-Type here — axios will set it correctly
    // per-request (application/json for objects, multipart/form-data with
    // the correct boundary for FormData). A global override breaks file uploads.
    'ngrok-skip-browser-warning': 'true',
  },
})

// The session token is read from secure storage once, then kept in memory.
// Reading the Keychain/Keystore on every request (an open chat alone makes a
// request every few seconds) was needless I/O. AuthContext keeps this in sync
// on login/verify/terms acceptance/logout via setApiToken.
let cachedToken: string | null | undefined // undefined = not loaded yet

export function setApiToken(token: string | null) {
  cachedToken = token
}

async function currentToken(): Promise<string | null> {
  if (cachedToken === undefined) {
    cachedToken =
      Platform.OS === 'web'
        ? localStorage.getItem(TOKEN_KEY)
        : await SecureStore.getItemAsync(TOKEN_KEY)
  }
  return cachedToken
}

// Demo mode runs entirely on the mock services and must never reach a real
// backend. Anything that slips past them is refused here, loudly.
if (DEMO_MODE) {
  api.interceptors.request.use((config) => {
    const message = `Demo mode blocked a backend request: ${config.method?.toUpperCase()} ${config.url}`
    console.warn(message)
    return Promise.reject(new Error(message))
  })
}

api.interceptors.request.use(async (config) => {
  const token = await currentToken()

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  } else {
    delete config.headers.Authorization
  }

  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      cachedToken = null
      if (Platform.OS === 'web') {
        localStorage.removeItem(TOKEN_KEY)
      } else {
        await SecureStore.deleteItemAsync(TOKEN_KEY)
      }
    }

    return Promise.reject(error)
  }
)

export default api
