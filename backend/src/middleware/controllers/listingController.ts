import { Request, Response } from 'express'
import multer from 'multer'
import * as listingService from '../../services/listingService'
import { uploadImage, deleteImage, extractPublicId } from '../../utils/cloudinary'

// ── Error mapper ──────────────────────────────────────────────────────────────

function handleError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR'
  const map: Record<string, { status: number; message: string }> = {
    LISTING_NOT_FOUND:  { status: 404, message: 'Listing not found.' },
    LISTING_FORBIDDEN:  { status: 403, message: 'You do not own this listing.' },
    IMAGE_NOT_FOUND:    { status: 404, message: 'Image not found.' },
    VALIDATION_ERROR:   { status: 400, message: 'Missing or invalid fields.' },
  }
  const mapped = map[message]
  if (mapped) return res.status(mapped.status).json({ error: mapped.message })
  console.error('Unhandled listing error:', error)
  return res.status(500).json({ error: 'Something went wrong.' })
}

// ── POST /listings ────────────────────────────────────────────────────────────

export async function createListing(req: Request, res: Response) {
  const ownerId = (req as any).userId
  const { title, description, category, dailyPrice, latitude, longitude, city, address } = req.body

  if (!title || !description || !category || dailyPrice == null || latitude == null || longitude == null || !city) {
    return res.status(400).json({ error: 'Missing required fields.' })
  }

  try {
    const listing = await listingService.createListing(ownerId, {
      title,
      description,
      category,
      dailyPrice: Number(dailyPrice),
      latitude: Number(latitude),
      longitude: Number(longitude),
      city,
      address,
    })
    return res.status(201).json(listing)
  } catch (error) {
    return handleError(res, error)
  }
}

// ── GET /listings/:id ─────────────────────────────────────────────────────────

export async function searchListings(req: Request, res: Response) {
  const lat = Number(req.query.lat)
  const lng = Number(req.query.lng)
  const radius = req.query.radius != null ? Number(req.query.radius) : 25

  if (
    Number.isNaN(lat) ||
    Number.isNaN(lng) ||
    Number.isNaN(radius) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180 ||
    radius <= 0
  ) {
    return res.status(400).json({ error: 'Missing or invalid geo search parameters.' })
  }

  try {
    const listings = await listingService.searchListings({ lat, lng, radius })
    return res.json(listings)
  } catch (error) {
    return handleError(res, error)
  }
}

export async function getListing(req: Request, res: Response) {
  const id = req.params.id as string
  try {
    const listing = await listingService.getListingById(id)
    return res.json(listing)
  } catch (error) {
    return handleError(res, error)
  }
}

// ── GET /listings/me ──────────────────────────────────────────────────────────

export async function getMyListings(req: Request, res: Response) {
  const ownerId = (req as any).userId
  try {
    const listings = await listingService.getMyListings(ownerId)
    return res.json(listings)
  } catch (error) {
    return handleError(res, error)
  }
}

// ── PATCH /listings/:id ───────────────────────────────────────────────────────

export async function updateListing(req: Request, res: Response) {
  const ownerId = (req as any).userId as string
  const id = req.params.id as string
  const { title, description, category, dailyPrice, latitude, longitude, city, address } = req.body

  try {
    const listing = await listingService.updateListing(id, ownerId, {
      title,
      description,
      category,
      dailyPrice: dailyPrice != null ? Number(dailyPrice) : undefined,
      latitude: latitude != null ? Number(latitude) : undefined,
      longitude: longitude != null ? Number(longitude) : undefined,
      city,
      address,
    })
    return res.json(listing)
  } catch (error) {
    return handleError(res, error)
  }
}

// ── PATCH /listings/:id/availability ─────────────────────────────────────────

export async function toggleAvailability(req: Request, res: Response) {
  const ownerId = (req as any).userId as string
  const id = req.params.id as string
  const { isAvailable } = req.body

  if (typeof isAvailable !== 'boolean') {
    return res.status(400).json({ error: 'isAvailable must be a boolean.' })
  }

  try {
    const result = await listingService.setAvailability(id, ownerId, isAvailable)
    return res.json(result)
  } catch (error) {
    return handleError(res, error)
  }
}

// ── DELETE /listings/:id ──────────────────────────────────────────────────────

export async function deleteListing(req: Request, res: Response) {
  const ownerId = (req as any).userId as string
  const id = req.params.id as string
  try {
    await listingService.deleteListing(id, ownerId)
    return res.status(204).send()
  } catch (error) {
    return handleError(res, error)
  }
}

// ── POST /listings/:id/images ─────────────────────────────────────────────────

export async function uploadListingImage(req: Request, res: Response) {
  const ownerId = (req as any).userId as string
  const id = req.params.id as string

  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided.' })
  }

  try {
    const publicId = `listing_${id}_${Date.now()}`
    const url = await uploadImage(req.file.buffer, 'listings', publicId)
    const image = await listingService.addListingImage(id, ownerId, url)
    return res.status(201).json(image)
  } catch (error) {
    return handleError(res, error)
  }
}

// ── DELETE /listings/:id/images/:imageId ──────────────────────────────────────

export async function deleteListingImage(req: Request, res: Response) {
  const ownerId = (req as any).userId as string
  const id = req.params.id as string
  const imageId = req.params.imageId as string

  try {
    const url = await listingService.deleteListingImage(id, imageId, ownerId)

    // Best-effort Cloudinary cleanup — don't fail the request if it errors
    try {
      const publicId = extractPublicId(url)
      await deleteImage(publicId)
    } catch (cloudErr) {
      console.warn('[Cloudinary] Failed to delete image:', cloudErr)
    }

    return res.status(204).send()
  } catch (error) {
    return handleError(res, error)
  }
}
