import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useNavigation, useRoute, useFocusEffect, RouteProp } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import {
  getListing,
  updateListing,
  uploadListingImage,
  deleteListingImage,
} from '../services/listingsApi'
import { Listing } from '../types'

type Nav   = NativeStackNavigationProp<RootStackParamList>
type Route = RouteProp<RootStackParamList, 'EditListing'>

const CATEGORIES = [
  'Electronics', 'Tools', 'Sports', 'Outdoors',
  'Audio/Video', 'Cameras', 'Clothing', 'Books', 'Other',
]

export default function EditListingScreen() {
  const nav       = useNavigation<Nav>()
  const route     = useRoute<Route>()
  const listingId = route.params.listingId

  const [listing, setListing]         = useState<Listing | null>(null)
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [uploadingImg, setUploadingImg] = useState(false)

  const [title, setTitle]             = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory]       = useState('')
  const [dailyPrice, setDailyPrice]   = useState('')
  const [city, setCity]               = useState('')
  const [address, setAddress]         = useState('')

  // ── Load listing ──────────────────────────────────────────────────────────

  useFocusEffect(
    useCallback(() => {
      async function load() {
        setLoading(true)
        try {
          const data = await getListing(listingId)
          setListing(data)
          setTitle(data.title)
          setDescription(data.description)
          setCategory(data.category)
          setDailyPrice(String(Number(data.dailyPrice)))
          setCity(data.city)
          setAddress(data.address ?? '')
        } catch {
          Alert.alert('Error', 'Could not load listing.')
          nav.goBack()
        } finally {
          setLoading(false)
        }
      }
      load()
    }, [listingId])
  )

  // ── Save edits ────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!title.trim() || !description.trim() || !category || !dailyPrice || !city.trim()) {
      Alert.alert('Missing fields', 'Please fill in all required fields.')
      return
    }
    const price = parseFloat(dailyPrice)
    if (isNaN(price) || price <= 0) {
      Alert.alert('Invalid price', 'Daily price must be a positive number.')
      return
    }

    setSaving(true)
    try {
      await updateListing(listingId, {
        title: title.trim(),
        description: description.trim(),
        category,
        dailyPrice: price,
        city: city.trim(),
        address: address.trim() || undefined,
      })
      Alert.alert('Saved!', 'Your listing has been updated.', [
        { text: 'OK', onPress: () => nav.navigate('ListingDetail', { listingId }) },
      ])
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not save changes.')
    } finally {
      setSaving(false)
    }
  }

  // ── Add photo ─────────────────────────────────────────────────────────────

  async function handleAddPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Please allow access to your photo library.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    })
    if (result.canceled || !result.assets[0]) return

    setUploadingImg(true)
    try {
      const image = await uploadListingImage(listingId, result.assets[0].uri)
      setListing(prev =>
        prev ? { ...prev, images: [...prev.images, image] } : prev
      )
    } catch {
      Alert.alert('Upload failed', 'Could not upload the photo.')
    } finally {
      setUploadingImg(false)
    }
  }

  // ── Remove photo ──────────────────────────────────────────────────────────

  async function handleRemovePhoto(imageId: string) {
    Alert.alert('Remove photo?', 'This will delete the photo permanently.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteListingImage(listingId, imageId)
            setListing(prev =>
              prev ? { ...prev, images: prev.images.filter(i => i.id !== imageId) } : prev
            )
          } catch {
            Alert.alert('Error', 'Could not remove photo.')
          }
        },
      },
    ])
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6C47FF" />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.header}>Edit Listing</Text>

        {/* Photos */}
        <Text style={styles.label}>Photos</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
          {listing?.images.map(img => (
            <View key={img.id} style={styles.photoWrapper}>
              <Image source={{ uri: img.url }} style={styles.photoThumb} />
              <TouchableOpacity style={styles.photoRemove} onPress={() => handleRemovePhoto(img.id)}>
                <Text style={styles.photoRemoveText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={styles.addPhoto} onPress={handleAddPhoto} disabled={uploadingImg}>
            {uploadingImg ? (
              <ActivityIndicator color="#6C47FF" />
            ) : (
              <>
                <Text style={styles.addPhotoIcon}>＋</Text>
                <Text style={styles.addPhotoLabel}>Add</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>

        {/* Title */}
        <Text style={styles.label}>Title <Text style={styles.req}>*</Text></Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholderTextColor="#888"
          maxLength={80}
        />

        {/* Description */}
        <Text style={styles.label}>Description <Text style={styles.req}>*</Text></Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={description}
          onChangeText={setDescription}
          placeholderTextColor="#888"
          multiline
          numberOfLines={4}
          maxLength={1000}
        />

        {/* Category */}
        <Text style={styles.label}>Category <Text style={styles.req}>*</Text></Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat}
              style={[styles.chip, category === cat && styles.chipActive]}
              onPress={() => setCategory(cat)}
            >
              <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Price */}
        <Text style={styles.label}>Daily Price (CAD) <Text style={styles.req}>*</Text></Text>
        <View style={styles.priceRow}>
          <Text style={styles.currency}>$</Text>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={dailyPrice}
            onChangeText={setDailyPrice}
            placeholderTextColor="#888"
            keyboardType="decimal-pad"
          />
        </View>

        {/* City */}
        <Text style={styles.label}>City <Text style={styles.req}>*</Text></Text>
        <TextInput
          style={styles.input}
          value={city}
          onChangeText={setCity}
          placeholderTextColor="#888"
        />

        {/* Address */}
        <Text style={styles.label}>Address <Text style={styles.optional}>(optional)</Text></Text>
        <TextInput
          style={styles.input}
          value={address}
          onChangeText={setAddress}
          placeholderTextColor="#888"
        />

        {/* Save */}
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const PURPLE = '#6C47FF'
const DARK   = '#0D0D14'
const CARD   = '#1A1A2E'
const MUTED  = '#888'

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: DARK },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: DARK },
  content:          { paddingHorizontal: 24, paddingTop: 60 },

  backBtn:  { marginBottom: 16 },
  backText: { color: PURPLE, fontSize: 16, fontWeight: '600' },
  header:   { fontSize: 26, fontWeight: '800', color: '#fff', marginBottom: 24 },

  label:    { fontSize: 14, fontWeight: '600', color: '#ccc', marginBottom: 6, marginTop: 18 },
  req:      { color: PURPLE },
  optional: { color: MUTED, fontWeight: '400' },

  input: {
    backgroundColor: CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a40',
    color: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
  },
  textarea: { height: 110, textAlignVertical: 'top', paddingTop: 13 },

  chip:           { borderRadius: 20, borderWidth: 1, borderColor: '#2a2a40', paddingHorizontal: 16, paddingVertical: 8, marginRight: 8, backgroundColor: CARD },
  chipActive:     { backgroundColor: PURPLE, borderColor: PURPLE },
  chipText:       { fontSize: 13, color: MUTED, fontWeight: '500' },
  chipTextActive: { color: '#fff' },

  priceRow: { flexDirection: 'row', alignItems: 'center' },
  currency: { fontSize: 20, color: PURPLE, marginRight: 8, fontWeight: '700' },

  photoScroll:  { marginTop: 4 },
  photoWrapper: { position: 'relative', marginRight: 10 },
  photoThumb:   { width: 90, height: 90, borderRadius: 12 },
  photoRemove: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10, width: 20, height: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  photoRemoveText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  addPhoto: {
    width: 90, height: 90, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#2a2a40', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: CARD,
  },
  addPhotoIcon:  { fontSize: 24, color: PURPLE },
  addPhotoLabel: { fontSize: 11, color: MUTED, marginTop: 2 },

  saveBtn:         { backgroundColor: PURPLE, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 32 },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText:     { color: '#fff', fontSize: 17, fontWeight: '700' },
})
