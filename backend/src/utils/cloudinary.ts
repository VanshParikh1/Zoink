import { v2 as cloudinary } from 'cloudinary'
import { loggableError } from './sentryScrub'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
})

/**
 * Upload a file buffer to Cloudinary and return the secure URL.
 * folder: 'avatars' | 'listings'
 */
export async function uploadImage(
  buffer: Buffer,
  folder: string,
  publicId?: string
): Promise<string> {
  const isAvatar = folder === 'avatars'

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        ...(publicId ? { public_id: publicId, overwrite: true } : {}),
        resource_type: 'image',
        transformation: isAvatar
          ? [
              { width: 400, height: 400, crop: 'fill', gravity: 'face' },
              { quality: 'auto', fetch_format: 'auto' },
            ]
          : [
              { width: 1200, height: 900, crop: 'limit' },
              { quality: 'auto', fetch_format: 'auto' },
            ],
      },
      (error, result) => {
        if (error || !result) {
          console.error('[Cloudinary] Upload error:', JSON.stringify(error))
          return reject(error ?? new Error('Cloudinary upload failed'))
        }
        resolve(result.secure_url)
      }
    )
    uploadStream.end(buffer)
  })
}

/**
 * Delete an image from Cloudinary by its public_id.
 */
export async function deleteImage(publicId: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId)
}

/**
 * Extract the Cloudinary public_id from a secure URL.
 * e.g. https://res.cloudinary.com/demo/image/upload/v1234/listings/abc.jpg
 *   → listings/abc
 */
export function extractPublicId(url: string): string {
  // Strip query params, split on /upload/, take everything after, remove extension
  const afterUpload = url.split('/upload/')[1] ?? ''
  // Remove version segment if present (v1234/)
  const withoutVersion = afterUpload.replace(/^v\d+\//, '')
  // Remove file extension
  return withoutVersion.replace(/\.[^/.]+$/, '')
}

/**
 * The public_id of an image in this app's own Cloudinary account, or null for
 * any other URL (seed photos, another account), so only our own uploads are
 * ever deleted.
 */
export function ownPublicId(url: string): string | null {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  if (!cloudName || !url.startsWith(`https://res.cloudinary.com/${cloudName}/image/upload/`)) return null
  return extractPublicId(url) || null
}

/**
 * Deletes this app's own uploads among `urls`, best effort: a failure is
 * logged, never thrown, since the row that pointed at the image is already
 * gone.
 */
export async function deleteOwnImages(urls: (string | null | undefined)[]): Promise<void> {
  for (const url of urls) {
    const publicId = url ? ownPublicId(url) : null
    if (!publicId) continue
    try {
      await deleteImage(publicId)
    } catch (error) {
      console.warn('[Cloudinary] Failed to delete image:', loggableError(error))
    }
  }
}
