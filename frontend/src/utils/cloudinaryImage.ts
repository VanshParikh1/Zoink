import { Dimensions, PixelRatio } from 'react-native'

// The app is portrait-only, so this is fixed for the session.
export const SCREEN_WIDTH = Dimensions.get('window').width
export const SCREEN_HEIGHT = Dimensions.get('window').height

// Listing photos are stored up to 1200x900 and avatars at 400x400; without a
// delivery transformation every 56-90pt thumbnail downloaded the full stored
// image. These helpers ask Cloudinary for the pixels actually drawn.
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
  return withTransformation(url, `c_fill,w_${toPx(box.width)},h_${toPx(box.height)},q_auto`)
}

/** For images whose exact box isn't known up front (full-width, flexible
 *  cards) or that use resizeMode "contain": scales down to at most this size,
 *  keeping the aspect ratio and never cropping, so the Image frames it exactly
 *  as before. */
export function limitImageUrl(url: string | null | undefined, max: { width: number; height?: number }) {
  const height = max.height ? `,h_${toPx(max.height)}` : ''
  return withTransformation(url, `c_limit,w_${toPx(max.width)}${height},q_auto`)
}
