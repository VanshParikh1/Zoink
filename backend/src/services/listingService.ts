import prisma from '../utils/prisma'
import { Prisma } from '@prisma/client'

// ── Shared select shape ───────────────────────────────────────────────────────

const listingSelect = {
  id: true,
  title: true,
  description: true,
  category: true,
  dailyPrice: true,
  isAvailable: true,
  latitude: true,
  longitude: true,
  city: true,
  address: true,
  createdAt: true,
  updatedAt: true,
  ownerId: true,
  owner: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      verificationStatus: true,
    },
  },
  images: {
    select: { id: true, url: true, order: true },
    orderBy: { order: 'asc' as const },
  },
}

const EARTH_RADIUS_KM = 6371

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function normalizeCategory(category: string) {
  return category.trim().toLowerCase()
}

function buildDistanceSql(latitude: number, longitude: number) {
  return Prisma.sql`
    ${EARTH_RADIUS_KM} * ACOS(
      LEAST(
        1,
        GREATEST(
          -1,
          COS(RADIANS(${latitude})) * COS(RADIANS(l."latitude")) * COS(RADIANS(l."longitude") - RADIANS(${longitude}))
          + SIN(RADIANS(${latitude})) * SIN(RADIANS(l."latitude"))
        )
      )
    )
  `
}

export type BrowseListingsInput = {
  query?: string
  category?: string
  minPrice?: number
  maxPrice?: number
  latitude?: number
  longitude?: number
  radiusKm?: number
  city?: string
  includeUnavailable?: boolean
  limit?: number
  offset?: number
}

type BrowseListingRow = {
  id: string
  distanceKm: number | null
}

type CountRow = {
  count: bigint | number
}

// ── Create listing ────────────────────────────────────────────────────────────

export type CreateListingInput = {
  title: string
  description: string
  category: string
  dailyPrice: number
  latitude: number
  longitude: number
  city: string
  address?: string
}

export type SearchListingsInput = {
  lat: number
  lng: number
  radius: number
}

export async function searchListings({ lat, lng, radius }: SearchListingsInput) {
  const listings = await prisma.listing.findMany({
    where: { isAvailable: true },
    select: listingSelect,
    orderBy: { createdAt: 'desc' },
  })

  return listings
    .map((listing: any) => ({
      ...listing,
      distanceKm: getDistanceKm(lat, lng, listing.latitude, listing.longitude),
    }))
    .filter((listing: any) => listing.distanceKm <= radius)
    .sort((a: any, b: any) => a.distanceKm - b.distanceKm)
}

export async function createListing(ownerId: string, data: CreateListingInput) {
  const listing = await prisma.listing.create({
    data: {
      ...data,
      dailyPrice: new Prisma.Decimal(data.dailyPrice),
      ownerId,
    },
    select: listingSelect,
  })
  return listing
}

function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const earthRadiusKm = 6371
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function toRadians(value: number) {
  return (value * Math.PI) / 180
}

// ── Get single listing ────────────────────────────────────────────────────────

export async function getListingById(id: string) {
  const listing = await prisma.listing.findUnique({
    where: { id },
    select: listingSelect,
  })
  if (!listing) throw new Error('LISTING_NOT_FOUND')
  return listing
}

// ── Get my listings ───────────────────────────────────────────────────────────

export async function getMyListings(ownerId: string) {
  return prisma.listing.findMany({
    where: { ownerId },
    select: listingSelect,
    orderBy: { createdAt: 'desc' },
  })
}

// ── Browse/search listings ────────────────────────────────────────────────────

export async function browseListings(input: BrowseListingsInput) {
  const {
    query,
    category,
    minPrice,
    maxPrice,
    latitude,
    longitude,
    radiusKm,
    city,
    includeUnavailable = false,
  } = input

  const limit = clamp(input.limit ?? 20, 1, 50)
  const offset = Math.max(input.offset ?? 0, 0)
  const hasLocation = latitude != null && longitude != null

  const whereClauses: Prisma.Sql[] = []

  if (!includeUnavailable) {
    whereClauses.push(Prisma.sql`l."isAvailable" = true`)
  }

  if (category) {
    whereClauses.push(Prisma.sql`LOWER(l."category") = ${normalizeCategory(category)}`)
  }

  if (city) {
    whereClauses.push(Prisma.sql`LOWER(l."city") = ${city.trim().toLowerCase()}`)
  }

  if (minPrice != null) {
    whereClauses.push(Prisma.sql`l."dailyPrice" >= ${minPrice}`)
  }

  if (maxPrice != null) {
    whereClauses.push(Prisma.sql`l."dailyPrice" <= ${maxPrice}`)
  }

  if (query) {
    const pattern = `%${query.trim()}%`
    whereClauses.push(
      Prisma.sql`(
        l."title" ILIKE ${pattern}
        OR l."description" ILIKE ${pattern}
        OR l."category" ILIKE ${pattern}
        OR l."city" ILIKE ${pattern}
      )`
    )
  }

  const whereSql = whereClauses.length
    ? Prisma.sql`WHERE ${Prisma.join(whereClauses, ' AND ')}`
    : Prisma.empty

  const distanceSql = hasLocation
    ? buildDistanceSql(latitude as number, longitude as number)
    : Prisma.sql`NULL::double precision`

  const radiusFilterSql = hasLocation && radiusKm != null
    ? Prisma.sql`WHERE filtered."distanceKm" <= ${radiusKm}`
    : Prisma.empty

  const listingRows = await prisma.$queryRaw<BrowseListingRow[]>(Prisma.sql`
    WITH filtered AS (
      SELECT
        l."id",
        l."createdAt",
        ${distanceSql} AS "distanceKm"
      FROM "listings" l
      ${whereSql}
    )
    SELECT filtered."id", filtered."distanceKm"
    FROM filtered
    ${radiusFilterSql}
    ORDER BY
      ${hasLocation ? Prisma.sql`filtered."distanceKm" ASC NULLS LAST,` : Prisma.empty}
      filtered."createdAt" DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `)

  const countRows = await prisma.$queryRaw<CountRow[]>(Prisma.sql`
    WITH filtered AS (
      SELECT
        l."id",
        ${distanceSql} AS "distanceKm"
      FROM "listings" l
      ${whereSql}
    )
    SELECT COUNT(*) AS count
    FROM filtered
    ${radiusFilterSql}
  `)

  const listingIds = listingRows.map((row) => row.id)

  if (listingIds.length === 0) {
    return {
      items: [],
      meta: {
        total: Number(countRows[0]?.count ?? 0),
        limit,
        offset,
        hasMore: false,
      },
    }
  }

  const listings = await prisma.listing.findMany({
    where: { id: { in: listingIds } },
    select: listingSelect,
  })

  const listingById = new Map(listings.map((listing) => [listing.id, listing]))
  const distanceById = new Map(listingRows.map((row) => [row.id, row.distanceKm]))

  return {
    items: listingIds
      .map((id) => {
        const listing = listingById.get(id)
        if (!listing) return null

        return {
          ...listing,
          distanceKm: distanceById.get(id) ?? null,
        }
      })
      .filter((listing): listing is NonNullable<typeof listing> => listing !== null),
    meta: {
      total: Number(countRows[0]?.count ?? 0),
      limit,
      offset,
      hasMore: offset + listingIds.length < Number(countRows[0]?.count ?? 0),
    },
  }
}

