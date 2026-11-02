import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Image, Modal, StyleSheet, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { ResumableZoom, type ResumableZoomRefType } from 'react-native-zoom-toolkit'
import { colors } from '../theme/colors'
import { border, space } from '../theme/tokens'
import Badge from './mockup/Badge'
import Button from './mockup/Button'
import IconButton from './mockup/IconButton'
import MapPin from './mockup/MapPin'
import { TILE_SIZE, buildTileGrid, toTileFloat, tileFloatToLatLon } from '../utils/mapTiles'
import MapAttribution from './MapAttribution'

// Closer-in than the inline preview's zoom (15) — this is a fullscreen editor for
// fine positioning, not an overview.
const FULLSCREEN_ZOOM = 17
// Generous radius so ResumableZoom's clamped panning never runs past the loaded
// tile buffer (7x7 tiles = 1792px square, comfortably bigger than any phone screen).
const FULLSCREEN_RADIUS = 3
const CONTENT_SIZE = (FULLSCREEN_RADIUS * 2 + 1) * TILE_SIZE

type Coords = { latitude: number; longitude: number }

type Props = {
  visible: boolean
  latitude: number
  longitude: number
  onClose: () => void
  onConfirm: (coords: Coords) => void
}

export default function LocationMapModal({ visible, latitude, longitude, onClose, onConfirm }: Props) {
  // The tile grid is built once around this "anchor" and never re-rendered mid-gesture
  // — ResumableZoom handles pan/pinch as a pure visual transform on top of it (on the
  // UI thread, so it stays smooth). This only gets re-anchored when the modal reopens.
  const [anchor, setAnchor] = useState<Coords>({ latitude, longitude })
  const zoomRef = useRef<ResumableZoomRefType>(null)
  const insets = useSafeAreaInsets()

  useEffect(() => {
    if (visible) {
      setAnchor({ latitude, longitude })
      zoomRef.current?.reset(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  const tiles = useMemo(
    () => buildTileGrid(anchor.latitude, anchor.longitude, FULLSCREEN_ZOOM, CONTENT_SIZE, CONTENT_SIZE, FULLSCREEN_RADIUS),
    [anchor]
  )

  function handleConfirm() {
    const rect = zoomRef.current?.getVisibleRect()
    if (!rect) {
      onConfirm(anchor)
      onClose()
      return
    }

    // rect is in the tile grid's own local pixel space (see getVisibleRect in
    // react-native-zoom-toolkit) — its center is whatever point is currently under
    // the fixed pin, regardless of how far the user panned/pinched to get there.
    const localCenterX = rect.x + rect.width / 2
    const localCenterY = rect.y + rect.height / 2
    const deltaX = localCenterX - CONTENT_SIZE / 2
    const deltaY = localCenterY - CONTENT_SIZE / 2

    const anchorTile = toTileFloat(anchor.latitude, anchor.longitude, FULLSCREEN_ZOOM)
    const worldPxX = anchorTile.x * TILE_SIZE + deltaX
    const worldPxY = anchorTile.y * TILE_SIZE + deltaY

    onConfirm(tileFloatToLatLon(worldPxX / TILE_SIZE, worldPxY / TILE_SIZE, FULLSCREEN_ZOOM))
    onClose()
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.flex}>
        <View style={styles.screen}>
          <View style={styles.mapArea}>
            <ResumableZoom ref={zoomRef} minScale={1} maxScale={3} panMode="clamp">
              <View style={{ width: CONTENT_SIZE, height: CONTENT_SIZE }}>
                {tiles.map((tile) => (
                  <Image
                    key={tile.key}
                    source={{ uri: tile.uri }}
                    style={{ position: 'absolute', left: tile.left, top: tile.top, width: TILE_SIZE, height: TILE_SIZE }}
                  />
                ))}
              </View>
            </ResumableZoom>

            <MapPin size={44} />

            <View style={[styles.topBar, { top: insets.top + space.sm }]} pointerEvents="box-none">
              <View pointerEvents="none">
                <Badge label="Pinch to zoom, drag to position" variant="lime" />
              </View>
              <IconButton accessibilityLabel="Close map" onPress={onClose}>
                <Feather name="x" size={22} color={colors.ink} />
              </IconButton>
            </View>

            <MapAttribution style={styles.attribution} />
          </View>

          <View style={[styles.footer, { paddingBottom: insets.bottom + space.sm }]}>
            <Button label="Set location" onPress={handleConfirm} />
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.bg },
  mapArea: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.tan,
    borderBottomWidth: border.base,
    borderBottomColor: colors.ink,
  },
  topBar: {
    position: 'absolute',
    left: space.xxl,
    right: space.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  attribution: {
    bottom: 12,
  },
  footer: {
    paddingHorizontal: space.screen,
    paddingTop: space.lg,
    backgroundColor: colors.surface,
  },
})
