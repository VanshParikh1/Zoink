import prisma from '../utils/prisma'
import { Prisma } from '@prisma/client'
import type { BrowseListingsResult, ListingResponse } from '@zoink/shared'
import { NotFoundError, ForbiddenError, BadRequestError } from '../utils/errors'

// ── Prohibited items (terms.md §6) ───────────────────────────────────────────
// A blunt keyword heuristic, not a moderation system — it exists to catch the
// obvious, egregious case (a firearm or a car listed for rent) before it ever
// goes live, cheaply. It will have false positives (e.g. "gun" inside another
// word) and false negatives (evasive spelling); the Report flow and Zoink's
// takedown rights in §6 remain the real backstop. See legal/OPEN-ITEMS.md B6.
const PROHIBITED_ITEM_PATTERNS: RegExp[] = [
  /\bfirearms?\b/i,
  /\bammo\b|\bammunition\b/i,
  /\b(hand)?gun[s]?\b/i,
  /\brifle[s]?\b/i,
  /\bweapon[s]?\b/i,
  /\balcohol\b|\bbooze\b/i,
  /\btobacco\b|\bcigarettes?\b|\bvape[s]?\b|\bvaping\b/i,
  /\bcannabis\b|\bmarijuana\b|\bweed\b/i,
  /\bprescription\b/i,
  /\bmedical device[s]?\b/i,
  /\bmotor ?cycle[s]?\b|\bmoped[s]?\b/i,
  /\be-?bike[s]?\b/i,
  /\b(used )?car[s]?\b|\bvehicle[s]?\b|\bautomobile[s]?\b/i,
  /\bpuppy|\bpuppies|\bkitten[s]?\b|\bpet[s]?\b|\blive animal[s]?\b/i,
  /\bcounterfeit\b|\breplica (firearm|gun)/i,
  /\bstolen\b/i,
  /\bspy camera\b|\bhidden camera\b|\bsurveillance\b/i,
  /\bchild car seat[s]?\b|\bcar seat[s]?\b/i,
]

function assertNoProhibitedContent(fields: { title?: string; description?: string; category?: string }) {
  const haystack = [fields.title, fields.description, fields.category].filter(Boolean).join(' \n ')
  if (!haystack) return

  const match = PROHIBITED_ITEM_PATTERNS.find((pattern) => pattern.test(haystack))
  if (match) {
    throw new BadRequestError(
      'This listing appears to include an item Zoink does not allow (see our Terms of Service, section 6 — Prohibited items). ' +
        'If this is a false match, contact zoinksupport@gmail.com.'
    )
  }
}

// ── Shared select shape ───────────────────────────────────────────────────────

