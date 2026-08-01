import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { NavyCardBackground } from '@/components/couple/NavyCardBackground';
import { ROW_DIR } from '@/lib/rtl';

export type SeatingViewMode = 'map' | 'grid';

const DNAVY = '#152949';
const DACC = '#7FA8E8';
const SLIDE_SPRING = { damping: 20, stiffness: 260, mass: 0.75 };
const TRACK_PAD = 4;

type SeatingViewHeaderProps = {
  viewMode: SeatingViewMode;
  onChangeViewMode: (mode: SeatingViewMode) => void;
  seatedPercent: number;
  tablesCount: number;
  fullTablesCount: number;
  waitingCount: number;
  /** When true, no card chrome — parent supplies full-bleed navy shell. */
  flush?: boolean;
};

function ViewModeToggle({
  viewMode,
  onChangeViewMode,
}: {
  viewMode: SeatingViewMode;
  onChangeViewMode: (mode: SeatingViewMode) => void;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const slideIndex = useSharedValue(viewMode === 'map' ? 1 : 0);

  useEffect(() => {
    slideIndex.value = withSpring(viewMode === 'map' ? 1 : 0, SLIDE_SPRING);
  }, [slideIndex, viewMode]);

  const innerWidth = Math.max(0, trackWidth - TRACK_PAD * 2);
  const segmentWidth = innerWidth > 0 ? innerWidth / 2 : 0;

  const sliderStyle = useAnimatedStyle(() => ({
    width: segmentWidth,
    transform: [{ translateX: slideIndex.value * segmentWidth }],
  }));

  const onTrackLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== trackWidth) setTrackWidth(w);
  };

  const renderSegment = (
    mode: SeatingViewMode,
    label: string,
    icon: keyof typeof Ionicons.glyphMap,
    accessibilityLabel: string
  ) => {
    const selected = viewMode === mode;
    return (
      <Pressable
        key={mode}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ selected }}
        onPress={() => onChangeViewMode(mode)}
        style={({ pressed }) => [styles.toggleSegment, pressed ? styles.toggleSegmentPressed : null]}
      >
        <Ionicons name={icon} size={16} color={selected ? DNAVY : 'rgba(255,255,255,0.92)'} />
        <Text style={[styles.toggleText, selected ? styles.toggleTextActive : styles.toggleTextInactive]}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.toggleTrack} onLayout={onTrackLayout}>
      {segmentWidth > 0 ? (
        <Reanimated.View style={[styles.toggleSlider, sliderStyle]} />
      ) : null}

      <View style={[styles.toggleSegments, { flexDirection: ROW_DIR }]}>
        {renderSegment('map', 'מפה', 'location-sharp', 'תצוגת מפה')}
        {renderSegment('grid', 'רשת', 'grid', 'תצוגת רשת')}
      </View>
    </View>
  );
}

function StatLegendItem({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <View style={[styles.legendItem, { flexDirection: ROW_DIR }]}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>
        <Text style={styles.legendValue}>{value}</Text> {label}
      </Text>
    </View>
  );
}

export function SeatingViewHeader({
  viewMode,
  onChangeViewMode,
  seatedPercent,
  tablesCount,
  fullTablesCount,
  waitingCount,
  flush = false,
}: SeatingViewHeaderProps) {
  const pct = Math.max(0, Math.min(100, Math.round(seatedPercent)));
  const progressWidth = useSharedValue(0);

  useEffect(() => {
    progressWidth.value = withTiming(pct, { duration: 520, easing: Easing.out(Easing.cubic) });
  }, [pct, progressWidth]);

  const progressFillStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  return (
    <View style={[styles.root, flush && styles.rootFlush]}>
      {!flush ? <NavyCardBackground variant="compact" /> : null}
      <View style={[styles.content, flush && styles.contentFlush]}>
        <ViewModeToggle viewMode={viewMode} onChangeViewMode={onChangeViewMode} />

        <View style={[styles.progressRow, { flexDirection: ROW_DIR }]}>
          <Text style={styles.progressPct}>{pct}% שובצו</Text>
          <View style={styles.progressTrack}>
            <Reanimated.View style={[styles.progressFill, progressFillStyle]} />
          </View>
        </View>

        <View style={[styles.legendRow, { flexDirection: ROW_DIR }]}>
          <StatLegendItem color={DACC} label="שולחנות" value={tablesCount} />
          <StatLegendItem color="#5ED6A0" label="מלאים" value={fullTablesCount} />
          <StatLegendItem color="#F0C475" label="ממתינים" value={waitingCount} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginHorizontal: 14,
    marginBottom: 10,
    borderRadius: 22,
    backgroundColor: DNAVY,
    overflow: 'hidden',
    shadowColor: DNAVY,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.32,
    shadowRadius: 18,
    elevation: 6,
  },
  rootFlush: {
    marginHorizontal: 0,
    marginBottom: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  content: {
    position: 'relative',
    zIndex: 2,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    gap: 12,
  },
  contentFlush: {
    paddingTop: 10,
    paddingBottom: 16,
  },
  toggleTrack: {
    position: 'relative',
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.24)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    padding: TRACK_PAD,
    minHeight: 48,
    overflow: 'hidden',
  },
  toggleSlider: {
    position: 'absolute',
    top: TRACK_PAD,
    left: TRACK_PAD,
    bottom: TRACK_PAD,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  toggleSegments: {
    flexDirection: 'row',
    zIndex: 1,
  },
  toggleSegment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  toggleSegmentPressed: {
    opacity: 0.88,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '800',
  },
  toggleTextInactive: {
    color: 'rgba(255,255,255,0.88)',
  },
  toggleTextActive: {
    color: DNAVY,
  },
  progressRow: {
    alignItems: 'center',
    gap: 10,
  },
  progressPct: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
    minWidth: 72,
    textAlign: 'left',
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: DACC,
  },
  legendRow: {
    flexWrap: 'wrap',
    gap: 14,
    justifyContent: 'flex-start',
  },
  legendItem: {
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(220,228,245,0.88)',
  },
  legendValue: {
    fontWeight: '900',
    color: '#FFFFFF',
  },
});
