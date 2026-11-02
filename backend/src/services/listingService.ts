import prisma from '../utils/prisma'
import { LISTING_PHOTOS_MAX } from '@zoink/shared'
import { BookingStatus, Prisma } from '@prisma/client'
import type { BrowseListingsResult, ListingCardItem, ListingResponse, MyListingItem, Page } from '@zoink/shared'
import { z } from 'zod'
import { NotFoundError, ForbiddenError, BadRequestError, ConflictError } from '../utils/errors'
import { isBlockedBetween, listingOwnerNotBlockedSql } from './blockService'
import { decodeCursor, LEGACY_LIST_CAP, pageSize, splitPage, type PageParams } from '../utils/pagination'

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
  publicLatitude: true,
  publicLongitude: true,
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

// Browse/search and GET /listings/me render only the thumbnail (images[0]);
// the detail screen re-fetches GET /listings/:id for the full gallery.
const listingListSelect = {
  ...listingSelect,
  images: { ...listingSelect.images, take: 1 },
}

// Location privacy: the exact point and street address go to the listing's
// owner only. Everyone else gets the stored public point (200-500 m away, see
// the listings_public_location trigger) and no address. If the public point is
// somehow missing, fall back to ~1 km precision rather than the exact point.
function toListingResponse(
  listing: Prisma.ListingGetPayload<{ select: typeof listingSelect }>,
  viewerId?: string
): ListingResponse {
  const { publicLatitude, publicLongitude, ...rest } = listing
  const isOwner = viewerId !== undefined && viewerId === listing.ownerId
  const coarse = (value: number) => Math.round(value * 100) / 100
  return {
    ...rest,
    latitude: isOwner ? listing.latitude : publicLatitude ?? coarse(listing.latitude),
    longitude: isOwner ? listing.longitude : publicLongitude ?? coarse(listing.longitude),
    address: isOwner ? listing.address : null,
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

// Measured to the listing's PUBLIC point, never the exact one: an exact
// distance (or radius filter) from a few chosen origins would trilaterate it.
function buildDistanceSql(latitude: number, longitude: number) {
  return Prisma.sql`
    ${EARTH_RADIUS_KM} * ACOS(
      LEAST(
        1,
        GREATEST(
          -1,
          COS(RADIANS(${latitude})) * COS(RADIANS(l."publicLatitude")) * COS(RADIANS(l."publicLongitude") - RADIANS(${longitude}))
          + SIN(RADIANS(${latitude})) * SIN(RADIANS(l."publicLatitude"))
        )
      )
    )
  `
}

// Displayed distances are rounded to the nearest 0.5 km.
function roundToHalfKm(distanceKm: number | null | undefined) {
  return distanceKm == null ? null : Math.round(distanceKm * 2) / 2
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
  // When set, listings owned by anyone on the other side of a block with
  // this user are excluded (search, browse and the home feed all go here).
  viewerId?: string
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
  return toListingResponse(listing, ownerId)
}

// ── Get single listing ────────────────────────────────────────────────────────

export async function getListingById(id: string, viewerId?: string): Promise<ListingResponse> {
  const listing = await prisma.listing.findUnique({
    where: { id, deletedAt: null },
    select: listingSelect,
  })
  if (!listing) throw new NotFoundError('Listing not found.')
  // Same 404 as a missing listing, so a block isn't revealed to the blocked side.
  if (viewerId && (await isBlockedBetween(viewerId, listing.ownerId))) {
    throw new NotFoundError('Listing not found.')
  }
  return toListingResponse(listing, viewerId)
}

// ── Get my listings ───────────────────────────────────────────────────────────

// Unpaginated, for app builds from before pagination (no `limit`), capped.
export async function getMyListings(ownerId: string): Promise<ListingResponse[]> {
  const listings = await prisma.listing.findMany({
    where: { ownerId, deletedAt: null },
    select: listingListSelect,
    orderBy: { createdAt: 'desc' },
    take: LEGACY_LIST_CAP,
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

  return sorted.map((listing) => toListingResponse(listing, ownerId))
}

// Mid-rental: the grid shows "Rented out" and opens the rental instead.
const RENTED_OUT_STATUSES: BookingStatus[] = [BookingStatus.PICKUP_PENDING, BookingStatus.ACTIVE, BookingStatus.RETURN_PENDING]
const myListingsCursor = z.tuple([z.number().int(), z.string().max(64)])

type MyListingRow = {
  id: string
  activityMs: bigint
  title: string
  category: string
  dailyPrice: Prisma.Decimal
  depositAmount: Prisma.Decimal
  isAvailable: boolean
  imageId: string | null
  imageUrl: string | null
  imageOrder: number | null
  activeBookingId: string | null
}

/** GET /listings/me with `limit`: the same most-recent-activity order as
 *  getMyListings, one page in one statement, each listing with its first
 *  photo and the booking it is rented out on, if any. */
export async function listMyListingsPage(ownerId: string, params: PageParams): Promise<Page<MyListingItem>> {
  const size = pageSize(params)
  const before = params.cursor ? decodeCursor(params.cursor, myListingsCursor) : null
  const rentedOut = Prisma.join(RENTED_OUT_STATUSES.map((status) => Prisma.sql`${status}::"BookingStatus"`))

  const rows = await prisma.$queryRaw<MyListingRow[]>`
    SELECT p.id, p."activityMs", l.title, l.category, l."dailyPrice", l."depositAmount", l."isAvailable",
           img.id AS "imageId", img.url AS "imageUrl", img."order" AS "imageOrder",
           rented.id AS "activeBookingId"
    FROM (
      SELECT id, "activityMs" FROM (
        SELECT l.id,
               FLOOR(EXTRACT(EPOCH FROM COALESCE(
                 (SELECT MAX(b."updatedAt") FROM bookings b WHERE b."listingId" = l.id),
                 l."createdAt"
               )) * 1000)::bigint AS "activityMs"
        FROM listings l
        WHERE l."ownerId" = ${ownerId} AND l."deletedAt" IS NULL
      ) keyed
      ${before ? Prisma.sql`WHERE ("activityMs", id) < (${before[0]}::bigint, ${before[1]}::text)` : Prisma.empty}
      ORDER BY "activityMs" DESC, id DESC
      LIMIT ${size + 1}
    ) p
    JOIN listings l ON l.id = p.id
    LEFT JOIN LATERAL (
      SELECT i.id, i.url, i."order" FROM listing_images i
      WHERE i."listingId" = l.id ORDER BY i."order" LIMIT 1
    ) img ON true
    LEFT JOIN LATERAL (
      SELECT b.id FROM bookings b
      WHERE b."listingId" = l.id AND b.status IN (${rentedOut})
      ORDER BY b."updatedAt" DESC LIMIT 1
    ) rented ON true
    ORDER BY p."activityMs" DESC, p.id DESC
  `

  const page = splitPage(rows, size, (row) => [Number(row.activityMs), row.id])
  return {
    items: page.items.map((row) => ({
      id: row.id,
      title: row.title,
      category: row.category,
      dailyPrice: row.dailyPrice.toString(),
      depositAmount: row.depositAmount.toString(),
      isAvailable: row.isAvailable,
      images: row.imageId ? [{ id: row.imageId, url: row.imageUrl!, order: row.imageOrder! }] : [],
      activeBookingId: row.activeBookingId,
    })),
    nextCursor: page.nextCursor,
  }
}

// ── Browse/search listings ────────────────────────────────────────────────────

type BrowseFilters = {
  whereSql: Prisma.Sql
  distanceSql: Prisma.Sql
  hasLocation: boolean
  radiusFilterSql: Prisma.Sql
}

// The WHERE clause and distance expression every browse/search query shares.
function browseFilters(input: BrowseListingsInput): BrowseFilters {
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
    viewerId,
  } = input

  const hasLocation = latitude != null && longitude != null

  const whereClauses: Prisma.Sql[] = [Prisma.sql`l."deletedAt" IS NULL`]

  if (!includeUnavailable) {
    whereClauses.push(Prisma.sql`l."isAvailable" = true`)
  }

  if (viewerId) {
    whereClauses.push(listingOwnerNotBlockedSql(viewerId))
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

  return {
    whereSql: Prisma.sql`WHERE ${Prisma.join(whereClauses, ' AND ')}`,
    distanceSql: hasLocation
      ? buildDistanceSql(latitude as number, longitude as number)
      : Prisma.sql`NULL::double precision`,
    hasLocation,
    radiusFilterSql: hasLocation && radiusKm != null
      ? Prisma.sql`WHERE filtered."distanceKm" <= ${radiusKm}`
      : Prisma.empty,
  }
}

// Offset pages with a total, for app builds from before cursor pagination.
export async function browseListings(input: BrowseListingsInput): Promise<BrowseListingsResult> {
  const limit = Math.floor(clamp(input.limit ?? 20, 1, 50))
  const offset = Math.floor(Math.max(input.offset ?? 0, 0))
  const { whereSql, distanceSql, hasLocation, radiusFilterSql } = browseFilters(input)
  const { viewerId } = input

  const [listingRows, countRows] = await Promise.all([prisma.$queryRaw<BrowseListingRow[]>(Prisma.sql`
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
  `), prisma.$queryRaw<CountRow[]>(Prisma.sql`
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
  `)])

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
    select: listingListSelect,
  })

  const listingById = new Map(listings.map((listing) => [listing.id, listing]))
  const distanceById = new Map(listingRows.map((row) => [row.id, row.distanceKm]))

  return {
    items: listingIds
      .map((id) => {
        const listing = listingById.get(id)
        if (!listing) return null

        return {
          ...toListingResponse(listing, viewerId),
          distanceKm: roundToHalfKm(distanceById.get(id)),
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

// Nearest first when the caller sent a location (no public point sorts last),
// then newest; distance is keyed at 1 mm so the cursor compares exactly.
const browseCursor = z.tuple([z.string().regex(/^\d+(\.\d+)?$/), z.number().int(), z.string().max(64)])
const NO_DISTANCE_KEY = '1000000000'

type BrowsePageRow = {
  id: string
  distanceKm: number | null
  distanceKey: string
  createdMs: bigint
  ownerId: string
  title: string
  category: string
  dailyPrice: Prisma.Decimal
  depositAmount: Prisma.Decimal
  imageId: string | null
  imageUrl: string | null
  imageOrder: number | null
}

/** GET /listings with `limit` and no `offset`, or with a `cursor`: one page of
 *  result cards in one statement (no total; nothing shows it). */
export async function browseListingsPage(input: BrowseListingsInput, params: PageParams): Promise<Page<ListingCardItem>> {
  const size = Math.floor(clamp(pageSize(params), 1, 50))
  const after = params.cursor ? decodeCursor(params.cursor, browseCursor) : null
  const { whereSql, distanceSql, hasLocation, radiusFilterSql } = browseFilters(input)
  const distanceKeySql = hasLocation
    ? Prisma.sql`COALESCE(ROUND(filtered."distanceKm"::numeric, 6), ${NO_DISTANCE_KEY}::numeric)`
    : Prisma.sql`0::numeric`

  const rows = await prisma.$queryRaw<BrowsePageRow[]>`
    SELECT p.id, p."distanceKm", p."distanceKey"::text AS "distanceKey", p."createdMs",
           l."ownerId", l.title, l.category, l."dailyPrice", l."depositAmount",
           img.id AS "imageId", img.url AS "imageUrl", img."order" AS "imageOrder"
    FROM (
      SELECT * FROM (
        SELECT filtered.id, filtered."distanceKm", ${distanceKeySql} AS "distanceKey", filtered."createdMs"
        FROM (
          SELECT l.id, ${distanceSql} AS "distanceKm", FLOOR(EXTRACT(EPOCH FROM l."createdAt") * 1000)::bigint AS "createdMs"
          FROM "listings" l
          ${whereSql}
        ) filtered
        ${radiusFilterSql}
      ) keyed
      ${after
        ? Prisma.sql`WHERE keyed."distanceKey" > ${after[0]}::numeric
            OR (keyed."distanceKey" = ${after[0]}::numeric AND keyed."createdMs" < ${after[1]}::bigint)
            OR (keyed."distanceKey" = ${after[0]}::numeric AND keyed."createdMs" = ${after[1]}::bigint AND keyed.id < ${after[2]}::text)`
        : Prisma.empty}
      ORDER BY keyed."distanceKey" ASC, keyed."createdMs" DESC, keyed.id DESC
      LIMIT ${size + 1}
    ) p
    JOIN listings l ON l.id = p.id
    LEFT JOIN LATERAL (
      SELECT i.id, i.url, i."order" FROM listing_images i
      WHERE i."listingId" = l.id ORDER BY i."order" LIMIT 1
    ) img ON true
    ORDER BY p."distanceKey" ASC, p."createdMs" DESC, p.id DESC
  `

  const page = splitPage(rows, size, (row) => [row.distanceKey, Number(row.createdMs), row.id])
  return {
    items: page.items.map((row) => ({
      id: row.id,
      ownerId: row.ownerId,
      title: row.title,
      category: row.category,
      dailyPrice: row.dailyPrice.toString(),
      depositAmount: row.depositAmount.toString(),
      images: row.imageId ? [{ id: row.imageId, url: row.imageUrl!, order: row.imageOrder! }] : [],
      distanceKm: roundToHalfKm(row.distanceKm),
    })),
    nextCursor: page.nextCursor,
  }
}

// ── Distinct categories for browse filters ────────────────────────────────────

export async function getListingCategories() {
  const rows = await prisma.listing.findMany({
    where: { isAvailable: true, deletedAt: null },
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
  const existing = await prisma.listing.findUnique({ where: { id, deletedAt: null }, select: { ownerId: true } })
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
  return toListingResponse(listing, ownerId)
}

// ── Toggle availability ───────────────────────────────────────────────────────

export async function setAvailability(id: string, ownerId: string, isAvailable: boolean) {
  const existing = await prisma.listing.findUnique({ where: { id, deletedAt: null }, select: { ownerId: true } })
  if (!existing) throw new NotFoundError('Listing not found.')
  if (existing.ownerId !== ownerId) throw new ForbiddenError('You do not own this listing.')

  return prisma.listing.update({
    where: { id },
    data: { isAvailable },
    select: { id: true, isAvailable: true },
  })
}

// ── Delete listing ────────────────────────────────────────────────────────────

// A booking in one of these is still owed something (an answer, the item, the
// return), so its listing can't be deleted yet.
const OPEN_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.ACCEPTED,
  BookingStatus.CONFIRMED,
  BookingStatus.PICKUP_PENDING,
  BookingStatus.ACTIVE,
  BookingStatus.RETURN_PENDING,
]

// A listing nobody has messaged about or booked is deleted outright. One with
// history can't be (its bookings and conversations reference it, and bookings
// are kept 7 years), so it is soft-deleted: hidden from browse, search and the
// owner's list, closed to new bookings, edits and messages, its photo rows
// gone. Bookings and chats keep its title and price. Returns the photo URLs
// for the caller to delete from Cloudinary (privacy.md §7).
export async function deleteListing(id: string, ownerId: string): Promise<string[]> {
  return prisma.$transaction(async (tx) => {
    // createBooking takes a share lock on the listing before it inserts, so a
    // request can't land between the open-booking check and the delete.
    const [listing] = await tx.$queryRaw<{ ownerId: string; deletedAt: Date | null }[]>`
      SELECT "ownerId", "deletedAt" FROM listings WHERE id = ${id} FOR UPDATE
    `
    if (!listing || (listing.deletedAt && listing.ownerId !== ownerId)) throw new NotFoundError('Listing not found.')
    if (listing.ownerId !== ownerId) throw new ForbiddenError('You do not own this listing.')
    // Already deleted: a retry after a lost response.
    if (listing.deletedAt) return []

    const openBookings = await tx.booking.count({ where: { listingId: id, status: { in: OPEN_BOOKING_STATUSES } } })
    if (openBookings > 0) {
      throw new ConflictError(
        'This listing has a booking that isn\'t finished yet. Decline or cancel it, or complete the rental, then delete the listing.'
      )
    }

    const { images, _count } = await tx.listing.findUniqueOrThrow({
      where: { id },
      select: { images: { select: { url: true } }, _count: { select: { bookings: true, conversations: true } } },
    })

    if (_count.bookings === 0 && _count.conversations === 0) {
      await tx.listing.delete({ where: { id } })
    } else {
      await tx.listingImage.deleteMany({ where: { listingId: id } })
      await tx.listing.update({ where: { id }, data: { deletedAt: new Date(), isAvailable: false } })
    }
    return images.map((image) => image.url)
  })
}

// ── Add image to listing ──────────────────────────────────────────────────────

// Matches the create-listing screen's limit.
// Defined in @zoink/shared so the app's photo counter uses the same cap.
export const MAX_LISTING_IMAGES = LISTING_PHOTOS_MAX

// Runs BEFORE the file is sent to Cloudinary, so nobody can push files into
// Zoink's Cloudinary account through a listing they don't own, and a listing
// can't collect an unbounded number of photos.
export async function assertCanAddListingImage(listingId: string, ownerId: string) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId, deletedAt: null },
    select: { ownerId: true, _count: { select: { images: true } } },
  })
  if (!listing) throw new NotFoundError('Listing not found.')
  if (listing.ownerId !== ownerId) throw new ForbiddenError('You do not own this listing.')
  if (listing._count.images >= MAX_LISTING_IMAGES) {
    throw new BadRequestError(`A listing can have at most ${MAX_LISTING_IMAGES} photos.`)
  }
}

export async function addListingImage(
  listingId: string,
  ownerId: string,
  url: string
) {
  const existing = await prisma.listing.findUnique({
    where: { id: listingId, deletedAt: null },
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
  const listing = await prisma.listing.findUnique({ where: { id: listingId, deletedAt: null }, select: { ownerId: true } })
  if (!listing) throw new NotFoundError('Listing not found.')
  if (listing.ownerId !== ownerId) throw new ForbiddenError('You do not own this listing.')

  const image = await prisma.listingImage.findUnique({ where: { id: imageId } })
  if (!image || image.listingId !== listingId) throw new NotFoundError('Image not found.')

  await prisma.listingImage.delete({ where: { id: imageId } })

  return image.url // caller may want to clean up Cloudinary
}
