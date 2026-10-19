import { Dimensions, PixelRatio } from 'react-native'
import { Image } from 'expo-image'
import { initialWindowMetrics } from 'react-native-safe-area-context'

// The app is portrait-only, so this is fixed for the session.
export const SCREEN_WIDTH = Dimensions.get('window').width

// Listing photos are stored up to 1200x900 and avatars at 400x400; without a
// delivery transformation every 56-90pt thumbnail downloaded the full stored
// image. These helpers ask Cloudinary for the pixels actually drawn, as WebP
// (4-39% smaller than its JPEG at these sizes). Explicit rather than f_auto:
// the image loaders send Accept: image/*, so f_auto would always pick JPEG.
// Every renderer here decodes WebP (iOS 14+, expo-image, Android).
// Anything that isn't a Cloudinary upload URL (local picks, demo data) is
// returned unchanged.
const CLOUDINARY_UPLOAD = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/
const MAX_PX = 1600

function toPx(points: number) {
  return Math.min(MAX_PX, Math.ceil(points * PixelRatio.get()))
}

function withTransformation(url: string | null | undefined, transformation: string) {
  if (!url) return url ?? undefined
  const match = CLOUDINARY_UPLOAD.exec(url)
  if (!match) return url
  return `${match[1]}${transformation}/${match[2]}`
}

/** For an Image drawn at exactly this box with resizeMode "cover" (the
 *  default): Cloudinary crops to the same box, centred — the same framing the
 *  Image would produce from the full-size original. */
export function fillImageUrl(url: string | null | undefined, box: { width: number; height: number }) {
  return withTransformation(url, `c_fill,w_${toPx(box.width)},h_${toPx(box.height)},q_auto,f_webp`)
}

/** For images whose exact box isn't known up front (full-width, flexible
 *  cards) or that use resizeMode "contain": scales down to at most this size,
 *  keeping the aspect ratio and never cropping, so the Image frames it exactly
 *  as before. */
export function limitImageUrl(url: string | null | undefined, max: { width: number; height?: number }) {
  const height = max.height ? `,h_${toPx(max.height)}` : ''
  return withTransformation(url, `c_limit,w_${toPx(max.width)}${height},q_auto,f_webp`)
}

// The listing page's hero photo: about 30% of the screen, clamped for very
// small and very tall phones, plus the status-bar inset it runs under.
const HERO_MIN = 220
const HERO_MAX = 280
const HERO_SCREEN_SHARE = 0.29

export function listingHeroHeight(windowHeight: number, topInset: number) {
  return Math.min(HERO_MAX, Math.max(HERO_MIN, Math.round(windowHeight * HERO_SCREEN_SHARE))) + topInset
}

/**
 * Starts downloading the photo the listing page opens with, the moment a
 * card is pressed: the same URL ListingDetailScreen asks for, so the page
 * finds it in the cache instead of waiting on the network.
 */
export function prefetchListingHero(url: string | null | undefined) {
  if (!url) return
  const window = Dimensions.get('window')
  const height = listingHeroHeight(window.height, initialWindowMetrics?.insets.top ?? 0)
  const heroUrl = fillImageUrl(url, { width: window.width, height })
  if (heroUrl) Image.prefetch(heroUrl).catch(() => {})
}
