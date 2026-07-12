import React, { useState } from 'react'
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { initiateHandoff, uploadHandoffPhotoImage } from '../services/bookingsApi'
import { theme } from '../theme/colors'

type Nav = NativeStackNavigationProp<RootStackParamList>
type ScreenRoute = RouteProp<RootStackParamList, 'HandoffPhoto'>

export default function HandoffPhotoScreen() {
  const nav = useNavigation<Nav>()
  const route = useRoute<ScreenRoute>()
  const { bookingId, mode } = route.params
  const [uris, setUris] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const isValid = uris.length === 2 || uris.length === 3

  async function choosePhotos() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow access to your photo library.')
        return
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: 3,
        quality: 0.82,
      })

      if (result.canceled) return
      setUris(result.assets.map((asset) => asset.uri).slice(0, 3))
    } catch {
      Alert.alert('Photo picker error', 'Could not open your photo library right now.')
    }
  }

  async function submit() {
    if (!isValid) return

    setBusy(true)
    try {
      const uploaded = await Promise.all(uris.map((uri) => uploadHandoffPhotoImage(bookingId, uri)))
      await initiateHandoff(bookingId, mode, uploaded)
      nav.replace('ZoinkIt', { bookingId, mode })
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not submit handoff photos.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => nav.goBack()} disabled={busy}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>{mode === 'pickup' ? 'Document the Item' : 'Document the Return'}</Text>

        <TouchableOpacity style={styles.uploadArea} onPress={choosePhotos} disabled={busy}>
          <Text style={styles.uploadText}>{uris.length ? 'Change photos' : 'Select photos'}</Text>
          <Text style={styles.uploadSubtext}>{uris.length}/3 selected</Text>
        </TouchableOpacity>

        {uris.length > 0 ? (
          <View style={styles.thumbnailRow}>
            {uris.map((uri) => (
              <Image key={uri} source={{ uri }} style={styles.thumbnail} />
            ))}
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.submitButton, (!isValid || busy) && styles.submitButtonDisabled]}
          onPress={submit}
          disabled={!isValid || busy}
        >
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>Submit</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { flexGrow: 1, padding: 24, paddingTop: 64, gap: 18 },
  backText: { color: theme.textMuted, fontSize: 14, fontWeight: '700', marginBottom: 10 },
  title: { color: '#111114', fontSize: 28, fontWeight: '900' },
  uploadArea: {
    minHeight: 180,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#111114',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
  },
  uploadText: { color: '#111114', fontSize: 16, fontWeight: '900' },
  uploadSubtext: { color: theme.textMuted, fontSize: 14, fontWeight: '700' },
  thumbnailRow: { flexDirection: 'row', gap: 10 },
  thumbnail: { width: 96, height: 96, borderRadius: 8, backgroundColor: theme.surfaceSubdued },
  submitButton: {
    minHeight: 54,
    borderRadius: 8,
    backgroundColor: '#111114',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 'auto',
  },
  submitButtonDisabled: { backgroundColor: '#E0E0E0' },
  submitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
})
