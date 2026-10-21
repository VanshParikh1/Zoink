import type { InfiniteData } from '@tanstack/react-query'
import type { BookingListItem, BookingListPage } from '@zoink/shared'
import type { Booking } from '../types'
import { queryClient } from './queryClient'
import { queryKeys } from './queryKeys'

function toListItem(booking: Booking): BookingListItem {
  return {
    id: booking.id,
    status: booking.status,
    startDate: booking.startDate,
    endDate: booking.endDate,
    totalPrice: booking.totalPrice,
    ownerPayout: booking.ownerPayout,
    listingId: booking.listingId,
    renterId: booking.renterId,
    ownerId: booking.ownerId,
    listing: {
      id: booking.listing.id,
      title: booking.listing.title,
      category: booking.listing.category,
      dailyPrice: booking.listing.dailyPrice,
      images: booking.listing.images.slice(0, 1),
    },
    renter: { id: booking.renter.id, firstName: booking.renter.firstName, lastName: booking.renter.lastName },
    owner: { id: booking.owner.id, firstName: booking.owner.firstName, lastName: booking.owner.lastName },
  }
}

/**
 * A booking changed (accept, decline, cancel, pay, a handoff step): show the
 * new state everywhere it's cached at once, then refetch what else it can
 * move (other requests auto-declined on accept, the inbox's payment prompt,
 * My listings' "Rented out").
 */
export function applyBookingUpdate(updated: Booking) {
  queryClient.setQueryData(queryKeys.booking(updated.id), updated)
  for (const party of ['renter', 'owner'] as const) {
    queryClient.setQueryData<InfiniteData<BookingListPage>>(queryKeys.bookingList(party), (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              items: page.items.map((item) => (item.id === updated.id ? toListItem(updated) : item)),
            })),
          }
        : data
    )
  }
  queryClient.invalidateQueries({ queryKey: ['bookings', 'list'] })
  queryClient.invalidateQueries({ queryKey: queryKeys.inbox })
  queryClient.invalidateQueries({ queryKey: queryKeys.myListings })
}
