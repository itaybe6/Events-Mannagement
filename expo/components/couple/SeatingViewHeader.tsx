import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { NavyCardBackground } from '@/components/couple/NavyCardBackground';
import { ROW_DIR } from '@/lib/rtl';

export type SeatingViewMode = 'map' | 'grid';

const DNAVY = '#152949';
const DACC = '#7FA8E8';
const TRACK_PAD = 4;
const SEGMENT_HEIGHT = 40;
const PILL_TIMING = { duration: 190, easing: Easing.out(Easing.cubic) } as const;

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

/**
 * One half of the toggle. The white "selected" pill is a background layer of the
 * segment itself — not an absolutely positioned slider measured with onLayout —
 * so it can never end up mis-sized (missing measurement) or painted on top of
 * the icon + label (Android draws `elevation` siblings above `zIndex` ones).
 */
function ToggleSegment({
  label,
  icon,
  accessibilityLabel,
  selected,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  accessibilityLabel: string;
  selected: boolean;
  onPress: () => void;
}) {
  const progress = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(selected ? 1 : 0, PILL_TIMING);
  }, [progress, selected]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.94 + progress.value * 0.06 }],
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.toggleSegment, pressed ? styles.toggleSegmentPressed : null]}
    >
      <Reanimated.View style={[styles.segmentPill, pillStyle]} />
      <View style={[styles.segmentContent, { flexDirection: ROW_DIR }]}>
        <Ionicons name={icon} size={16} color={selected ? DNAVY : 'rgba(255,255,255,0.92)'} />
        <Text
          numberOfLines={1}
          style={[styles.toggleText, selected ? styles.toggleTextActive : styles.toggleTextInactive]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

function ViewModeToggle({
  viewMode,
  onChangeViewMode,
}: {
  viewMode: SeatingViewMode;
  onChangeViewMode: (mode: SeatingViewMode) => void;
}) {
  return (
    <View style={[styles.toggleTrack, { flexDirection: ROW_DIR }]}>
      <ToggleSegment
        label="מפה"
        icon="location-sharp"
        accessibilityLabel="תצוגת מפה"
        selected={viewMode === 'map'}
        onPress={() => onChangeViewMode('map')}
      />
      <ToggleSegment
        label="רשת"
        icon="grid"
        accessibilityLabel="תצוגת רשת"
        selected={viewMode === 'grid'}
        onPress={() => onChangeViewMode('grid')}
      />
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
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.24)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    padding: TRACK_PAD,
    overflow: 'hidden',
  },
  toggleSegment: {
    flex: 1,
    height: SEGMENT_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  toggleSegmentPressed: {
    opacity: 0.88,
  },
  // Rendered before the label so it always paints behind it, on every platform.
  segmentPill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    pointerEvents: 'none',
  },
  segmentContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 10,
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