const listingSelect = {
  id: true,
  title: true,
  description: true,
  category: true,
  dailyPrice: true,
  itemValue: true,
  depositAmount: true,
  isAvailable: true,
  avgRating: true,
  reviewCount: true,
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

function toListingResponse(listing: Prisma.ListingGetPayload<{ select: typeof listingSelect }>): ListingResponse {
  return {
    ...listing,
    dailyPrice: listing.dailyPrice.toString(),
    itemValue: listing.itemValue.toString(),
    depositAmount: listing.depositAmount.toString(),
    createdAt: listing.createdAt.toISOString(),
    updatedAt: listing.updatedAt.toISOString(),
  }
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
  itemValue?: number
  depositAmount?: number
  latitude: number
  longitude: number
  city: string
  address?: string
}

export async function createListing(ownerId: string, data: CreateListingInput): Promise<ListingResponse> {
  assertNoProhibitedContent(data)

  const listing = await prisma.listing.create({
    data: {
      ...data,
      dailyPrice: new Prisma.Decimal(data.dailyPrice),
      itemValue: new Prisma.Decimal(data.itemValue ?? 0),
      depositAmount: new Prisma.Decimal(data.depositAmount ?? 0),
      ownerId,
    },
    select: listingSelect,
  })
  return toListingResponse(listing)
}

// ── Get single listing ────────────────────────────────────────────────────────

export async function getListingById(id: string): Promise<ListingResponse> {
  const listing = await prisma.listing.findUnique({
    where: { id },
    select: listingSelect,
  })
  if (!listing) throw new NotFoundError('Listing not found.')
  return toListingResponse(listing)
}

// ── Get my listings ───────────────────────────────────────────────────────────

export async function getMyListings(ownerId: string): Promise<ListingResponse[]> {
  const listings = await prisma.listing.findMany({
    where: { ownerId },
    select: listingSelect,
  })

  if (listings.length === 0) return []

  // "Most recent activity" for a listing means the most recent booking made
  // against it (any status change bumps Booking.updatedAt), NOT the
  // listing's own updatedAt — editing price/description shouldn't bump a
  // listing up this list on its own. Computed via an aggregate query rather
  // than a denormalized column: this app already has booking-status writes
  // spread across bookingService/handoffService/cleanupJob, and a
  // denormalized lastActivityAt would be one more place all of those would
  // need to remember to touch. A listing with no bookings at all falls back
  // to its own createdAt, landing wherever that puts it relative to listings
  // that do have activity.
  const activity = await prisma.booking.groupBy({
    by: ['listingId'],
    where: { listingId: { in: listings.map((listing) => listing.id) } },
    _max: { updatedAt: true },
  })
  const lastActivityByListingId = new Map(activity.map((row) => [row.listingId, row._max.updatedAt]))

  const sorted = [...listings].sort((a, b) => {
    const aTime = (lastActivityByListingId.get(a.id) ?? a.createdAt).getTime()
    const bTime = (lastActivityByListingId.get(b.id) ?? b.createdAt).getTime()
    return bTime - aTime
  })

  return sorted.map(toListingResponse)
}

// ── Browse/search listings ────────────────────────────────────────────────────

export async function browseListings(input: BrowseListingsInput): Promise<BrowseListingsResult> {
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
          ...toListingResponse(listing),
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
  itemValue?: number
  depositAmount?: number
  latitude?: number
  longitude?: number
  city?: string
  address?: string
}

export async function updateListing(
  id: string,
  ownerId: string,
  data: UpdateListingInput
): Promise<ListingResponse> {
  // Verify ownership first
  const existing = await prisma.listing.findUnique({ where: { id }, select: { ownerId: true } })
  if (!existing) throw new NotFoundError('Listing not found.')
  if (existing.ownerId !== ownerId) throw new ForbiddenError('You do not own this listing.')

  assertNoProhibitedContent(data)

  const cleaned: Record<string, unknown> = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined)
  )
  if (cleaned.dailyPrice !== undefined) {
    cleaned.dailyPrice = new Prisma.Decimal(cleaned.dailyPrice as number)
  }
  if (cleaned.itemValue !== undefined) {
    cleaned.itemValue = new Prisma.Decimal(cleaned.itemValue as number)
  }
  if (cleaned.depositAmount !== undefined) {
    cleaned.depositAmount = new Prisma.Decimal(cleaned.depositAmount as number)
  }

  const listing = await prisma.listing.update({
    where: { id },
    data: cleaned,
    select: listingSelect,
  })
  return toListingResponse(listing)
}

// ── Toggle availability ───────────────────────────────────────────────────────

export async function setAvailability(id: string, ownerId: string, isAvailable: boolean) {
  const existing = await prisma.listing.findUnique({ where: { id }, select: { ownerId: true } })
  if (!existing) throw new NotFoundError('Listing not found.')
  if (existing.ownerId !== ownerId) throw new ForbiddenError('You do not own this listing.')

  return prisma.listing.update({
    where: { id },
    data: { isAvailable },
    select: { id: true, isAvailable: true },
  })
}

// ── Delete listing ────────────────────────────────────────────────────────────

export async function deleteListing(id: string, ownerId: string) {
  const existing = await prisma.listing.findUnique({ where: { id }, select: { ownerId: true } })
  if (!existing) throw new NotFoundError('Listing not found.')
  if (existing.ownerId !== ownerId) throw new ForbiddenError('You do not own this listing.')

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
  if (!existing) throw new NotFoundError('Listing not found.')
  if (existing.ownerId !== ownerId) throw new ForbiddenError('You do not own this listing.')

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
  if (!listing) throw new NotFoundError('Listing not found.')
  if (listing.ownerId !== ownerId) throw new ForbiddenError('You do not own this listing.')

  const image = await prisma.listingImage.findUnique({ where: { id: imageId } })
  if (!image || image.listingId !== listingId) throw new NotFoundError('Image not found.')

  await prisma.listingImage.delete({ where: { id: imageId } })

  return image.url // caller may want to clean up Cloudinary
}
