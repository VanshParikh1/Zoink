import api from './api'
import { DEMO_MODE } from '../config/demoMode'
import { MyProfile, PublicProfile } from '../types'
import {
  mockGetMyProfile,
  mockGetPublicProfile,
  mockUpdateMyProfile,
  mockUploadMyAvatar,
} from './mockProfiles'

export type UpdateMyProfilePayload = {
  firstName?: string
  lastName?: string
  phone?: string
  bio?: string
}

export async function getMyProfile(userId: string): Promise<MyProfile> {
  if (DEMO_MODE) return mockGetMyProfile()

  const [meRes, publicRes] = await Promise.all([api.get('/users/me'), api.get(`/users/${userId}`)])

  return {
    ...publicRes.data,
    email: meRes.data.email,
    phone: meRes.data.phone,
  }
}

export async function getPublicProfile(userId: string): Promise<PublicProfile> {
  if (DEMO_MODE) return mockGetPublicProfile(userId)

  const res = await api.get(`/users/${userId}`)
  return res.data
}

export async function updateMyProfile(data: UpdateMyProfilePayload): Promise<MyProfile> {
  if (DEMO_MODE) return mockUpdateMyProfile(data)

  const res = await api.patch('/users/me', data)
  return res.data
}

export async function uploadMyAvatar(uri: string): Promise<{ id: string; avatarUrl?: string }> {
  if (DEMO_MODE) return mockUploadMyAvatar(uri)

  const formData = new FormData()
  formData.append('avatar', {
    uri,
    name: 'avatar.jpg',
    type: 'image/jpeg',
  } as any)

  const res = await api.post('/users/me/avatar', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })

  return res.data
}

export async function updateMyPushToken(expoPushToken: string | null): Promise<{ id: string; expoPushToken?: string | null }> {
  if (DEMO_MODE) return { id: 'demo-user-1', expoPushToken }

  const res = await api.patch('/users/me/push-token', { expoPushToken })
  return res.data
}
