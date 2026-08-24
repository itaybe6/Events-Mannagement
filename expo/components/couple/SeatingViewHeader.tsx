import React, { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
 * Standalone mode button — deliberately NOT a segmented toggle. Every flex /
 * measurement / absolute-position variant of a shared track mis-rendered on
 * device, so each button is content-sized and owns its own pill background.
 */
function ModeButton({
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
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      style={[styles.modeBtn, selected && styles.modeBtnSelected]}
    >
      <Ionicons name={icon} size={16} color={selected ? DNAVY : 'rgba(255,255,255,0.92)'} />
      <Text
        numberOfLines={1}
        style={[styles.modeBtnText, selected ? styles.modeBtnTextSelected : styles.modeBtnTextIdle]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function ViewModeButtons({
  viewMode,
  onChangeViewMode,
}: {
  viewMode: SeatingViewMode;
  onChangeViewMode: (mode: SeatingViewMode) => void;
}) {
  return (
    <View style={styles.modeRow}>
      {/* row-reverse: "מפה" ends up on the visual right, Hebrew reading order. */}
      <ModeButton
        label="מפה"
        icon="location-sharp"
        accessibilityLabel="תצוגת מפה"
        selected={viewMode === 'map'}
        onPress={() => onChangeViewMode('map')}
      />
      <ModeButton
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
        <ViewModeButtons viewMode={viewMode} onChangeViewMode={onChangeViewMode} />

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
  modeRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  // Content-sized chip: no flex, no measuring, nothing that can collapse.
  modeBtn: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 40,
    minWidth: 130,
    paddingHorizontal: 22,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.24)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  modeBtnSelected: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  modeBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
  modeBtnTextIdle: {
    color: 'rgba(255,255,255,0.88)',
  },
  modeBtnTextSelected: {
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
