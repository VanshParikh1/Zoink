import { ListingBrowseItem } from '../../types'

// Display formatting shared by ListingCard (rows) and ListingGridCard (grid).

export type ListingCardData = Pick<ListingBrowseItem, 'title' | 'category' | 'dailyPrice' | 'depositAmount' | 'images'> & {
  distanceKm?: number | null
}

/** The badge on listings the owner has set a deposit for. */
export const DEPOSIT_BACKED = 'Deposit-backed'

/** Whole dollars when the amount is whole, otherwise cents: "$24", "$12.50". */
function formatDollars(amount: string | number): string {
  const n = Number(amount)
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`
}

/** "$24 / day" */
export function dailyPriceLabel(dailyPrice: string | number): string {
  return `${formatDollars(dailyPrice)} / day`
}

/** "1.2 km", only when the API already computed a distance; never estimated here. */
export function distanceLabel(distanceKm: number | null | undefined): string | null {
  return typeof distanceKm === 'number' ? `${distanceKm.toFixed(1)} km` : null
}

/** Everything a listing card shows as text, plus its screen-reader summary. */
export function listingDisplay(listing: ListingCardData) {
  const price = dailyPriceLabel(listing.dailyPrice)
  const distance = distanceLabel(listing.distanceKm)
  // Deposits are optional; "0" means none. Cards say "Deposit-backed"; the
  // amount is on the listing itself (depositHeld).
  const hasDeposit = Number(listing.depositAmount) > 0
  const deposit = hasDeposit ? DEPOSIT_BACKED : null
  const depositHeld = hasDeposit ? `${formatDollars(listing.depositAmount)} held` : null

  const accessibilityLabel = [
    listing.title,
    `${formatDollars(listing.dailyPrice)} per day`,
    distance ? `${distance} away` : null,
    deposit ? `${formatDollars(listing.depositAmount)} deposit held` : null,
  ]
    .filter(Boolean)
    .join(', ')

  return {
    priceLine: distance ? `${price} · ${distance}` : price,
    deposit,
    depositHeld,
    imageUrl: listing.images?.[0]?.url,
    accessibilityLabel,
  }
}
