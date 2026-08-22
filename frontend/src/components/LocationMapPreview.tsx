import React, { useMemo, useState } from 'react'
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { theme } from '../theme/colors'
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
    () => buildTileGrid(latitude, longitude, zoom, width, height, GRID_RADIUS),
    [latitude, longitude, zoom, width, height]
  )

  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.85 : 1}
      style={[styles.container, { height }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onPress={onPress}
      disabled={!onPress}
    >
      {tiles.map((tile) => (
        <Image
          key={tile.key}
          source={{ uri: tile.uri }}
          style={{ position: 'absolute', left: tile.left, top: tile.top, width: TILE_SIZE, height: TILE_SIZE }}
        />
      ))}
      <View style={styles.circle} pointerEvents="none" />
      {hint ? (
        <Text style={styles.hint} pointerEvents="none">
          {hint}
        </Text>
      ) : null}
      <MapAttribution />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: theme.surfaceSubdued,
    borderWidth: 2,
    borderColor: theme.primary,
  },
  circle: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 108,
    height: 108,
    marginTop: -54,
    marginLeft: -54,
    borderRadius: 54,
    backgroundColor: theme.primary,
    opacity: 0.3,
  },
  hint: {
    position: 'absolute',
    top: 8,
    left: 8,
    fontSize: 11,
    fontWeight: '700',
    color: theme.textOnPrimary,
    backgroundColor: theme.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
})
