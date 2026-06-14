import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';

export type AppLoaderVariant =
  | 'default'
  | 'guests'
  | 'categories'
  | 'contacts'
  | 'seating'
  | 'adding';

type VariantConfig = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  metaIcon: keyof typeof Ionicons.glyphMap;
};

const VARIANTS: Record<AppLoaderVariant, VariantConfig> = {
  default: {
    icon: 'sync',
    title: 'טוען',
    subtitle: 'רק רגע...',
    metaIcon: 'time-outline',
  },
  guests: {
    icon: 'people',
    title: 'טוען מוזמנים',
    subtitle: 'מעדכן את רשימת המוזמנים',
    metaIcon: 'people-outline',
  },
  categories: {
    icon: 'folder-open',
    title: 'טוען קטגוריות',
    subtitle: 'מכין את רשימת הקטגוריות',
    metaIcon: 'layers-outline',
  },
  contacts: {
    icon: 'book',
    title: 'טוען אנשי קשר',
    subtitle: 'מביא את אנשי הקשר מהמכשיר',
    metaIcon: 'call-outline',
  },
  seating: {
    icon: 'restaurant',
    title: 'מושיב אורחים',
    subtitle: 'משייך את האורחים לשולחן',
    metaIcon: 'people',
  },
  adding: {
    icon: 'person-add',
    title: 'מוסיף מוזמנים',
    subtitle: 'שומר את המוזמנים בקטגוריה',
    metaIcon: 'checkmark-circle-outline',
  },
};

export type AppLoaderProps = {
  visible?: boolean;
  variant?: AppLoaderVariant;
  mode?: 'overlay' | 'fullscreen';
  title?: string;
  subtitle?: string;
  metaLabel?: string;
  count?: number;
  tableNumber?: number | null;
  categoryName?: string | null;
  style?: ViewStyle;
};

function PulsingRing({ delay }: { delay: number }) {
  const scale = useRef(new Animated.Value(0.55)).current;
  const opacity = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1.45,
            duration: 1800,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 1800,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 0.55, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.55, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [delay, opacity, scale]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.pulseRing, { opacity, transform: [{ scale }] }]}
    />
  );
}

function OrbitingDot({ angle, delay }: { angle: number; delay: number }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const orbit = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(progress, {
          toValue: 1,
          duration: 2200,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ])
    );
    orbit.start();
    return () => orbit.stop();
  }, [delay, progress]);

  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [`${angle}deg`, `${angle + 360}deg`],
  });

  return (
    <Animated.View pointerEvents="none" style={[styles.orbitTrack, { transform: [{ rotate }] }]}>
      <View style={styles.orbitDot} />
    </Animated.View>
  );
}

function AnimatedDots() {
  const dot1 = useRef(new Animated.Value(0.35)).current;
  const dot2 = useRef(new Animated.Value(0.35)).current;
  const dot3 = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const bounce = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, {
            toValue: 1,
            duration: 320,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0.35,
            duration: 320,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.delay(480),
        ])
      );

    const a1 = bounce(dot1, 0);
    const a2 = bounce(dot2, 160);
    const a3 = bounce(dot3, 320);
    a1.start();
    a2.start();
    a3.start();
    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [dot1, dot2, dot3]);

  const dotStyle = (value: Animated.Value) => ({
    opacity: value,
    transform: [
      {
        translateY: value.interpolate({
          inputRange: [0.35, 1],
          outputRange: [0, -5],
        }),
      },
    ],
  });

  return (
    <View style={styles.dotsRow}>
      <Animated.View style={[styles.textDot, dotStyle(dot1)]} />
      <Animated.View style={[styles.textDot, dotStyle(dot2)]} />
      <Animated.View style={[styles.textDot, dotStyle(dot3)]} />
    </View>
  );
}

function buildSubtitle(
  variant: AppLoaderVariant,
  config: VariantConfig,
  subtitle?: string,
  count?: number,
  tableNumber?: number | null,
  categoryName?: string | null
) {
  if (subtitle) return subtitle;

  if (variant === 'seating' && tableNumber != null && count != null && count > 0) {
    return `משייך ${count} אורחים לשולחן ${tableNumber}`;
  }
  if (variant === 'seating' && count != null && count > 0) {
    return `משייך ${count} אורחים לשולחן`;
  }
  if (variant === 'adding' && categoryName && count != null && count > 0) {
    return `מוסיף ${count} מוזמנים ל"${categoryName}"`;
  }
  if (variant === 'adding' && count != null && count > 0) {
    return `מוסיף ${count} מוזמנים לקטגוריה`;
  }
  return config.subtitle;
}

function buildMetaLabel(metaLabel?: string, count?: number, variant?: AppLoaderVariant) {
  if (metaLabel) return metaLabel;
  if (count != null && count > 0) {
    if (variant === 'adding' || variant === 'seating') return `${count} נבחרו`;
    return `${count} פריטים`;
  }
  return null;
}

