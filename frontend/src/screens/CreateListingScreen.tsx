import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { createListing, uploadListingImage } from '../services/listingsApi'

type Nav = NativeStackNavigationProp<RootStackParamList>

const CATEGORIES = [
  'Electronics', 'Tools', 'Sports', 'Outdoors',
  'Audio/Video', 'Cameras', 'Clothing', 'Books', 'Other',
]

export default function CreateListingScreen() {
  const nav = useNavigation<Nav>()

  const [title, setTitle]             = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory]       = useState('')
  const [dailyPrice, setDailyPrice]   = useState('')
  const [city, setCity]               = useState('')
  const [address, setAddress]         = useState('')
  const [latitude, setLatitude]       = useState('')
  const [longitude, setLongitude]     = useState('')
  const [photos, setPhotos]           = useState<string[]>([])
  const [loading, setLoading]         = useState(false)

  // ── Photo picker ──────────────────────────────────────────────────────────

  async function handlePickPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow access to your photo library.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    })
    if (!result.canceled) {
      const uris = result.assets.map(a => a.uri)
      setPhotos(prev => [...prev, ...uris].slice(0, 8)) // cap at 8
    }
  }

  function removePhoto(uri: string) {
    setPhotos(prev => prev.filter(p => p !== uri))
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!title.trim() || !description.trim() || !category || !dailyPrice || !city.trim()) {
      Alert.alert('Missing fields', 'Please fill in all required fields.')
      return
    }
    const price = parseFloat(dailyPrice)
    if (isNaN(price) || price <= 0) {
      Alert.alert('Invalid price', 'Daily price must be a positive number.')
      return
    }
    const lat = parseFloat(latitude)
    const lng = parseFloat(longitude)
    if (latitude && (isNaN(lat) || lat < -90 || lat > 90)) {
      Alert.alert('Invalid latitude', 'Latitude must be between -90 and 90.')
      return
    }
    if (longitude && (isNaN(lng) || lng < -180 || lng > 180)) {
      Alert.alert('Invalid longitude', 'Longitude must be between -180 and 180.')
      return
    }

    setLoading(true)
    try {
      const listing = await createListing({
        title: title.trim(),
        description: description.trim(),
        category,
        dailyPrice: price,
        latitude: lat || 0,
        longitude: lng || 0,
        city: city.trim(),
        address: address.trim() || undefined,
      })

      // Upload photos sequentially
      for (const uri of photos) {
        try {
          await uploadListingImage(listing.id, uri)
        } catch {
          // Non-fatal — listing was created, just continue
        }
      }

      Alert.alert('🎉 Listing created!', 'Your item is now live on Zoink.', [
        { text: 'View it', onPress: () => nav.navigate('ListingDetail', { listingId: listing.id }) },
        { text: 'My Listings', onPress: () => nav.navigate('MyListings') },
      ])
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Something went wrong.'
      Alert.alert('Error', msg)
    } finally {
      setLoading(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.header}>List an Item</Text>
        <Text style={styles.subheader}>Tell renters what you've got</Text>

        {/* Title */}
        <Text style={styles.label}>Title <Text style={styles.req}>*</Text></Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Sony a7III Camera"
          placeholderTextColor="#888"
          value={title}
          onChangeText={setTitle}
          maxLength={80}
        />

        {/* Description */}
        <Text style={styles.label}>Description <Text style={styles.req}>*</Text></Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          placeholder="Describe the item — condition, what's included, any rules..."
          placeholderTextColor="#888"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          maxLength={1000}
        />

        {/* Category */}
        <Text style={styles.label}>Category <Text style={styles.req}>*</Text></Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
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

        {/* Daily price */}
        <Text style={styles.label}>Daily Price (CAD) <Text style={styles.req}>*</Text></Text>
        <View style={styles.priceRow}>
          <Text style={styles.currency}>$</Text>
          <TextInput
            style={[styles.input, styles.priceInput]}
            placeholder="0.00"
            placeholderTextColor="#888"
            value={dailyPrice}
            onChangeText={setDailyPrice}
            keyboardType="decimal-pad"
          />
        </View>

        {/* Location */}
        <Text style={styles.label}>City <Text style={styles.req}>*</Text></Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Toronto"
          placeholderTextColor="#888"
          value={city}
          onChangeText={setCity}
        />

        <Text style={styles.label}>Address <Text style={styles.optional}>(optional)</Text></Text>
        <TextInput
          style={styles.input}
          placeholder="Neighbourhood or street (never shown publicly)"
          placeholderTextColor="#888"
          value={address}
          onChangeText={setAddress}
        />

        <Text style={styles.sectionLabel}>Coordinates <Text style={styles.optional}>(optional — for map search)</Text></Text>
        <View style={styles.coordRow}>
          <TextInput
            style={[styles.input, styles.coordInput]}
            placeholder="Latitude"
            placeholderTextColor="#888"
            value={latitude}
            onChangeText={setLatitude}
            keyboardType="decimal-pad"
          />
          <TextInput
            style={[styles.input, styles.coordInput]}
            placeholder="Longitude"
            placeholderTextColor="#888"
            value={longitude}
            onChangeText={setLongitude}
            keyboardType="decimal-pad"
          />
        </View>

        {/* Photos */}
        <Text style={styles.label}>Photos <Text style={styles.optional}>(up to 8)</Text></Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
          {photos.map(uri => (
            <View key={uri} style={styles.photoWrapper}>
              <Image source={{ uri }} style={styles.photoThumb} />
              <TouchableOpacity style={styles.photoRemove} onPress={() => removePhoto(uri)}>
                <Text style={styles.photoRemoveText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          {photos.length < 8 && (
            <TouchableOpacity style={styles.addPhoto} onPress={handlePickPhoto}>
              <Text style={styles.addPhotoIcon}>＋</Text>
              <Text style={styles.addPhotoText}>Add photo</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>Post Listing</Text>
          )}
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
  container:    { flex: 1, backgroundColor: DARK },
  content:      { paddingHorizontal: 24, paddingTop: 60 },

  backBtn:      { marginBottom: 16 },
  backText:     { color: PURPLE, fontSize: 16, fontWeight: '600' },

  header:       { fontSize: 28, fontWeight: '800', color: '#fff', marginBottom: 4 },
  subheader:    { fontSize: 15, color: MUTED, marginBottom: 28 },

  label:        { fontSize: 14, fontWeight: '600', color: '#ccc', marginBottom: 6, marginTop: 18 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#ccc', marginBottom: 6, marginTop: 18 },
  req:          { color: PURPLE },
  optional:     { color: MUTED, fontWeight: '400' },

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
  textarea:    { height: 110, textAlignVertical: 'top', paddingTop: 13 },

  chipScroll:  { marginBottom: 4 },
  chip: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2a2a40',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    backgroundColor: CARD,
  },
  chipActive:     { backgroundColor: PURPLE, borderColor: PURPLE },
  chipText:       { fontSize: 13, color: MUTED, fontWeight: '500' },
  chipTextActive: { color: '#fff' },

  priceRow:    { flexDirection: 'row', alignItems: 'center' },
  currency:    { fontSize: 20, color: PURPLE, marginRight: 8, fontWeight: '700' },
  priceInput:  { flex: 1 },

  coordRow:    { flexDirection: 'row', gap: 10 },
  coordInput:  { flex: 1 },

  photoScroll: { marginTop: 4 },
  photoWrapper: { position: 'relative', marginRight: 10 },
  photoThumb:  { width: 90, height: 90, borderRadius: 12 },
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
  addPhotoIcon: { fontSize: 24, color: PURPLE },
  addPhotoText: { fontSize: 11, color: MUTED, marginTop: 2 },

  submitBtn: {
    backgroundColor: PURPLE,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 32,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 17, fontWeight: '700' },
})
