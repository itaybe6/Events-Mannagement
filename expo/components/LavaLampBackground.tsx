import React, { useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const NAVY_DEEP = '#010c21';

const LAVA_LAMP_BLOBS = [
  { color: '#1A3A70', opacity: 0.72 },
  { color: '#264E91', opacity: 0.58 },
  { color: '#4169B4', opacity: 0.48 },
  { color: '#5E80C2', opacity: 0.38 },
] as const;

function randomNumber(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

type LavaLampCircleData = {
  radius: number;
  index: number;
  color: string;
  opacity: number;
  originX: number;
  originY: number;
  travel: number;
  duration: number;
  scaleTo: number;
};

type SoftBlobProps = {
  size: number;
  color: string;
  opacity: number;
  gradientId: string;
};

function SoftBlob({ size, color, opacity, gradientId }: SoftBlobProps) {
  const r = size / 2;

  return (
    <Svg width={size} height={size} style={styles.blobSvg}>
      <Defs>
        <RadialGradient id={gradientId} cx="50%" cy="45%" rx="50%" ry="50%">
          <Stop offset="0%" stopColor={color} stopOpacity={opacity} />
          <Stop offset="35%" stopColor={color} stopOpacity={opacity * 0.72} />
          <Stop offset="62%" stopColor={color} stopOpacity={opacity * 0.28} />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={r} cy={r} r={r} fill={`url(#${gradientId})`} />
    </Svg>
  );
}

function LavaLampCircle({ circle }: { circle: LavaLampCircleData }) {
  const rotation = useDerivedValue(() =>
    withRepeat(
      withSequence(
        withTiming(0, { duration: 0 }),
        withTiming(360, {
          duration: circle.duration,
          easing: Easing.linear,
        })
      ),
      -1,
      false
    )
  );

  const scale = useDerivedValue(() =>
    withRepeat(
      withSequence(
        withTiming(circle.scaleTo, {
          duration: Math.round(circle.duration * 0.45),
          easing: Easing.inOut(Easing.ease),
        }),
        withTiming(1, {
          duration: Math.round(circle.duration * 0.55),
          easing: Easing.inOut(Easing.ease),
        })
      ),
      -1,
      true
    )
  );

  const orbitStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }, { scale: scale.value }],
  }));

  const size = circle.radius * 2;

  return (
    <Animated.View
      style={[
        styles.lavaLampOrbit,
        orbitStyle,
        {
          left: circle.originX,
          top: circle.originY,
        },
      ]}
    >
      <View
        style={[
          styles.lavaLampBlob,
          {
            width: size,
            height: size,
            transform: [{ translateX: circle.travel }, { translateY: -circle.radius * 0.35 }],
          },
        ]}
      >
        <SoftBlob
          size={size}
          color={circle.color}
          opacity={circle.opacity}
          gradientId={`lava-grad-${circle.index}`}
        />
      </View>
    </Animated.View>
  );
}

type LavaLampBackgroundProps = {
  height: number;
  width?: number;
  baseColor?: string;
};

export function LavaLampBackground({
  height,
  width = SCREEN_WIDTH,
  baseColor = NAVY_DEEP,
}: LavaLampBackgroundProps) {
  const circles = useMemo<LavaLampCircleData[]>(
    () =>
      LAVA_LAMP_BLOBS.map((blob, index) => {
        const radius = (width * randomNumber(42, 68)) / 100;
        const safeX = Math.max(radius * 0.35, width - radius * 0.35);
        const safeY = Math.max(radius * 0.25, height - radius * 0.25);

        return {
          radius,
          index,
          color: blob.color,
          opacity: blob.opacity,
          originX: randomNumber(Math.round(radius * 0.15), Math.round(safeX)),
          originY: randomNumber(Math.round(radius * 0.1), Math.round(safeY)),
          travel: randomNumber(18, 56),
          duration: randomNumber(14000, 22000),
          scaleTo: randomNumber(110, 132) / 100,
        };
      }),
    [height, width]
  );

  return (
    <View style={styles.lavaLampLayer} pointerEvents="none">
      <View style={[styles.lavaLampBase, { backgroundColor: baseColor }]} />
      {circles.map((circle) => (
        <LavaLampCircle key={`lava-${circle.index}`} circle={circle} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  lavaLampLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  lavaLampBase: {
    ...StyleSheet.absoluteFillObject,
  },
  lavaLampOrbit: {
    position: 'absolute',
    width: 1,
    height: 1,
  },
  lavaLampBlob: {
    position: 'absolute',
    overflow: 'visible',
  },
  blobSvg: {
    overflow: 'visible',
  },
});
