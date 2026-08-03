export function getImageUploadPart(uri: string, fallbackName = 'photo.jpg') {
  const rawFilename = uri.split('/').pop()?.split('?')[0] || fallbackName
  const filename = rawFilename.includes('.') ? rawFilename : fallbackName
  const ext = filename.split('.').pop()?.toLowerCase()
  const mimeTypes: Record<string, string> = {
    gif: 'image/gif',
    heic: 'image/heic',
    heif: 'image/heif',
    png: 'image/png',
  }
  const type = ext ? mimeTypes[ext] ?? 'image/jpeg' : 'image/jpeg'

  return { uri, name: filename, type }
}
