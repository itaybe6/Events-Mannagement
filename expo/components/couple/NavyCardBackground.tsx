import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type StarSpec = {
  top: string;
  left: string;
  size: number;
  delay: number;
  duration: number;
  minOpacity: number;
  maxOpacity: number;
};

const FULL_STARS: StarSpec[] = [
  { top: '12%', left: '8%', size: 2, delay: 0, duration: 2200, minOpacity: 0.2, maxOpacity: 0.95 },
  { top: '22%', left: '72%', size: 3, delay: 400, duration: 2800, minOpacity: 0.15, maxOpacity: 1 },
  { top: '38%', left: '44%', size: 2, delay: 900, duration: 1900, minOpacity: 0.25, maxOpacity: 0.85 },
  { top: '55%', left: '18%', size: 2, delay: 200, duration: 3100, minOpacity: 0.2, maxOpacity: 0.9 },
  { top: '68%', left: '80%', size: 3, delay: 700, duration: 2400, minOpacity: 0.18, maxOpacity: 1 },
  { top: '78%', left: '52%', size: 2, delay: 1100, duration: 2600, minOpacity: 0.22, maxOpacity: 0.88 },
  { top: '30%', left: '88%', size: 2, delay: 300, duration: 2000, minOpacity: 0.2, maxOpacity: 0.92 },
  { top: '48%', left: '6%', size: 3, delay: 600, duration: 3400, minOpacity: 0.12, maxOpacity: 0.95 },
  { top: '62%', left: '36%', size: 2, delay: 1000, duration: 2100, minOpacity: 0.25, maxOpacity: 0.8 },
  { top: '18%', left: '28%', size: 2, delay: 150, duration: 2700, minOpacity: 0.2, maxOpacity: 0.9 },
  { top: '84%', left: '24%', size: 2, delay: 800, duration: 2300, minOpacity: 0.18, maxOpacity: 0.85 },
  { top: '8%', left: '58%', size: 3, delay: 500, duration: 3000, minOpacity: 0.15, maxOpacity: 1 },
];

const COMPACT_STARS: StarSpec[] = FULL_STARS.slice(0, 6);

function TwinklingStar({ spec }: { spec: StarSpec }) {
  const opacity = useRef(new Animated.Value(spec.minOpacity)).current;

  useEffect(() => {
    const twinkle = Animated.loop(
      Animated.sequence([
        Animated.delay(spec.delay),
        Animated.timing(opacity, {
          toValue: spec.maxOpacity,
          duration: spec.duration / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: spec.minOpacity,
          duration: spec.duration / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    twinkle.start();
    return () => twinkle.stop();
  }, [opacity, spec]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.star,
        {
          top: spec.top as `${number}%`,
          left: spec.left as `${number}%`,
          width: spec.size,
          height: spec.size,
          borderRadius: spec.size / 2,
          opacity,
        },
      ]}
    />
  );
}

function PulsingGlow({
  style,
  duration,
  delay = 0,
}: {
  style: object;
  duration: number;
  delay?: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.16)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1.22,
            duration: duration / 2,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.32,
            duration: duration / 2,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1,
            duration: duration / 2,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.14,
            duration: duration / 2,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [delay, duration, opacity, scale]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[style, { opacity, transform: [{ scale }] }]}
    />
  );
}

function DriftingAurora() {
  const shift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const drift = Animated.loop(
      Animated.sequence([
        Animated.timing(shift, {
          toValue: 1,
          duration: 7000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(shift, {
          toValue: 0,
          duration: 7000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    drift.start();
    return () => drift.stop();
  }, [shift]);

  const translateX = shift.interpolate({
    inputRange: [0, 1],
    outputRange: [-28, 36],
  });
  const translateY = shift.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -18],
  });
  const auroraOpacity = shift.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.12, 0.28, 0.14],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.auroraWrap,
        {
          opacity: auroraOpacity,
          transform: [{ translateX }, { translateY }],
        },
      ]}
    >
      <LinearGradient
        colors={['rgba(126,168,232,0)', 'rgba(126,168,232,0.45)', 'rgba(94,214,160,0.12)', 'rgba(126,168,232,0)']}
        start={{ x: 0, y: 0.2 }}
        end={{ x: 1, y: 0.8 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

type NavyCardBackgroundProps = {
  variant?: 'full' | 'compact';
};

export function NavyCardBackground({ variant = 'full' }: NavyCardBackgroundProps) {
  const stars = variant === 'compact' ? COMPACT_STARS : FULL_STARS;
  const isCompact = variant === 'compact';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <DriftingAurora />
      <PulsingGlow
        style={[styles.glowOrb, isCompact ? styles.glowOrbCompactPrimary : styles.glowOrbPrimary]}
        duration={5200}
      />
      <PulsingGlow
        style={[styles.glowOrb, isCompact ? styles.glowOrbCompactSecondary : styles.glowOrbSecondary]}
        duration={6400}
        delay={1200}
      />
      {stars.map((spec, i) => (
        <TwinklingStar key={`${spec.top}-${spec.left}-${i}`} spec={spec} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  star: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
  },
  glowOrb: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(126, 168, 232, 0.35)',
  },
  glowOrbPrimary: {
    top: -48,
    left: -36,
    width: 150,
    height: 150,
  },
  glowOrbSecondary: {
    bottom: -40,
    right: -24,
    width: 120,
    height: 120,
    backgroundColor: 'rgba(94, 214, 160, 0.18)',
  },
  glowOrbCompactPrimary: {
    top: -36,
    left: -28,
    width: 110,
    height: 110,
  },
  glowOrbCompactSecondary: {
    bottom: -32,
    right: -18,
    width: 88,
    height: 88,
    backgroundColor: 'rgba(94, 214, 160, 0.16)',
  },
  auroraWrap: {
    position: 'absolute',
    top: '18%',
    left: '-12%',
    right: '-12%',
    height: '55%',
    borderRadius: 120,
    overflow: 'hidden',
  },
});
