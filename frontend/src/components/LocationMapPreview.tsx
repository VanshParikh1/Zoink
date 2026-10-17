import React, { useMemo, useState } from 'react'
import { Image, StyleSheet, TouchableOpacity, View } from 'react-native'
import { colors } from '../theme/colors'
import { border, radius, space } from '../theme/tokens'
import Badge from './mockup/Badge'
import MapPin from './mockup/MapPin'
import { TILE_SIZE, buildTileGrid } from '../utils/mapTiles'
import MapAttribution from './MapAttribution'

// Static preview only — dragging tiles directly here (the old PanResponder-driven
// implementation) was laggy, since translating a stack of raster Image tiles on the
// JS thread janks badly. Real panning/zooming now happens in LocationMapModal
// (react-native-zoom-toolkit, gesture-handler/reanimated, runs on the UI thread);
// tapping this preview just opens that fullscreen editor.
const GRID_RADIUS = 2

type Props = {
  latitude: number
  longitude: number
  onPress?: () => void
  height?: number
  zoom?: number
  hint?: string | null
}

export default function LocationMapPreview({
  latitude,
  longitude,
  onPress,
  height = 200,
  zoom = 15,
  hint = 'Tap to fine-tune the exact spot',
}: Props) {
  const [width, setWidth] = useState(0)

  const tiles = useMemo(
    // Static preview: only the tiles that are actually on screen (typically
    // 4-6 of the 25 in the grid), each one a billed MapTiler request.
    () => buildTileGrid(latitude, longitude, zoom, width, height, GRID_RADIUS, true),
    [latitude, longitude, zoom, width, height]
  )

  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.85 : 1}
      style={[styles.container, { height }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'image'}
      accessibilityLabel={onPress ? 'Pickup area map. Opens the full-screen map to adjust the spot' : 'Approximate pickup area map'}
    >
      {tiles.map((tile) => (
        <Image
          key={tile.key}
          source={{ uri: tile.uri }}
          style={{ position: 'absolute', left: tile.left, top: tile.top, width: TILE_SIZE, height: TILE_SIZE }}
        />
      ))}
      <MapPin size={108} />
      {hint ? (
        <View style={styles.hint} pointerEvents="none">
          <Badge label={hint} variant="lime" />
        </View>
      ) : null}
      <MapAttribution />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: colors.tan,
    borderWidth: border.base,
    borderColor: colors.ink,
  },
  hint: {
    position: 'absolute',
    top: space.sm,
    left: space.sm,
  },
})
