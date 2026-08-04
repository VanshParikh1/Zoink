import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Alert,
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import * as ImagePicker from 'expo-image-picker'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { Booking } from '../types'
import { confirmHandoff, getBooking, initiateHandoff, uploadHandoffPhotoImage } from '../services/bookingsApi'
import { useAuth } from '../context/AuthContext'
import { theme } from '../theme/colors'

type Nav = NativeStackNavigationProp<RootStackParamList>
type ScreenRoute = RouteProp<RootStackParamList, 'ZoinkIt'>

const TIMEOUT_MS = 5 * 60 * 1000
const BUTTON_SIZE = 200
const RIPPLE_SIZE = Math.max(Dimensions.get('window').width, Dimensions.get('window').height) * 1.4

export default function ZoinkItScreen() {
  const nav = useNavigation<Nav>()
  const route = useRoute<ScreenRoute>()
  const { user } = useAuth()
  const { bookingId, mode } = route.params
  const [booking, setBooking] = useState<Booking | null>(null)
  const [pressed, setPressed] = useState(false)
  const [success, setSuccess] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const pulse = useRef(new Animated.Value(0)).current
  const ripple = useRef(new Animated.Value(0)).current
  const statusOpacity = useRef(new Animated.Value(1)).current
  const successHandled = useRef(false)

  // Photo picking/editing — merged in from what used to be a separate HandoffPhotoScreen.
  const [pickerUris, setPickerUris] = useState<string[]>([])
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const pendingStatus = mode === 'pickup' ? 'PICKUP_PENDING' : 'RETURN_PENDING'
  const startStatus = mode === 'pickup' ? 'ACCEPTED' : 'ACTIVE'
  const isOwner = booking?.ownerId === user?.id
  const isRenter = booking?.renterId === user?.id
  const isUploader = mode === 'pickup' ? isOwner : isRenter
  const isDocumented = booking?.status === pendingStatus
  const isReady = isDocumented
  const locked = !isReady || pressed || success
  const existingPhotos = booking ? (mode === 'pickup' ? booking.pickupPhotos : booking.returnPhotos) ?? [] : []
  const needsFirstSubmission = isUploader && booking?.status === startStatus
  const showPickerUI = needsFirstSubmission || editing
  const isPickerValid = pickerUris.length === 2 || pickerUris.length === 3
  const otherParty = booking
    ? booking.ownerId === user?.id
      ? booking.renter
      : booking.owner
    : null
  const otherName = otherParty?.firstName ?? 'other party'

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const next = await getBooking(bookingId)
        if (active) setBooking(next)
      } catch (err: any) {
        if (active) Alert.alert('Error', err?.response?.data?.error ?? 'Could not load this booking.')
      }
    }

    load()
    const id = setInterval(load, 3000)
    return () => {
      active = false
      clearInterval(id)
    }
  }, [bookingId])

  useEffect(() => {
    if (!isReady || success) {
      pulse.stopAnimation()
      pulse.setValue(0)
      return
    }

    const duration = pressed ? 850 : 1600
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    )
    animation.start()
    return () => animation.stop()
  }, [isReady, pressed, pulse, success])

  useEffect(() => {
    if (pressed && !success) {
      Animated.sequence([
        Animated.timing(statusOpacity, { toValue: 0, duration: 140, useNativeDriver: true }),
        Animated.timing(statusOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      ]).start()
    }
  }, [pressed, statusOpacity, success])

  const handleSuccess = useCallback(async (nextBooking: Booking) => {
    if (successHandled.current) return
    successHandled.current = true
    setBooking(nextBooking)
    setSuccess(true)
    Animated.timing(ripple, { toValue: 1, duration: 850, useNativeDriver: true }).start()
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    setTimeout(() => {
      nav.replace(mode === 'pickup' ? 'ActiveRental' : 'BookingDetail', { bookingId })
    }, 1500)
  }, [bookingId, mode, nav, ripple])

  useEffect(() => {
    if (!pressed || success) return

    const startedAt = Date.now()
    const poll = async () => {
      try {
        const result = await confirmHandoff(bookingId, mode)
        setBooking(result.booking)
        if (result.bothConfirmed) {
          await handleSuccess(result.booking)
        } else if (Date.now() - startedAt >= TIMEOUT_MS) {
          setPressed(false)
          setTimedOut(true)
        }
      } catch (err: any) {
        setPressed(false)
        Alert.alert('Error', err?.response?.data?.error ?? 'Could not confirm handoff.')
      }
    }

    const id = setInterval(poll, 2000)
    const timeout = setTimeout(() => {
      setPressed(false)
      setTimedOut(true)
    }, TIMEOUT_MS)

    return () => {
      clearInterval(id)
      clearTimeout(timeout)
    }
  }, [bookingId, handleSuccess, mode, pressed, success])

  async function pressZoink() {
    if (locked) return

    setTimedOut(false)
    setPressed(true)
    try {
      const result = await confirmHandoff(bookingId, mode)
      setBooking(result.booking)
      if (result.bothConfirmed) {
        await handleSuccess(result.booking)
      }
    } catch (err: any) {
      setPressed(false)
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not confirm handoff.')
    }
  }

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
      setPickerUris(result.assets.map((asset) => asset.uri).slice(0, 3))
    } catch {
      Alert.alert('Photo picker error', 'Could not open your photo library right now.')
    }
  }

  async function submitPhotos() {
    if (!isPickerValid) return

    setSaving(true)
    try {
      const uploaded = await Promise.all(pickerUris.map((uri) => uploadHandoffPhotoImage(bookingId, uri)))
      const updated = await initiateHandoff(bookingId, mode, uploaded)
      setBooking(updated)
      setPickerUris([])
      setEditing(false)
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not submit photos.')
    } finally {
      setSaving(false)
    }
  }

  if (!booking) {
    return (
      <View style={styles.screen}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    )
  }

  if (showPickerUI) {
    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.pickerContent}>
          <TouchableOpacity
            onPress={() => (editing ? setEditing(false) : nav.goBack())}
            disabled={saving}
          >
            <Text style={styles.backText}>{editing ? 'Cancel' : 'Back'}</Text>
          </TouchableOpacity>

          <Text style={styles.title}>{mode === 'pickup' ? 'Document the Item' : 'Document the Return'}</Text>

          <TouchableOpacity style={styles.uploadArea} onPress={choosePhotos} disabled={saving}>
            <Text style={styles.uploadText}>{pickerUris.length ? 'Change photos' : 'Select photos'}</Text>
            <Text style={styles.uploadSubtext}>{pickerUris.length}/3 selected</Text>
          </TouchableOpacity>

          {pickerUris.length > 0 ? (
            <View style={styles.thumbnailRow}>
              {pickerUris.map((uri) => (
                <Image key={uri} source={{ uri }} style={styles.thumbnail} />
              ))}
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.submitButton, (!isPickerValid || saving) && styles.submitButtonDisabled]}
            onPress={submitPhotos}
            disabled={!isPickerValid || saving}
          >
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>Submit</Text>}
          </TouchableOpacity>
        </ScrollView>
      </View>
    )
  }

  const statusText = success
    ? 'Zoinked'
    : timedOut
      ? "Time's up - try again"
      : pressed
        ? `Waiting for ${otherName}...`
        : isReady
          ? "Press when you're ready"
          : 'Waiting for photos...'

  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, pressed ? 1.45 : 1.28],
  })
  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [pressed ? 0.8 : 0.42, 0],
  })
  const rippleScale = ripple.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  })
  const rippleOpacity = ripple.interpolate({
    inputRange: [0, 0.68, 1],
    outputRange: [0.45, 0.22, 0],
  })

  return (
    <View style={styles.screen}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.screenRipple,
          {
            opacity: rippleOpacity,
            transform: [{ scale: rippleScale }],
          },
        ]}
      />

      {existingPhotos.length > 0 ? (
        <View style={styles.existingPhotosRow}>
          {existingPhotos.map((url) => (
            <Image key={url} source={{ uri: url }} style={styles.existingPhoto} resizeMode="cover" />
          ))}
        </View>
      ) : null}

      {isUploader && !pressed && !success ? (
        <TouchableOpacity onPress={() => setEditing(true)} style={styles.editPhotosButton}>
          <Text style={styles.editPhotosText}>Edit Photos</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.buttonStage}>
        {isReady && !success ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.pulseRing,
              {
                opacity: ringOpacity,
                transform: [{ scale: ringScale }],
              },
            ]}
          />
        ) : null}

        <TouchableOpacity
          style={[
            styles.circle,
            !isReady && styles.circleLocked,
            isReady && !success && styles.circleReady,
            pressed && styles.circlePressed,
            success && styles.circleSuccess,
          ]}
          onPress={pressZoink}
          disabled={locked}
          activeOpacity={0.86}
        >
          <Image
            source={require('../../assets/logo.png')}
            resizeMode="contain"
            style={styles.logo}
          />
        </TouchableOpacity>
      </View>

      <Animated.Text style={[styles.status, { opacity: statusOpacity }]}>{statusText}</Animated.Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    overflow: 'hidden',
  },
  pickerContent: { flexGrow: 1, padding: 24, paddingTop: 64, gap: 18, width: '100%' },
  backText: { color: theme.textMuted, fontSize: 14, fontWeight: '700', marginBottom: 10 },
  title: { ...theme.type.screenTitle },
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
  existingPhotosRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  existingPhoto: { width: 84, height: 84, borderRadius: 8, backgroundColor: theme.surfaceSubdued },
  editPhotosButton: { marginBottom: 24 },
  editPhotosText: { color: theme.primaryDeep, fontSize: 14, fontWeight: '800' },
  buttonStage: {
    width: 270,
    height: 270,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    borderWidth: 3,
    borderColor: '#00FF88',
  },
  circle: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    borderWidth: 2,
    borderColor: '#111114',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  circleLocked: {
    backgroundColor: '#E0E0E0',
    borderWidth: 0,
    shadowOpacity: 0,
  },
  circleReady: {
    shadowColor: '#00FF88',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  circlePressed: {
    shadowColor: '#00FF88',
    shadowOpacity: 0.8,
    shadowRadius: 35,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  circleSuccess: {
    borderColor: '#00C768',
    backgroundColor: '#FFFFFF',
    shadowColor: '#00FF88',
    shadowOpacity: 0.85,
    shadowRadius: 36,
    shadowOffset: { width: 0, height: 0 },
    elevation: 14,
  },
  logo: {
    width: 118,
    height: 118,
  },
  screenRipple: {
    position: 'absolute',
    width: RIPPLE_SIZE,
    height: RIPPLE_SIZE,
    borderRadius: RIPPLE_SIZE / 2,
    backgroundColor: '#00FF88',
  },
  status: {
    color: '#111114',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 10,
    minHeight: 24,
  },
})
