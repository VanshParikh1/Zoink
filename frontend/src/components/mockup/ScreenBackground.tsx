import React, { useState } from 'react'
import { LayoutChangeEvent, StyleSheet, View } from 'react-native'
import Svg, { Defs, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg'
import { colors } from '../../theme/colors'

type Glow = 'topLeft' | 'topRight' | 'bottomRight'

type Props = {
  glow?: Glow
}

const TILE = 24
const GLOW_RADIUS = 260

/**
 * Mockup backdrop: bg fill, a 24px diagonal hatch and an optional green corner
 * glow. The hatch tile is the SVG version of CSS
 * `linear-gradient(135deg, rgba(4,15,15,0.045) 25%, transparent 25%)`: at 135deg
 * the 25% stop is the line x + y = 12 in a 24px tile, so each tile gets an ink
 * triangle in its top-left corner.
 */
export default function ScreenBackground({ glow }: Props) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    if (!size || size.width !== width || size.height !== height) setSize({ width, height })
  }

  const glowCenter =
    size && glow
      ? {
          topLeft: { cx: 0, cy: 0 },
          topRight: { cx: size.width, cy: 0 },
          bottomRight: { cx: size.width, cy: size.height },
        }[glow]
      : null

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={handleLayout}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="hatch" patternUnits="userSpaceOnUse" x={0} y={0} width={TILE} height={TILE}>
            <Path d={`M0 0 H${TILE / 2} L0 ${TILE / 2} Z`} fill={colors.ink} fillOpacity={0.045} />
          </Pattern>
          {glowCenter ? (
            <RadialGradient
              id="glow"
              gradientUnits="userSpaceOnUse"
              cx={glowCenter.cx}
              cy={glowCenter.cy}
              r={GLOW_RADIUS}
              fx={glowCenter.cx}
              fy={glowCenter.cy}
            >
              <Stop offset="0" stopColor={colors.green} stopOpacity={0.22} />
              <Stop offset="1" stopColor={colors.green} stopOpacity={0} />
            </RadialGradient>
          ) : null}
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={colors.bg} />
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#hatch)" />
        {glowCenter ? <Rect x={0} y={0} width="100%" height="100%" fill="url(#glow)" /> : null}
      </Svg>
    </View>
  )
}