export function AppLoader({
  visible = true,
  variant = 'default',
  mode = 'overlay',
  title,
  subtitle,
  metaLabel,
  count,
  tableNumber,
  categoryName,
  style,
}: AppLoaderProps) {
  const config = VARIANTS[variant];
  const fade = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.92)).current;
  const iconBounce = useRef(new Animated.Value(0)).current;
  const iconSpin = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;

  const resolvedTitle = title ?? config.title;
  const resolvedSubtitle = useMemo(
    () => buildSubtitle(variant, config, subtitle, count, tableNumber, categoryName),
    [categoryName, config, count, subtitle, tableNumber, variant]
  );
  const resolvedMeta = buildMetaLabel(metaLabel, count, variant);

  useEffect(() => {
    if (!visible) {
      fade.setValue(0);
      cardScale.setValue(0.92);
      iconBounce.setValue(0);
      iconSpin.setValue(0);
      progress.setValue(0);
      return;
    }

    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(cardScale, {
        toValue: 1,
        friction: 7,
        tension: 90,
        useNativeDriver: true,
      }),
    ]).start();

    const bounce = Animated.loop(
      Animated.sequence([
        Animated.timing(iconBounce, {
          toValue: -6,
          duration: 520,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(iconBounce, {
          toValue: 0,
          duration: 520,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    bounce.start();

    const spin =
      variant === 'default'
        ? Animated.loop(
            Animated.timing(iconSpin, {
              toValue: 1,
              duration: 1600,
              easing: Easing.linear,
              useNativeDriver: true,
            })
          )
        : null;
    spin?.start();

    const bar = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: false,
        }),
      ])
    );
    bar.start();

    return () => {
      bounce.stop();
      spin?.stop();
      bar.stop();
    };
  }, [cardScale, fade, iconBounce, iconSpin, progress, variant, visible]);

  if (!visible) return null;

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['18%', '92%'],
  });

  const iconRotate = iconSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View
      pointerEvents="auto"
      style={[
        mode === 'fullscreen' ? styles.fullscreen : styles.overlay,
        { opacity: fade },
        style,
      ]}
    >
      <LinearGradient
        colors={
          mode === 'fullscreen'
            ? ['#FFFFFF', '#F8FAFF', '#EFF6FF']
            : ['rgba(6,23,62,0.18)', 'rgba(255,255,255,0.88)', 'rgba(59,130,246,0.12)']
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <Animated.View style={[styles.card, { transform: [{ scale: cardScale }] }]}>
        <LinearGradient
          colors={['#FFFFFF', '#F8FAFF', '#EFF6FF']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.cardGradient}
        >
          <View style={styles.iconStage}>
            <PulsingRing delay={0} />
            <PulsingRing delay={450} />
            <PulsingRing delay={900} />

            <OrbitingDot angle={0} delay={0} />
            <OrbitingDot angle={120} delay={260} />
            <OrbitingDot angle={240} delay={520} />

            <Animated.View
              style={{
                transform: [
                  { translateY: iconBounce },
                  ...(variant === 'default' ? [{ rotate: iconRotate }] : []),
                ],
              }}
            >
              <LinearGradient
                colors={[colors.richBlack, colors.yaleBlue]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconCircle}
              >
                <Ionicons name={config.icon} size={28} color="#FFFFFF" />
              </LinearGradient>
            </Animated.View>
          </View>

          <View style={styles.titleRow}>
            <Text style={styles.title}>{resolvedTitle}</Text>
            <AnimatedDots />
          </View>

          <Text style={styles.subtitle}>{resolvedSubtitle}</Text>

          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFillWrap, { width: progressWidth }]}>
              <LinearGradient
                colors={['#3B82F6', colors.richBlack]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.progressFill}
              />
            </Animated.View>
          </View>

          {resolvedMeta ? (
            <View style={styles.metaPill}>
              <Ionicons name={config.metaIcon} size={14} color={colors.primary} />
              <Text style={styles.metaPillText}>{resolvedMeta}</Text>
            </View>
          ) : null}
        </LinearGradient>
      </Animated.View>
    </Animated.View>
  );
}

export function AppLoaderScreen(props: Omit<AppLoaderProps, 'visible' | 'mode'>) {
  return (
    <View style={styles.fullscreenWrap}>
      <AppLoader {...props} visible mode="fullscreen" />
    </View>
  );
}

const styles = StyleSheet.create({
  fullscreenWrap: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  fullscreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 28,
    shadowColor: colors.richBlack,
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
  },
  cardGradient: {
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
  },
  iconStage: {
    width: 132,
    height: 132,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  pulseRing: {
    position: 'absolute',
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 2,
    borderColor: 'rgba(59,130,246,0.42)',
  },
  orbitTrack: {
    position: 'absolute',
    width: 112,
    height: 112,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  orbitDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3B82F6',
    shadowColor: '#3B82F6',
    shadowOpacity: 0.45,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.richBlack,
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
    marginBottom: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.richBlack,
    textAlign: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    paddingBottom: 4,
  },
  textDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.primary,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 18,
  },
  progressTrack: {
    width: '100%',
    height: 6,
    borderRadius: 999,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
    marginBottom: 14,
  },
  progressFillWrap: {
    height: '100%',
  },
  progressFill: {
    flex: 1,
    borderRadius: 999,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(59,130,246,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.16)',
  },
  metaPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
});
