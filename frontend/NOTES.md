# Frontend Notes

## Recent UI Theme Changes

- Updated Zoink to use the requested palette:
  - Electric Green `#00EF20` as the primary action/accent color.
  - Ink Black `#040F0F` for high-contrast buttons and text accents.
  - Forest Green `#248232` as the deeper green accent.
  - Jet Black `#2D3A3A` remains available for darker surfaces when needed.
  - Light mocha porcelain `#F4EDE1` as the main app background.
  - Cream surface `#FFF9EF` for cards and form inputs.
  - Light shadow grey `#D8D1C7` for soft depth.

- Added shared theme tokens in `src/theme/colors.ts`.
- Updated auth, verification, home, listing, create listing, edit listing, and my listings screens to use the shared theme.
- Changed the Home screen `My listings` button to black with electric-green text.
- Updated Expo app config:
  - App name is now `Zoink`.
  - Slug is now `zoink`.
  - UI style is light.
  - Splash background uses the light mocha porcelain color.
  - Android adaptive icon background uses Electric Green.

## Temporary Logo Placeholder

- Added `src/components/LogoPlaceholder.tsx`.
- This is a small temporary in-app logo component using a green block with a `Z` / `zoink` text mark.
- It appears in auth screens, verification screens, Home, Create Listing, Edit Listing, Listing Detail empty-photo state, and My Listings empty/image-placeholder states.
- Replace this later with real image assets once final branding is ready.

## Week 3 Listing Frontend

- Home feed now loads nearby listings using `GET /listings?lat=...&lng=...&radius=...`.
- Home feed requests device location and falls back to downtown Toronto if permission is denied.
- Create Listing supports:
  - title
  - description
  - category
  - daily price
  - city
  - optional address
  - required latitude/longitude
  - current-location autofill
  - up to 8 photos

- Listing Detail supports:
  - photo carousel
  - no-photo placeholder
  - availability badge
  - price, category, location, description
  - owner info
  - owner-only edit, availability toggle, and delete actions

- My Listings supports:
  - owner listing list
  - empty state
  - navigation to detail
  - create listing shortcut

- Edit Listing supports:
  - edit fields
  - add listing photo
  - remove listing photo

## Demo Mode

- Added `EXPO_PUBLIC_DEMO_MODE=true` support so the frontend can run without dev1/backend.
- Demo mode lives behind an environment flag and does not affect real backend testing unless enabled.
- In demo mode:
  - login works with any email/password
  - register works locally
  - the user is treated as verified
  - nearby feed uses local mock listings
  - create listing works in memory
  - detail/edit/my-listings/availability/delete/photo actions use local mock state

To enable:

```env
EXPO_PUBLIC_DEMO_MODE=true
```

To use the real backend again:

```env
EXPO_PUBLIC_DEMO_MODE=false
```

Then restart Expo with cache clear:

```powershell
.\node_modules\.bin\expo.cmd start -c
```

## Frontend API/Auth Notes

- `src/services/api.ts` now uses the same token key as `AuthContext`: `zoink_jwt`.
- `src/services/listingsApi.ts` switches between real API calls and mock demo calls based on `EXPO_PUBLIC_DEMO_MODE`.
- `src/services/mockListings.ts` stores mock listings in memory for local UI testing.
- `src/config/demoMode.ts` contains the demo flag, demo token, and demo user.

## Verification

- Frontend TypeScript check passes:

```powershell
cd frontend
.\node_modules\.bin\tsc.cmd --noEmit
```

## Backend-Related Note From This Frontend Pass

- Added local backend geo-search support for `GET /listings?lat=...&lng=...&radius=...` so the Home feed endpoint exists in this repo.
- Backend typecheck is currently blocked by broader backend dependency/version issues unrelated to the frontend UI pass, including Prisma package/version mismatch and module/type resolution for backend upload dependencies.
