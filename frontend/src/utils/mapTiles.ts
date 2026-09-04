export const TILE_SIZE = 256

const MAPTILER_API_KEY = process.env.EXPO_PUBLIC_MAPTILER_API_KEY ?? ''

// Whether the app is actually pulling tiles from MapTiler right now — used by
// MapAttribution to show credit matching the tile source in use.
export const usingMapTiler = MAPTILER_API_KEY.length > 0

let warnedAboutMissingKey = false

function tileUrl(zoom: number, x: number, y: number): string {
  if (usingMapTiler) {
    return `https://api.maptiler.com/maps/streets-v2/${zoom}/${x}/${y}.png?key=${MAPTILER_API_KEY}`
  }

  if (!__DEV__) {
    // Never let a production build silently hit raw OSM tiles — that violates
    // OSM's tile usage policy (no custom User-Agent, no rate limiting) and is
    // exactly what gets an app's traffic blocked. Fail loudly instead so this
    // is caught before shipping rather than discovered via a blocked map in
    // the field.
    throw new Error(
      'EXPO_PUBLIC_MAPTILER_API_KEY is unset in a production build. Raw tile.openstreetmap.org ' +
      'tiles are dev-only (see mapTiles.ts) — set a real MapTiler key before shipping.'
    )
  }

  if (!warnedAboutMissingKey) {
    warnedAboutMissingKey = true
    console.warn(
      'EXPO_PUBLIC_MAPTILER_API_KEY is unset — falling back to raw tile.openstreetmap.org tiles. ' +
      'This is fine for local dev but production traffic needs a real MapTiler key (see README).'
    )
  }

  return `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`
}

export function toTileFloat(latitude: number, longitude: number, zoom: number) {
  const n = 2 ** zoom
  const latRad = (latitude * Math.PI) / 180
  const x = ((longitude + 180) / 360) * n
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  return { x, y }
}

export function tileFloatToLatLon(x: number, y: number, zoom: number) {
  const n = 2 ** zoom
  const longitude = (x / n) * 360 - 180
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)))
  const latitude = (latRad * 180) / Math.PI
  return { latitude, longitude }
}

export type MapTile = { key: string; uri: string; left: number; top: number }

// Builds the set of OSM tiles needed to fill a width x height viewport centered
// on (centerLat, centerLon), plus each tile's pixel offset within that viewport.
export function buildTileGrid(
  centerLat: number,
  centerLon: number,
  zoom: number,
  width: number,
  height: number,
  radius = 1
): MapTile[] {
  if (!width || !height) return []

  const center = toTileFloat(centerLat, centerLon, zoom)
  const centerTileX = Math.floor(center.x)
  const centerTileY = Math.floor(center.y)
  const worldPxX = center.x * TILE_SIZE
  const worldPxY = center.y * TILE_SIZE
  const tileCount = 2 ** zoom

  const tiles: MapTile[] = []
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      const tileY = centerTileY + dy
      if (tileY < 0 || tileY >= tileCount) continue
      const rawTileX = centerTileX + dx
      const tileX = ((rawTileX % tileCount) + tileCount) % tileCount

      tiles.push({
        key: `${dx}-${dy}`,
        uri: tileUrl(zoom, tileX, tileY),
        left: rawTileX * TILE_SIZE - worldPxX + width / 2,
        top: tileY * TILE_SIZE - worldPxY + height / 2,
      })
    }
  }
  return tiles
}
