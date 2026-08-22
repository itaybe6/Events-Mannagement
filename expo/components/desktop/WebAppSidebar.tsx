import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import AdminProfileShortcutBadge from '@/components/desktop/AdminProfileShortcutBadge';
import CoupleProfileShortcutBadge from '@/components/desktop/CoupleProfileShortcutBadge';
import { useResponsive } from '@/lib/responsive';
import { useWebAppNav } from '@/lib/useWebAppNav';
import type { WebAppNavItem } from '@/lib/webAppNav';
import { useEventSelectionStore } from '@/store/eventSelectionStore';

const APP_LOGO_LIGHT = require('../../assets/images/moon_logo_white.png');

/**
 * Midnight ink lit by cool white. The content column is light, so the rail goes
 * dark — the app reads as a lit stage next to a quiet frame instead of two
 * competing white planes.
 */
const NIGHT_TOP = '#0C1730';
const NIGHT_MID = '#080F22';
const NIGHT_DEEP = '#05091A';
const NIGHT_BASE = '#0A1226';
const SHEEN_LIGHT = '#FFFFFF';
const SHEEN = '#E6EDFA';
const SHEEN_DEEP = '#B9C7E6';
const TEXT_STRONG = '#F5F8FF';
const TEXT_SOFT = 'rgba(219,229,250,0.66)';
const TEXT_FAINT = 'rgba(219,229,250,0.34)';

const RAIL_WIDTH = 88;
const RAIL_ITEM = 56;
const NAV_PAD_TOP = 10;
const COLLAPSE_KEY = 'moon.sidebar.collapsed';

const web = (style: Record<string, unknown>) => (Platform.OS === 'web' ? (style as any) : null);

/**
 * Keyframes live in one injected stylesheet and bind to elements through
 * `nativeID` — react-native-web forwards that as the DOM `id`, which is the one
 * hook that survives its style pipeline untouched.
 */
const KEYFRAME_STYLE_ID = 'moon-sidebar-motion';
const KEYFRAMES = `
@keyframes moonAuroraA { 0%,100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(-26px,36px,0) scale(1.14); } }
@keyframes moonAuroraB { 0%,100% { transform: translate3d(0,0,0) scale(1.06); } 50% { transform: translate3d(30px,-34px,0) scale(0.94); } }
@keyframes moonAuroraC { 0%,100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(20px,-26px,0) scale(1.12); } }
@keyframes moonSheen { 0% { transform: translateX(-190%) skewX(-16deg); opacity: 0; } 14% { opacity: 0.85; } 55% { opacity: 0; } 100% { transform: translateX(190%) skewX(-16deg); opacity: 0; } }
#moonAuroraA { animation: moonAuroraA 24s ease-in-out infinite; }
#moonAuroraB { animation: moonAuroraB 31s ease-in-out infinite; }
#moonAuroraC { animation: moonAuroraC 38s ease-in-out infinite; }
#moonSheen { animation: moonSheen 8s ease-in-out infinite; }
#moonGrain {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.055'/%3E%3C/svg%3E");
}
@media (prefers-reduced-motion: reduce) {
  #moonAuroraA, #moonAuroraB, #moonAuroraC, #moonSheen { animation: none !important; }
}
`;

function ensureMotionStyles() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (document.getElementById(KEYFRAME_STYLE_ID)) return;
  const tag = document.createElement('style');
  tag.id = KEYFRAME_STYLE_ID;
  tag.textContent = KEYFRAMES;
  document.head.appendChild(tag);
}

ensureMotionStyles();