// ── Distinct categories for browse filters ────────────────────────────────────

export async function getListingCategories() {
  const rows = await prisma.listing.findMany({
    where: { isAvailable: true },
    distinct: ['category'],
    select: { category: true },
    orderBy: { category: 'asc' },
  })

  return rows.map((row) => row.category)
}

// ── Update listing ────────────────────────────────────────────────────────────

export type UpdateListingInput = {
  title?: string
  description?: string
  category?: string
  dailyPrice?: number
  latitude?: number
  longitude?: number
  city?: string
  address?: string
}

export async function updateListing(
  id: string,
  ownerId: string,
  data: UpdateListingInput
) {
  // Verify ownership first
  const existing = await prisma.listing.findUnique({ where: { id }, select: { ownerId: true } })
  if (!existing) throw new Error('LISTING_NOT_FOUND')
  if (existing.ownerId !== ownerId) throw new Error('LISTING_FORBIDDEN')

  const cleaned: Record<string, unknown> = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined)
  )
  if (cleaned.dailyPrice !== undefined) {
    cleaned.dailyPrice = new Prisma.Decimal(cleaned.dailyPrice as number)
  }

  return prisma.listing.update({
    where: { id },
    data: cleaned,
    select: listingSelect,
  })
}

// ── Toggle availability ───────────────────────────────────────────────────────

export async function setAvailability(id: string, ownerId: string, isAvailable: boolean) {
  const existing = await prisma.listing.findUnique({ where: { id }, select: { ownerId: true } })
  if (!existing) throw new Error('LISTING_NOT_FOUND')
  if (existing.ownerId !== ownerId) throw new Error('LISTING_FORBIDDEN')

  return prisma.listing.update({
    where: { id },
    data: { isAvailable },
    select: { id: true, isAvailable: true },
  })
}

// ── Delete listing ────────────────────────────────────────────────────────────

export async function deleteListing(id: string, ownerId: string) {
  const existing = await prisma.listing.findUnique({ where: { id }, select: { ownerId: true } })
  if (!existing) throw new Error('LISTING_NOT_FOUND')
  if (existing.ownerId !== ownerId) throw new Error('LISTING_FORBIDDEN')

  await prisma.listing.delete({ where: { id } })
}

// ── Add image to listing ──────────────────────────────────────────────────────

export async function addListingImage(
  listingId: string,
  ownerId: string,
  url: string
) {
  const existing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { ownerId: true, images: { select: { order: true }, orderBy: { order: 'desc' }, take: 1 } },
  })
  if (!existing) throw new Error('LISTING_NOT_FOUND')
  if (existing.ownerId !== ownerId) throw new Error('LISTING_FORBIDDEN')

  const nextOrder = (existing.images[0]?.order ?? -1) + 1

  return prisma.listingImage.create({
    data: { listingId, url, order: nextOrder },
    select: { id: true, url: true, order: true },
  })
}

// ── Delete image from listing ─────────────────────────────────────────────────

export async function deleteListingImage(
  listingId: string,
  imageId: string,
  ownerId: string
) {
  // Verify listing ownership
  const listing = await prisma.listing.findUnique({ where: { id: listingId }, select: { ownerId: true } })
  if (!listing) throw new Error('LISTING_NOT_FOUND')
  if (listing.ownerId !== ownerId) throw new Error('LISTING_FORBIDDEN')

  const image = await prisma.listingImage.findUnique({ where: { id: imageId } })
  if (!image || image.listingId !== listingId) throw new Error('IMAGE_NOT_FOUND')

  await prisma.listingImage.delete({ where: { id: imageId } })

  return image.url // caller may want to clean up Cloudinary
}
