import { Request, Response } from 'express'
import multer from 'multer'
import * as listingService from '../../services/listingService'
import { uploadImage, deleteImage, extractPublicId } from '../../utils/cloudinary'
import { asyncHandler } from '../../utils/asyncHandler'

// ── POST /listings ────────────────────────────────────────────────────────────

export const createListing = asyncHandler(async (req: Request, res: Response) => {
  const ownerId = (req as any).userId
  const { title, description, category, dailyPrice, itemValue, latitude, longitude, city, address } = req.body

  if (!title || !description || !category || dailyPrice == null || latitude == null || longitude == null || !city) {
    return res.status(400).json({ error: 'Missing required fields.' })
  }

  const listing = await listingService.createListing(ownerId, {
    title,
    description,
    category,
    dailyPrice: Number(dailyPrice),
    itemValue: itemValue != null ? Number(itemValue) : undefined,
    latitude: Number(latitude),
    longitude: Number(longitude),
    city,
    address,
  })
  return res.status(201).json(listing)
})

function parseNumber(value: unknown) {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : NaN
}

function parseBoolean(value: unknown) {
  if (typeof value !== 'string') return undefined
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

// ── GET /listings ─────────────────────────────────────────────────────────────

export const browseListings = asyncHandler(async (req: Request, res: Response) => {
  const query = typeof req.query.q === 'string' ? req.query.q : undefined
  const category = typeof req.query.category === 'string' ? req.query.category : undefined
  const city = typeof req.query.city === 'string' ? req.query.city : undefined
  const minPrice = parseNumber(req.query.minPrice)
  const maxPrice = parseNumber(req.query.maxPrice)
  const latitude = parseNumber(req.query.latitude)
  const longitude = parseNumber(req.query.longitude)
  const radiusKm = parseNumber(req.query.radiusKm)
  const limit = parseNumber(req.query.limit)
  const offset = parseNumber(req.query.offset)
  const includeUnavailable = parseBoolean(req.query.includeUnavailable)

  if ([minPrice, maxPrice, latitude, longitude, radiusKm, limit, offset].some((value) => value !== undefined && Number.isNaN(value))) {
    return res.status(400).json({ error: 'Query parameters must be valid numbers.' })
  }

  if ((latitude == null) !== (longitude == null)) {
    return res.status(400).json({ error: 'latitude and longitude must be provided together.' })
  }

  if (radiusKm != null && latitude == null) {
    return res.status(400).json({ error: 'radiusKm requires latitude and longitude.' })
  }

  if (minPrice != null && minPrice < 0) {
    return res.status(400).json({ error: 'minPrice cannot be negative.' })
  }

  if (maxPrice != null && maxPrice < 0) {
    return res.status(400).json({ error: 'maxPrice cannot be negative.' })
  }

  if (minPrice != null && maxPrice != null && minPrice > maxPrice) {
    return res.status(400).json({ error: 'minPrice cannot be greater than maxPrice.' })
  }

  if (radiusKm != null && radiusKm <= 0) {
    return res.status(400).json({ error: 'radiusKm must be greater than 0.' })
  }

  if (limit != null && limit <= 0) {
    return res.status(400).json({ error: 'limit must be greater than 0.' })
  }

  if (offset != null && offset < 0) {
    return res.status(400).json({ error: 'offset cannot be negative.' })
  }

  const result = await listingService.browseListings({
    query,
    category,
    city,
    minPrice,
    maxPrice,
    latitude,
    longitude,
    radiusKm,
    limit,
    offset,
    includeUnavailable,
  })
  return res.json(result)
})

// ── GET /listings/categories ──────────────────────────────────────────────────

export const getListingCategories = asyncHandler(async (_req: Request, res: Response) => {
  const categories = await listingService.getListingCategories()
  return res.json({ categories })
})

// ── GET /listings/:id ─────────────────────────────────────────────────────────

export const getListing = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string
  const listing = await listingService.getListingById(id)
  return res.json(listing)
})

// ── GET /listings/me ──────────────────────────────────────────────────────────

export const getMyListings = asyncHandler(async (req: Request, res: Response) => {
  const ownerId = (req as any).userId
  const listings = await listingService.getMyListings(ownerId)
  return res.json(listings)
})

// ── PATCH /listings/:id ───────────────────────────────────────────────────────

export const updateListing = asyncHandler(async (req: Request, res: Response) => {
  const ownerId = (req as any).userId as string
  const id = req.params.id as string
  const { title, description, category, dailyPrice, itemValue, latitude, longitude, city, address } = req.body

  const listing = await listingService.updateListing(id, ownerId, {
    title,
    description,
    category,
    dailyPrice: dailyPrice != null ? Number(dailyPrice) : undefined,
    itemValue: itemValue != null ? Number(itemValue) : undefined,
    latitude: latitude != null ? Number(latitude) : undefined,
    longitude: longitude != null ? Number(longitude) : undefined,
    city,
    address,
  })
  return res.json(listing)
})

// ── PATCH /listings/:id/availability ─────────────────────────────────────────

export const toggleAvailability = asyncHandler(async (req: Request, res: Response) => {
  const ownerId = (req as any).userId as string
  const id = req.params.id as string
  const { isAvailable } = req.body

  if (typeof isAvailable !== 'boolean') {
    return res.status(400).json({ error: 'isAvailable must be a boolean.' })
  }

  const result = await listingService.setAvailability(id, ownerId, isAvailable)
  return res.json(result)
})

// ── DELETE /listings/:id ──────────────────────────────────────────────────────

export const deleteListing = asyncHandler(async (req: Request, res: Response) => {
  const ownerId = (req as any).userId as string
  const id = req.params.id as string
  await listingService.deleteListing(id, ownerId)
  return res.status(204).send()
})

// ── POST /listings/:id/images ─────────────────────────────────────────────────

export const uploadListingImage = asyncHandler(async (req: Request, res: Response) => {
  const ownerId = (req as any).userId as string
  const id = req.params.id as string

  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided.' })
  }

  // Let Cloudinary auto-generate the public_id to avoid folder permission issues
  const url = await uploadImage(req.file.buffer, 'listings')
  const image = await listingService.addListingImage(id, ownerId, url)
  return res.status(201).json(image)
})

// ── DELETE /listings/:id/images/:imageId ──────────────────────────────────────

export const deleteListingImage = asyncHandler(async (req: Request, res: Response) => {
  const ownerId = (req as any).userId as string
  const id = req.params.id as string
  const imageId = req.params.imageId as string

  const url = await listingService.deleteListingImage(id, imageId, ownerId)

  // Best-effort Cloudinary cleanup — don't fail the request if it errors
  try {
    const publicId = extractPublicId(url)
    await deleteImage(publicId)
  } catch (cloudErr) {
    console.warn('[Cloudinary] Failed to delete image:', cloudErr)
  }

  return res.status(204).send()
})
