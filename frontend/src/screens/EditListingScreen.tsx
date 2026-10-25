import React, { useEffect, useRef, useState } from 'react'
import { Alert, StyleSheet, Text, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { LISTING_PHOTOS_MAX } from '@zoink/shared'
import { RootStackParamList } from '../navigation'
import { getListing, updateListing, uploadListingImage, deleteListingImage } from '../services/listingsApi'
import { Listing } from '../types'
import { queryKeys } from '../services/queryKeys'
import { colors } from '../theme/colors'
import { space } from '../theme/tokens'
import { type } from '../theme/typography'
import { fillImageUrl } from '../utils/cloudinaryImage'
import Screen from '../components/mockup/Screen'
import Button from '../components/mockup/Button'
import TextField from '../components/mockup/TextField'
import ListingForm, { ListingFormErrors, ListingFormHeader } from '../components/mockup/ListingForm'
import { toast } from '../services/toast'
import { DetailFallbackScreen, DetailLoadingScreen, isWaitingOffline, LISTING_UNAVAILABLE } from '../components/LoadStates'

type Nav = NativeStackNavigationProp<RootStackParamList>
type Route = RouteProp<RootStackParamList, 'EditListing'>

const PHOTO = 72

export default function EditListingScreen() {
  const nav = useNavigation<Nav>()
  const route = useRoute<Route>()
  const listingId = route.params.listingId

  const queryClient = useQueryClient()
  const listingQuery = useQuery({ queryKey: queryKeys.listing(listingId), queryFn: () => getListing(listingId) })
  const listing = listingQuery.data ?? null
  const loading = listingQuery.isPending
  const [saving, setSaving] = useState(false)
  const [uploadingImg, setUploadingImg] = useState(false)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [dailyPrice, setDailyPrice] = useState('')
  const [itemValue, setItemValue] = useState('')
  const [deposit, setDeposit] = useState('')
  const [city, setCity] = useState('')
  const [errors, setErrors] = useState<ListingFormErrors>({})

  // The form starts from the listing as loaded; later refetches (a new
  // photo) don't overwrite what's being typed.
  const formFilled = useRef(false)
  useEffect(() => {
    if (!listing || formFilled.current) return
    formFilled.current = true
    setTitle(listing.title)
    setDescription(listing.description)
    setCategory(listing.category)
    setDailyPrice(String(Number(listing.dailyPrice)))
    setItemValue(Number(listing.itemValue) ? String(Number(listing.itemValue)) : '')
    setDeposit(Number(listing.depositAmount) ? String(Number(listing.depositAmount)) : '')
    setCity(listing.city)
  }, [listing])

  // Anything showing this listing (lists, its page) picks the change up.
  function listingChanged() {
    queryClient.invalidateQueries({ queryKey: ['listings'] })
  }

  async function handleSave() {
    // Same rules as before; each message now shows under its field.
    const next: ListingFormErrors = {}
    if (!title.trim()) next.title = 'Add a name for your item.'
    if (!description.trim()) next.description = 'Write a short description.'
    if (!category) next.category = 'Pick a category.'
    if (!city.trim()) next.city = 'Add a city so renters can find your item.'

    const price = parseFloat(dailyPrice)
    if (!dailyPrice) next.dailyPrice = 'Add a daily price.'
    else if (isNaN(price) || price <= 0) next.dailyPrice = 'Daily price must be a positive number.'

    const parsedDeposit = deposit.trim() ? parseFloat(deposit) : 0
    if (deposit.trim() && (isNaN(parsedDeposit) || parsedDeposit < 0)) {
      next.deposit = 'Deposit must be zero or more.'
    }
    const parsedItemValue = itemValue.trim() ? parseFloat(itemValue) : 0
    if (itemValue.trim() && (isNaN(parsedItemValue) || parsedItemValue < 0)) {
      next.itemValue = 'Item value must be zero or more.'
    } else if (deposit.trim() && !itemValue.trim()) {
      next.itemValue = "Add the item's value so we can validate your deposit amount."
    } else if (deposit.trim() && itemValue.trim() && parsedDeposit > parsedItemValue) {
      next.deposit = 'You cannot set the deposit amount greater than the item value.'
    }

    setErrors(next)
    if (Object.keys(next).length > 0) return

    setSaving(true)

    try {
      const updated = await updateListing(listingId, {
        title: title.trim(),
        description: description.trim(),
        category,
        dailyPrice: price,
        itemValue: itemValue.trim() ? parsedItemValue : undefined,
        depositAmount: deposit.trim() ? parsedDeposit : 0,
        city: city.trim(),
      })
      queryClient.setQueryData(queryKeys.listing(listingId), updated)
      listingChanged()

      toast.success('Listing updated.')
      nav.navigate('ListingDetail', { listingId })
    } catch (err: any) {
      toast.failure(err, { action: "Couldn't save your changes. Please try again." })
    } finally {
      setSaving(false)
    }
  }

  async function handleAddPhoto() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow access to your photo library.')
        return
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        quality: 0.8,
      })

      if (result.canceled || !result.assets[0]) return

      setUploadingImg(true)

      await uploadListingImage(listingId, result.assets[0].uri)
      // Re-fetch from backend so the UI shows the real persisted Cloudinary URL
      await queryClient.invalidateQueries({ queryKey: queryKeys.listing(listingId) })
      listingChanged()
    } catch (err) {
      toast.failure(err, { action: "Couldn't upload that photo. Please try again." })
    } finally {
      setUploadingImg(false)
    }
  }

  async function handleRemovePhoto(imageId: string) {
    Alert.alert('Remove photo?', 'This will delete the photo permanently.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteListingImage(listingId, imageId)
            queryClient.setQueryData<Listing>(queryKeys.listing(listingId), (prev) =>
              prev ? { ...prev, images: prev.images.filter((image) => image.id !== imageId) } : prev
            )
            listingChanged()
          } catch (err) {
            toast.failure(err, { action: "Couldn't remove that photo. Please try again." })
          }
        },
      },
    ])
  }

  if (loading && !isWaitingOffline(listingQuery)) return <DetailLoadingScreen title="Edit listing" />
  if (!listing) {
    return <DetailFallbackScreen query={listingQuery} title="Edit listing" what="this listing" unavailable={LISTING_UNAVAILABLE} />
  }

  const hasErrors = Object.values(errors).some(Boolean)
  // Editing a field clears its own error; the rest wait for the next save.
  const edit = (field: keyof ListingFormErrors, set: (v: string) => void) => (v: string) => {
    set(v)
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))
  }

  return (
    <Screen
      keyboardAvoiding
      header={<ListingFormHeader title="Edit listing" onBack={() => nav.goBack()} />}
      footer={
        <View style={styles.footer}>
          {hasErrors ? <Text style={styles.error}>Fix the highlighted fields to save.</Text> : null}
          <Button label="Save changes" onPress={handleSave} loading={saving} />
        </View>
      }
    >
      <ListingForm
        photos={(listing?.images ?? []).map((image) => ({
          key: image.id,
          uri: fillImageUrl(image.url, { width: PHOTO, height: PHOTO }) ?? image.url,
          onRemove: () => handleRemovePhoto(image.id),
        }))}
        // Edit never required a photo; the backend caps every listing at LISTING_PHOTOS_MAX.
        photoMin={0}
        photoMax={LISTING_PHOTOS_MAX}
        onAddPhoto={handleAddPhoto}
        addingPhoto={uploadingImg}
        title={title}
        onTitle={edit('title', setTitle)}
        category={category}
        onCategory={edit('category', setCategory)}
        description={description}
        onDescription={edit('description', setDescription)}
        dailyPrice={dailyPrice}
        onDailyPrice={edit('dailyPrice', setDailyPrice)}
        deposit={deposit}
        onDeposit={edit('deposit', setDeposit)}
        itemValue={itemValue}
        onItemValue={edit('itemValue', setItemValue)}
        errors={errors}
      >
        <TextField label="City" placeholder="e.g. Toronto" value={city} onChangeText={edit('city', setCity)} maxLength={60} error={errors.city} />
      </ListingForm>
    </Screen>
  )
}

const styles = StyleSheet.create({
  footer: { gap: space.sm },
  error: { ...type.caption, color: colors.danger, textAlign: 'center' },
})
