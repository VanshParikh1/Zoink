import { Request, Response } from 'express'
import multer from 'multer'
import * as listingService from '../../services/listingService'
import { uploadImage, deleteImage, extractPublicId } from '../../utils/cloudinary'
import { asyncHandler } from '../../utils/asyncHandler'

// ── POST /listings ────────────────────────────────────────────────────────────

export const createListing = asyncHandler(async (req: Request, res: Response) => {
  const ownerId = (req as any).userId
  const { title, description, category, dailyPrice, itemValue, depositAmount, latitude, longitude, city, address } = req.body

  const listing = await listingService.createListing(ownerId, {
    title,
    description,
    category,
    dailyPrice: Number(dailyPrice),
    itemValue: itemValue != null ? Number(itemValue) : undefined,
    depositAmount: depositAmount != null ? Number(depositAmount) : undefined,
    latitude: Number(latitude),
    longitude: Number(longitude),
    city,
    address,
  })
  return res.status(201).json(listing)
})


// ── GET /listings ─────────────────────────────────────────────────────────────

export const browseListings = asyncHandler(async (req: Request, res: Response) => {
  // req.query has already been coerced and validated by BrowseListingsQuerySchema
  const {
    q: query,
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
  } = req.query as any

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
  const { title, description, category, dailyPrice, itemValue, depositAmount, latitude, longitude, city, address } = req.body

  const listing = await listingService.updateListing(id, ownerId, {
    title,
    description,
    category,
    dailyPrice: dailyPrice != null ? Number(dailyPrice) : undefined,
    itemValue: itemValue != null ? Number(itemValue) : undefined,
    depositAmount: depositAmount != null ? Number(depositAmount) : undefined,
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