function readCollapsed() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  try {
    return window.localStorage?.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Ionicons ships `x` / `x-outline` pairs; the solid glyph marks the active row. */
function solidIcon(name: keyof typeof Ionicons.glyphMap) {
  const filled = String(name).replace(/-outline$/, '');
  return (filled in Ionicons.glyphMap ? filled : name) as keyof typeof Ionicons.glyphMap;
}

/** The "O" of the wordmark — a ring crowned by a diamond. Used in rail mode. */
function MoonMark({ size = 30 }: { size?: number }) {
  const gem = Math.round(size * 0.3);
  return (
    <View style={{ width: size, height: size + gem * 0.62 }}>
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: Math.max(1.2, size * 0.045),
          borderColor: SHEEN,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: gem * 0.22,
          left: size / 2 - gem / 2,
          width: gem,
          height: gem,
          borderWidth: Math.max(1, size * 0.04),
          borderColor: SHEEN_LIGHT,
          backgroundColor: NIGHT_BASE,
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  );
}

type Row =
  | { kind: 'section'; key: string; title: string }
  | { kind: 'item'; key: string; item: WebAppNavItem; active: boolean };

type Rect = { y: number; h: number };

type Props = {
  onWidthChange?: (width: number) => void;
};

export default function WebAppSidebar({ onWidthChange }: Props) {
  const { sidebarMode, sidebarWidth, isTouchLayout, isTouch } = useResponsive();
  const { userType, userData, sections, currentLeaf, resolvedEventId, navigate } = useWebAppNav();
  const setActiveEvent = useEventSelectionStore((state) => state.setActiveEvent);

  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [rects, setRects] = useState<Record<string, Rect>>({});
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [navTop, setNavTop] = useState(0);
  const [scrollY, setScrollY] = useState(0);

  const isRail = sidebarMode === 'rail' || (sidebarMode === 'full' && collapsed);
  const width =
    sidebarMode === 'rail' ? sidebarWidth || RAIL_WIDTH : collapsed ? RAIL_WIDTH : sidebarWidth || 300;

  useEffect(() => {
    onWidthChange?.(width);
  }, [onWidthChange, width]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    sections.forEach((section) => {
      out.push({ kind: 'section', key: `s:${section.key}`, title: section.title });
      section.items.forEach((item) => {
        const active =
          item.matchLeaves.includes(currentLeaf) ||
          (currentLeaf === '' && item.matchLeaves.includes(''));
        out.push({ kind: 'item', key: `${section.key}:${item.key}`, item, active });
      });
    });
    return out;
  }, [currentLeaf, sections]);

  const activeKey = useMemo(
    () => rows.find((row) => row.kind === 'item' && row.active)?.key ?? null,
    [rows]
  );
  const activeRect = activeKey ? rects[activeKey] : undefined;
  const hoverRect = hoverKey ? rects[hoverKey] : undefined;
  const hoverLabel = useMemo(() => {
    const row = rows.find((entry) => entry.key === hoverKey);
    return row && row.kind === 'item' ? row.item.label : '';
  }, [hoverKey, rows]);

  const pillY = useRef(new Animated.Value(0)).current;
  const pillH = useRef(new Animated.Value(0)).current;
  const pillIn = useRef(new Animated.Value(0)).current;
  const pillSeeded = useRef(false);

  const hoverYv = useRef(new Animated.Value(0)).current;
  const hoverHv = useRef(new Animated.Value(0)).current;
  const hoverIn = useRef(new Animated.Value(0)).current;
  const hoverSeeded = useRef(false);

  const navHostRef = useRef<any>(null);
  const spotlightRef = useRef<any>(null);

  const measure = useCallback(
    (key: string) => (event: any) => {
      const { y, height } = event.nativeEvent.layout;
      setRects((prev) => {
        const previous = prev[key];
        if (previous && Math.abs(previous.y - y) < 0.5 && Math.abs(previous.h - height) < 0.5) {
          return prev;
        }
        return { ...prev, [key]: { y, h: height } };
      });
    },
    []
  );

  // Active marker: seeds in place on first paint, springs between rows after that.
  useEffect(() => {
    if (!activeRect) {
      Animated.timing(pillIn, { toValue: 0, duration: 160, useNativeDriver: false }).start();
      return;
    }
    if (!pillSeeded.current) {
      pillSeeded.current = true;
      pillY.setValue(activeRect.y);
      pillH.setValue(activeRect.h);
      Animated.timing(pillIn, { toValue: 1, duration: 320, useNativeDriver: false }).start();
      return;
    }
    Animated.parallel([
      Animated.spring(pillY, {
        toValue: activeRect.y,
        useNativeDriver: false,
        stiffness: 260,
        damping: 24,
        mass: 0.9,
      }),
      Animated.spring(pillH, {
        toValue: activeRect.h,
        useNativeDriver: false,
        stiffness: 320,
        damping: 26,
        mass: 0.9,
      }),
      Animated.timing(pillIn, { toValue: 1, duration: 160, useNativeDriver: false }),
    ]).start();
  }, [activeRect?.h, activeRect?.y, pillH, pillIn, pillY]);

  useEffect(() => {
    if (!hoverRect) {
      hoverSeeded.current = false;
      Animated.timing(hoverIn, { toValue: 0, duration: 150, useNativeDriver: false }).start();
      return;
    }
    if (!hoverSeeded.current) {
      hoverSeeded.current = true;
      hoverYv.setValue(hoverRect.y);
      hoverHv.setValue(hoverRect.h);
      Animated.timing(hoverIn, { toValue: 1, duration: 140, useNativeDriver: false }).start();
      return;
    }
    Animated.parallel([
      Animated.spring(hoverYv, {
        toValue: hoverRect.y,
        useNativeDriver: false,
        stiffness: 300,
        damping: 26,
        mass: 0.8,
      }),
      Animated.spring(hoverHv, {
        toValue: hoverRect.h,
        useNativeDriver: false,
        stiffness: 340,
        damping: 28,
        mass: 0.8,
      }),
    ]).start();
  }, [hoverHv, hoverIn, hoverRect?.h, hoverRect?.y, hoverYv]);

  // A soft light trailing the cursor. Written straight to the DOM node so pointer
  // movement never triggers a React render.
  useEffect(() => {
    if (Platform.OS !== 'web' || isTouch) return;
    const host = navHostRef.current as HTMLElement | null;
    const spot = spotlightRef.current as HTMLElement | null;
    if (!host || !spot) return;

    let frame = 0;
    let next: { x: number; y: number } | null = null;

    const paint = () => {
      frame = 0;
      if (!next) return;
      spot.style.opacity = '1';
      spot.style.background = `radial-gradient(230px circle at ${next.x}px ${next.y}px, rgba(255,255,255,0.13), rgba(64,110,232,0.10) 42%, rgba(0,0,0,0) 72%)`;
    };
    const onMove = (event: MouseEvent) => {
      const box = host.getBoundingClientRect();
      next = { x: event.clientX - box.left, y: event.clientY - box.top };
      if (!frame) frame = window.requestAnimationFrame(paint);
    };
    const onLeave = () => {
      spot.style.opacity = '0';
    };

    host.addEventListener('mousemove', onMove);
    host.addEventListener('mouseleave', onLeave);
    return () => {
      host.removeEventListener('mousemove', onMove);
      host.removeEventListener('mouseleave', onLeave);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [isRail, isTouch, sidebarMode]);

  const toggleCollapsed = useCallback(() => {
    setHoverKey(null);
    setCollapsed((prev) => {
      const nextValue = !prev;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        try {
          window.localStorage?.setItem(COLLAPSE_KEY, nextValue ? '1' : '0');
        } catch {
          /* storage blocked — the toggle still works for this session */
        }
      }
      return nextValue;
    });
  }, []);

  if (sidebarMode === 'hidden') return null;

  const tooltipTop = hoverRect
    ? navTop + NAV_PAD_TOP + hoverRect.y - scrollY + hoverRect.h / 2 - 17
    : 0;

  return (
    <View style={[styles.root, { width }]}>
      <LinearGradient
        pointerEvents="none"
        colors={[NIGHT_TOP, NIGHT_MID, NIGHT_DEEP]}
        locations={[0, 0.52, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={styles.auroraClip}>
        <View nativeID="moonAuroraA" pointerEvents="none" style={[styles.blob, styles.blobSilver]} />
        <View nativeID="moonAuroraB" pointerEvents="none" style={[styles.blob, styles.blobIndigo]} />
        <View nativeID="moonAuroraC" pointerEvents="none" style={[styles.blob, styles.blobViolet]} />
      </View>
      <View nativeID="moonGrain" pointerEvents="none" style={styles.grain} />

      {/* A gold thread down the content-facing edge instead of a flat divider. */}
      <LinearGradient
        pointerEvents="none"
        colors={[
          'rgba(255,255,255,0)',
          'rgba(255,255,255,0.42)',
          'rgba(255,255,255,0.14)',
          'rgba(255,255,255,0.20)',
          'rgba(255,255,255,0)',
        ]}
        locations={[0, 0.18, 0.5, 0.78, 1]}
        style={styles.edgeThread}
      />

      <View style={[styles.brand, isRail ? styles.brandRail : null]}>
        <View style={[styles.brandPlate, isRail ? styles.brandPlateRail : null]}>
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.03)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View nativeID="moonSheen" pointerEvents="none" style={styles.sheen}>
            <LinearGradient
              colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </View>
          {isRail ? (
            <MoonMark size={34} />
          ) : (
            <Image
              source={APP_LOGO_LIGHT}
              style={styles.brandLogo}
              contentFit="contain"
              transition={0}
            />
          )}
        </View>

        {isRail ? null : (
          <View style={styles.caption}>
            <LinearGradient
              colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.34)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.captionRule}
            />
            <Text style={styles.captionText}>ניהול אירועים</Text>
            <LinearGradient
              colors={['rgba(255,255,255,0.34)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.captionRule}
            />
          </View>
        )}
      </View>

      <View
        ref={navHostRef}
        style={styles.navHost}
        onLayout={(event) => setNavTop(event.nativeEvent.layout.y)}
      >
        <View ref={spotlightRef} pointerEvents="none" style={styles.spotlight} />

        <ScrollView
          style={styles.navScroll}
          contentContainerStyle={[styles.navContent, isRail ? styles.navContentRail : null]}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={isRail ? (event) => setScrollY(event.nativeEvent.contentOffset.y) : undefined}
          alwaysBounceVertical={false}
        >
          <View style={[styles.navInner, isRail ? styles.navInnerRail : null]}>
            {/* Position spine: a hairline track with a gold segment locked to the active row. */}
            <View pointerEvents="none" style={styles.spineTrack} />
            <Animated.View
              pointerEvents="none"
              style={[
                styles.spineGlow,
                {
                  opacity: pillIn,
                  height: Animated.subtract(pillH, 18),
                  transform: [{ translateY: Animated.add(pillY, 9) }],
                },
              ]}
            >
              <LinearGradient
                colors={[SHEEN_LIGHT, SHEEN, SHEEN_DEEP]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.spineFill}
              />
            </Animated.View>

            <Animated.View
              pointerEvents="none"
              style={[
                styles.hoverPill,
                { opacity: hoverIn, height: hoverHv, transform: [{ translateY: hoverYv }] },
              ]}
            />

            <Animated.View
              pointerEvents="none"
              style={[
                styles.activePill,
                { opacity: pillIn, height: pillH, transform: [{ translateY: pillY }] },
              ]}
            >
              <LinearGradient
                pointerEvents="none"
                colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.07)', 'rgba(64,110,232,0.10)']}
                locations={[0, 0.55, 1]}
                start={{ x: 1, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.activePillTopLight} />
            </Animated.View>

            {rows.map((row) => {
              if (row.kind === 'section') {
                if (isRail) return <View key={row.key} style={styles.sectionSpacerRail} />;
                return (
                  <View key={row.key} style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>{row.title}</Text>
                    <LinearGradient
                      colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0)']}
                      start={{ x: 1, y: 0.5 }}
                      end={{ x: 0, y: 0.5 }}
                      style={styles.sectionRule}
                    />
                  </View>
                );
              }

              const { item, active } = row;
              return (
                <Pressable
                  key={row.key}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  accessibilityState={{ selected: active }}
                  onLayout={measure(row.key)}
                  onPress={() => navigate(item)}
                  onHoverIn={() => setHoverKey(row.key)}
                  onHoverOut={() => setHoverKey((prev) => (prev === row.key ? null : prev))}
                  style={({ pressed }: any) => [
                    styles.row,
                    isRail ? styles.rowRail : null,
                    isTouchLayout ? styles.rowTouch : null,
                    pressed ? styles.rowPressed : null,
                  ]}
                >
                  <View style={[styles.rowIcon, active ? styles.rowIconActive : null]}>
                    {active ? (
                      <LinearGradient
                        pointerEvents="none"
                        colors={[SHEEN_LIGHT, SHEEN, SHEEN_DEEP]}
                        start={{ x: 0.2, y: 0 }}
                        end={{ x: 0.8, y: 1 }}
                        style={styles.rowIconFill}
                      />
                    ) : null}
                    <Ionicons
                      name={active ? solidIcon(item.icon) : item.icon}
                      size={isRail ? 21 : 18}
                      color={active ? NIGHT_BASE : hoverKey === row.key ? TEXT_STRONG : TEXT_SOFT}
                    />
                  </View>

                  {isRail ? null : (
                    <Text
                      style={[styles.rowLabel, active ? styles.rowLabelActive : null]}
                      numberOfLines={1}
                    >
                      {item.label}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        <LinearGradient
          pointerEvents="none"
          colors={[NIGHT_MID, 'rgba(8,15,34,0)']}
          style={styles.navFadeTop}
        />
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(5,9,26,0)', NIGHT_DEEP]}
          style={styles.navFadeBottom}
        />
      </View>

      <View style={[styles.footer, isRail ? styles.footerRail : null]}>
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.footerRule}
        />
        {userType === 'event_owner' ? (
          <CoupleProfileShortcutBadge
            variant="sidebar"
            tone="onDark"
            compact={isRail}
            userId={userData?.id}
            selectedEventId={resolvedEventId || null}
            onSelectEventId={(nextEventId) => {
              if (userData?.id) setActiveEvent(userData.id, nextEventId);
            }}
          />
        ) : (
          <AdminProfileShortcutBadge
            variant="sidebar"
            tone="onDark"
            compact={isRail}
            profileHref={
              userType === 'employee' ? '/(admin)/employee-profile-tab' : '/(admin)/admin-profile'
            }
          />
        )}
      </View>

      {sidebarMode === 'full' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={collapsed ? 'הרחבת התפריט' : 'כיווץ התפריט'}
          onPress={toggleCollapsed}
          hitSlop={10}
          style={({ hovered, pressed }: any) => [
            styles.collapse,
            Platform.OS === 'web' && hovered ? styles.collapseHover : null,
            pressed ? styles.collapsePressed : null,
          ]}
        >
          <Ionicons
            name={collapsed ? 'chevron-back' : 'chevron-forward'}
            size={18}
            color={SHEEN_LIGHT}
          />
        </Pressable>
      ) : null}

      {isRail && hoverKey && hoverRect && hoverLabel ? (
        <View pointerEvents="none" style={[styles.tooltip, { top: tooltipTop }]}>
          <Text style={styles.tooltipText} numberOfLines={1}>
            {hoverLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: 300,
    backgroundColor: NIGHT_DEEP,
    overflow: 'visible',
    flexShrink: 0,
    flexDirection: 'column',
    // Content sits to the LEFT of the rail on this RTL page, so the edge
    // treatment and the drop shadow both face left.
    ...web({
      position: 'sticky',
      top: 0,
      height: '100dvh',
      maxHeight: '100dvh',
      minHeight: '100dvh',
      alignSelf: 'flex-start',
      zIndex: 40,
      boxShadow: '-28px 0 70px rgba(3,7,20,0.34)',
      transition: 'width 360ms cubic-bezier(0.22,1,0.36,1)',
    }),
  },
  auroraClip: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  blob: {
    position: 'absolute',
    borderRadius: 999,
    ...web({ willChange: 'transform' }),
  },
  blobSilver: {
    top: -110,
    right: -80,
    width: 300,
    height: 300,
    backgroundColor: 'rgba(206,224,255,0.20)',
    ...web({ filter: 'blur(64px)' }),
  },
  blobIndigo: {
    top: '34%',
    left: -120,
    width: 280,
    height: 280,
    backgroundColor: 'rgba(59,104,232,0.24)',
    ...web({ filter: 'blur(72px)' }),
  },
  blobViolet: {
    bottom: -80,
    right: -70,
    width: 260,
    height: 260,
    backgroundColor: 'rgba(122,86,224,0.20)',
    ...web({ filter: 'blur(76px)' }),
  },
  // The texture itself is applied by the `#moonGrain` rule — react-native-web's
  // style validator rejects `backgroundImage`.
  grain: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.5,
  },
  edgeThread: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 1,
  },

  brand: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 6,
  },
  brandRail: {
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  brandPlate: {
    height: 120,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    ...web({
      backdropFilter: 'blur(14px)',
      boxShadow: '0 18px 40px rgba(3,7,20,0.45), inset 0 1px 0 rgba(255,255,255,0.14)',
    }),
  },
  brandPlateRail: {
    width: 60,
    height: 60,
    borderRadius: 19,
  },
  sheen: {
    position: 'absolute',
    top: '-60%',
    bottom: '-60%',
    width: '42%',
    ...web({ willChange: 'transform' }),
  },
  brandLogo: {
    width: '92%',
    height: 108,
  },
  caption: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  captionRule: {
    flex: 1,
    height: 1,
  },
  captionText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 3.4,
    color: 'rgba(226,234,250,0.70)',
  },

  navHost: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
  },
  spotlight: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
    ...web({ transition: 'opacity 260ms ease' }),
  },
  navScroll: {
    flex: 1,
    minHeight: 0,
  },
  navContent: {
    paddingHorizontal: 14,
    paddingTop: NAV_PAD_TOP,
    paddingBottom: 18,
  },
  // Rail width varies (84 on a portrait iPad, 88 when collapsed on desktop), so
  // the column centres itself instead of relying on a fixed pad.
  navContentRail: {
    paddingHorizontal: 0,
  },
  navInner: {
    position: 'relative',
    width: '100%',
  },
  navInnerRail: {
    width: RAIL_ITEM,
    alignSelf: 'center',
  },
  spineTrack: {
    position: 'absolute',
    right: -9,
    top: 6,
    bottom: 6,
    width: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  spineGlow: {
    position: 'absolute',
    right: -9.5,
    top: 0,
    width: 3,
    borderRadius: 999,
    overflow: 'hidden',
    ...web({ boxShadow: '0 0 16px rgba(255,255,255,0.70)' }),
  },
  spineFill: {
    flex: 1,
    borderRadius: 999,
  },

  activePill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.26)',
    ...web({
      boxShadow: '0 14px 34px rgba(3,7,20,0.55), inset 0 1px 0 rgba(255,255,255,0.10)',
    }),
  },
  activePillTopLight: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  hoverPill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 6,
    marginTop: 18,
    marginBottom: 8,
  },
  sectionSpacerRail: {
    height: 14,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
    color: TEXT_FAINT,
    textAlign: 'right',
  },
  sectionRule: {
    flex: 1,
    height: 1,
  },

  row: {
    minHeight: 46,
    marginBottom: 4,
    borderRadius: 16,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    ...web({
      cursor: 'pointer',
      transition: 'transform 160ms cubic-bezier(0.22,1,0.36,1)',
    }),
  },
  rowRail: {
    width: RAIL_ITEM,
    minHeight: 50,
    paddingHorizontal: 0,
    justifyContent: 'center',
    marginBottom: 6,
  },
  rowTouch: {
    minHeight: 52,
  },
  rowPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
    ...web({ transition: 'background-color 180ms ease' }),
  },
  rowIconActive: {
    backgroundColor: 'transparent',
    ...web({ boxShadow: '0 6px 18px rgba(255,255,255,0.30)' }),
  },
  rowIconFill: {
    ...StyleSheet.absoluteFillObject,
  },
  rowLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.1,
    color: TEXT_SOFT,
    textAlign: 'right',
  },
  rowLabelActive: {
    color: TEXT_STRONG,
    fontWeight: '800',
  },

  navFadeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 14,
  },
  navFadeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 22,
  },

  footer: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 16,
    gap: 8,
    backgroundColor: 'rgba(6,11,26,0.55)',
    overflow: 'visible',
    zIndex: 60,
    ...web({
      paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
      backdropFilter: 'blur(14px)',
    }),
  },
  footerRail: {
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  footerRule: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
  },

  collapse: {
    position: 'absolute',
    left: -18,
    top: 40,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: NIGHT_BASE,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    zIndex: 70,
    ...web({
      cursor: 'pointer',
      boxShadow: '0 8px 20px rgba(3,7,20,0.45)',
      transition: 'transform 180ms ease, border-color 180ms ease, background-color 180ms ease',
    }),
  },
  collapseHover: {
    backgroundColor: '#16233F',
    borderColor: SHEEN,
    ...web({ transform: 'scale(1.08)' }),
  },
  collapsePressed: {
    opacity: 0.9,
  },

  tooltip: {
    position: 'absolute',
    right: '100%',
    marginRight: 12,
    paddingHorizontal: 12,
    height: 34,
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: 'rgba(10,18,38,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    zIndex: 90,
    ...web({
      boxShadow: '0 14px 30px rgba(3,7,20,0.5)',
      backdropFilter: 'blur(10px)',
      whiteSpace: 'nowrap',
    }),
  },
  tooltipText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: TEXT_STRONG,
    textAlign: 'right',
  },
});
