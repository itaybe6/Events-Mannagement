import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/constants/colors';
import BackSwipe from '@/components/BackSwipe';
import { getFloatingTabBarContentPadding } from '@/lib/floatingTabBarInset';
import { ROW_DIR, TEXT_RIGHT } from '@/lib/rtl';
import {
  useLiveSeatingModel,
  type LiveSeatingTable,
  type LiveTableStatus,
} from '@/features/seating/useLiveSeatingModel';
import LiveMapCanvas from '@/features/seating/LiveMapCanvas';

const PALETTE = {
  ink: '#06173e',
  inkDeep: '#040E24',
  sheet: '#F4F7FD',
  live: '#FF4D4D',
} as const;

const STATUS_STYLE: Record<
  LiveTableStatus,
  { bar: string; tint: string; border: string; label: string }
> = {
  empty: { bar: '#94A3B8', tint: '#EEF2F7', border: 'rgba(100,116,139,0.28)', label: 'ריק' },
  partial: { bar: '#3B82F6', tint: '#E6F0FF', border: 'rgba(59,130,246,0.38)', label: 'חלקי' },
  near: { bar: '#F59E0B', tint: '#FEF3C7', border: 'rgba(245,158,11,0.48)', label: 'כמעט מלא' },
  full: { bar: '#16A34A', tint: '#DCFCE7', border: 'rgba(22,163,74,0.42)', label: 'מלא' },
  over: { bar: '#DC2626', tint: '#FEE2E2', border: 'rgba(220,38,38,0.5)', label: 'מעל תפוסה' },
};

function tableLabel(table: Pick<LiveSeatingTable, 'number' | 'name'>) {
  if (typeof table.number === 'number') return `שולחן ${table.number}`;
  const name = String(table.name || '').trim();
  return name || 'שולחן';
}

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

export default function LiveSeatingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { eventId, returnTo } = useLocalSearchParams<{ eventId?: string; returnTo?: string }>();

  const resolvedEventId = useMemo(() => String(eventId || '').trim(), [eventId]);
  const backHref = useMemo(() => {
    const raw = String(returnTo || '').trim();
    if (raw) return raw;
    return resolvedEventId
      ? `/(admin)/admin-event-details?id=${resolvedEventId}`
      : '/(admin)/admin-events';
  }, [resolvedEventId, returnTo]);

  const {
    loading,
    refreshing,
    error,
    tables,
    supportsManualEdit,
    savingTableIds,
    refresh,
    adjustTable,
    setLivePeople,
    clearTable,
  } = useLiveSeatingModel(resolvedEventId || null);

  const [activeTableId, setActiveTableId] = useState<string | null>(null);

  // The map fills whatever the controls leave behind, measured rather than
  // guessed — a guess based on window height is wrong the moment the notice
  // banner or the filter row wraps to another line.
  const [bodySize, setBodySize] = useState<{ width: number; height: number } | null>(null);
  const onBodyLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBodySize((prev) =>
      prev && Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1
        ? prev
        : { width, height }
    );
  }, []);

  const mapViewport = useMemo(() => {
    if (!bodySize) return null;
    // Card padding (10 each side), and enough clearance at the bottom so the
    // map card ends above the floating tab bar instead of hiding behind it.
    const tabBarClearance = getFloatingTabBarContentPadding(insets.bottom) - 24;
    return {
      width: Math.max(200, bodySize.width - 20),
      height: Math.max(220, bodySize.height - 20 - Math.max(0, tabBarClearance)),
    };
  }, [bodySize, insets.bottom]);

  const activeTable = useMemo(
    () => (activeTableId ? tables.find((t) => t.id === activeTableId) ?? null : null),
    [activeTableId, tables]
  );
  const handleAdjust = useCallback(
    async (tableId: string, delta: number) => {
      const result = await adjustTable(tableId, delta);
      if (!result.ok && result.error) Alert.alert('שגיאה', result.error);
    },
    [adjustTable]
  );

  const handleSetCount = useCallback(
    async (tableId: string, value: number) => {
      const result = await setLivePeople(tableId, value);
      if (!result.ok && result.error) Alert.alert('שגיאה', result.error);
    },
    [setLivePeople]
  );

  const handleClear = useCallback(
    async (tableId: string) => {
      const result = await clearTable(tableId);
      if (!result.ok && result.error) Alert.alert('שגיאה', result.error);
    },
    [clearTable]
  );

  if (!resolvedEventId) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorTitle}>חסר מזהה אירוע</Text>
        <TouchableOpacity
          onPress={() => router.replace('/(admin)/admin-events')}
          style={styles.primaryBtn}
          activeOpacity={0.9}
        >
          <Text style={styles.primaryBtnText}>חזרה לרשימת אירועים</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const notices =
    error || !supportsManualEdit ? (
      <View style={styles.controlsBlock}>
        {error ? (
          <View style={styles.noticeBox}>
            <Ionicons name="warning-outline" size={16} color="#B45309" />
            <Text style={styles.noticeText}>{error}</Text>
          </View>
        ) : null}

        {!supportsManualEdit ? (
          <View style={styles.noticeBox}>
            <Ionicons name="information-circle-outline" size={16} color="#B45309" />
            <Text style={styles.noticeText}>
              עדכון ידני של כמות היושבים לא זמין — יש להריץ את מיגרציית מפת הלייב במסד הנתונים.
            </Text>
          </View>
        ) : null}
      </View>
    ) : null;

  const emptyBlock = (
    <View style={styles.emptyBox}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name="grid-outline" size={30} color="rgba(6,23,62,0.35)" />
      </View>
      <Text style={styles.emptyTitle}>אין שולחנות באירוע</Text>
      <Text style={styles.emptyText}>יש לבנות את מפת ההושבה לפני שימוש במפת הלייב</Text>
    </View>
  );

  return (
    <BackSwipe fallbackHref={backHref}>
      <View style={styles.screenRoot}>
        <StatusBar barStyle="light-content" backgroundColor={PALETTE.ink} />

        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <LinearGradient
            colors={['#0C3070', '#071B45', PALETTE.inkDeep]}
            locations={[0, 0.58, 1]}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          <View style={styles.topBarRow}>
            <TouchableOpacity
              onPress={() => router.replace(backHref as any)}
              style={styles.topIconBtn}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="חזרה"
            >
              <Ionicons name="chevron-forward" size={20} color={colors.white} />
            </TouchableOpacity>

            <View style={styles.topTitleWrap}>
              <View style={styles.topTitleRow}>
                <LiveDot />
                <Text style={styles.topTitle} numberOfLines={1}>
                  מפת לייב
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => void refresh({ silent: true })}
              style={styles.topIconBtn}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="רענון"
            >
              {refreshing ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Ionicons name="refresh" size={18} color={colors.white} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.sheet}>
          {notices}

          <View style={styles.body} onLayout={onBodyLayout}>
            {loading && !tables.length ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color={PALETTE.ink} />
                <Text style={styles.loadingText}>טוען את מפת הלייב...</Text>
              </View>
            ) : tables.length === 0 ? (
              emptyBlock
            ) : mapViewport ? (
              <LiveMapCanvas
                tables={tables}
                viewport={mapViewport}
                selectedId={activeTableId}
                onSelectTable={setActiveTableId}
              />
            ) : null}
          </View>
        </View>

        <TableDetailModal
          table={activeTable}
          saving={activeTable ? savingTableIds.has(activeTable.id) : false}
          canEdit={supportsManualEdit}
          onClose={() => setActiveTableId(null)}
          onAdjust={(delta) => {
            if (activeTable) void handleAdjust(activeTable.id, delta);
          }}
          onSetCount={(value) => {
            if (activeTable) void handleSetCount(activeTable.id, value);
          }}
          onClear={() => {
            if (activeTable) void handleClear(activeTable.id);
          }}
        />
      </View>
    </BackSwipe>
  );
}

/** The "live" dot, pulsing so the screen reads as a running feed. */
function LiveDot() {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const ringStyle = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }],
  };

  return (
    <View style={styles.liveDotWrap}>
      <Animated.View style={[styles.liveDotRing, ringStyle]} />
      <View style={styles.liveDot} />
    </View>
  );
}

function StepperButton({
  icon,
  disabled,
  onPress,
  accessibilityLabel,
  large,
}: {
  icon: 'add' | 'remove';
  disabled?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  large?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.stepperBtn,
        large && styles.stepperBtnLarge,
        disabled && styles.stepperBtnDisabled,
        pressed && !disabled && styles.stepperBtnPressed,
      ]}
    >
      <Ionicons name={icon} size={large ? 26 : 19} color={disabled ? 'rgba(6,23,62,0.28)' : PALETTE.ink} />
    </Pressable>
  );
}

function TableDetailModal({
  table,
  saving,
  canEdit,
  onClose,
  onAdjust,
  onSetCount,
  onClear,
}: {
  table: LiveSeatingTable | null;
  saving: boolean;
  canEdit: boolean;
  onClose: () => void;
  onAdjust: (delta: number) => void;
  onSetCount: (value: number) => void;
  onClear: () => void;
}) {
  const palette = table ? STATUS_STYLE[table.status] : STATUS_STYLE.empty;
  const counter = useHeadcountEditor(table, canEdit, onSetCount);

  return (
    <Modal visible={Boolean(table)} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => null}>
          {table ? (
            <>
              <View style={styles.modalHeader}>
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.modalCloseBtn}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="סגירה"
                >
                  <Ionicons name="close" size={18} color="rgba(6,23,62,0.6)" />
                </TouchableOpacity>

                <View style={styles.modalHeaderCenter}>
                  <Text style={styles.modalTitle} numberOfLines={1}>
                    {tableLabel(table)}
                  </Text>
                  <View style={[styles.modalStatusPill, { backgroundColor: palette.tint, borderColor: palette.border }]}>
                    <View style={[styles.modalStatusDot, { backgroundColor: palette.bar }]} />
                    <Text style={[styles.modalStatusText, { color: palette.bar }]}>{palette.label}</Text>
                  </View>
                </View>

                <View style={{ width: 40 }} />
              </View>

              <View style={styles.modalDivider} />

              <ScrollView contentContainerStyle={styles.modalBody} showsVerticalScrollIndicator={false}>
                <View style={styles.bigCounter}>
                  <StepperButton
                    icon="remove"
                    large
                    disabled={!canEdit || saving || table.livePeople <= 0}
                    onPress={() => onAdjust(-1)}
                    accessibilityLabel="הפחתת יושב אחד"
                  />

                  <View style={styles.bigCounterCenter}>
                    {counter.editing ? (
                      <TextInput
                        value={counter.draft}
                        onChangeText={counter.setDraft}
                        onSubmitEditing={counter.commit}
                        onBlur={counter.commit}
                        keyboardType="number-pad"
                        returnKeyType="done"
                        maxLength={3}
                        autoFocus
                        selectTextOnFocus
                        style={[styles.bigCounterInput, { color: palette.bar }]}
                        accessibilityLabel="הזנת מספר היושבים בשולחן"
                      />
                    ) : (
                      <TouchableOpacity
                        onPress={counter.start}
                        disabled={!canEdit || saving}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={`${table.livePeople} יושבים, הקישו להקלדת מספר`}
                        style={styles.bigCounterValueWrap}
                      >
                        <Text style={[styles.bigCounterValue, { color: palette.bar }]}>
                          {table.livePeople}
                        </Text>
                      </TouchableOpacity>
                    )}
                    <Text style={styles.bigCounterCaption}>
                      {counter.editing ? 'הזינו מספר ואשרו' : `מתוך ${table.capacity} מקומות`}
                    </Text>
                  </View>

                  <StepperButton
                    icon="add"
                    large
                    disabled={!canEdit || saving}
                    onPress={() => onAdjust(1)}
                    accessibilityLabel="הוספת יושב אחד"
                  />
                </View>

                <View style={styles.breakdown}>
                  <BreakdownRow label="הגיעו לפי צ׳ק-אין" value={String(table.checkedInPeople)} />
                  <BreakdownRow
                    label="תוספת ידנית במפת הלייב"
                    value={signed(table.manualExtra)}
                    emphasize={table.manualExtra !== 0}
                  />
                  <BreakdownRow label="משובצים בתכנון ההושבה" value={String(table.assignedPeople)} muted />
                </View>

                {table.manualExtra !== 0 && canEdit ? (
                  <TouchableOpacity
                    onPress={onClear}
                    style={styles.clearBtn}
                    activeOpacity={0.85}
                    disabled={saving}
                    accessibilityRole="button"
                  >
                    <Ionicons name="refresh-outline" size={15} color={colors.gray[700]} />
                    <Text style={styles.clearBtnText}>איפוס התוספת הידנית</Text>
                  </TouchableOpacity>
                ) : null}
              </ScrollView>
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Tap-to-type headcount. Counting a table and typing "11" beats tapping plus
 * eleven times, so the number itself is an input.
 */
function useHeadcountEditor(
  table: LiveSeatingTable | null,
  canEdit: boolean,
  onSetCount: (value: number) => void
) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const committedRef = useRef(false);

  // Opening a different table must not carry the previous one's draft over.
  useEffect(() => {
    setEditing(false);
    setDraft('');
  }, [table?.id]);

  const start = useCallback(() => {
    if (!canEdit || !table) return;
    committedRef.current = false;
    setDraft(String(table.livePeople));
    setEditing(true);
  }, [canEdit, table]);

  const commit = useCallback(() => {
    // Submit-then-blur would otherwise apply the same value twice.
    if (committedRef.current) return;
    committedRef.current = true;
    setEditing(false);

    const digits = draft.replace(/[^0-9]/g, '');
    if (!digits) return;

    const next = Number(digits);
    if (!Number.isFinite(next) || next === table?.livePeople) return;
    onSetCount(next);
  }, [draft, onSetCount, table?.livePeople]);

  return { editing, draft, setDraft, start, commit };
}

function BreakdownRow({
  label,
  value,
  emphasize,
  muted,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  muted?: boolean;
}) {
  return (
    <View style={styles.breakdownRow}>
      <Text style={[styles.breakdownValue, emphasize && styles.breakdownValueEmphasis, muted && styles.breakdownMuted]}>
        {value}
      </Text>
      <Text style={[styles.breakdownLabel, muted && styles.breakdownMuted]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: { flex: 1, backgroundColor: PALETTE.sheet },

  // ----- Slim top bar -----
  // Enough bottom padding that the sheet's rounded overlap stays clear of the
  // back/refresh buttons.
  topBar: { position: 'relative', paddingHorizontal: 12, paddingBottom: 30, overflow: 'hidden' },
  topBarRow: { flexDirection: ROW_DIR, alignItems: 'center', gap: 10 },
  topIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitleWrap: { flex: 1, alignItems: 'center' },
  topTitleRow: { flexDirection: ROW_DIR, alignItems: 'center', gap: 7 },
  topTitle: { fontSize: 17, fontWeight: '900', color: colors.white },

  // The map fills the whole sheet.
  body: { flex: 1, paddingHorizontal: 12, paddingTop: 12 },
  center: {
    flex: 1,
    backgroundColor: PALETTE.sheet,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  errorTitle: { fontSize: 16, fontWeight: '900', color: PALETTE.ink, textAlign: 'center' },
  primaryBtn: { backgroundColor: PALETTE.ink, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14 },
  primaryBtnText: { color: colors.white, fontWeight: '900' },

  // ----- Hero -----
  // The sheet's rounded top overlaps the hero by 22pt, so the pills need that
  // much clearance plus breathing room below them.

  liveDotWrap: { width: 7, height: 7, alignItems: 'center', justifyContent: 'center' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: PALETTE.live },
  liveDotRing: { position: 'absolute', width: 7, height: 7, borderRadius: 4, backgroundColor: PALETTE.live },



  // ----- Sheet -----
  sheet: {
    flex: 1,
    marginTop: -18,
    backgroundColor: PALETTE.sheet,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: 'hidden',
  },
  controlsBlock: { gap: 12, paddingTop: 14, paddingHorizontal: 12 },
  noticeBox: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noticeText: { flex: 1, fontSize: 12, fontWeight: '700', color: '#92400E', textAlign: TEXT_RIGHT },

  stepperBtn: {
    width: 36,
    height: 36,
    borderRadius: 13,
    backgroundColor: PALETTE.sheet,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnLarge: { width: 58, height: 58, borderRadius: 20, backgroundColor: colors.white },
  stepperBtnDisabled: { opacity: 0.45 },
  stepperBtnPressed: { backgroundColor: 'rgba(6,23,62,0.07)' },

  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 13.5, fontWeight: '800', color: 'rgba(6,23,62,0.55)' },

  emptyBox: { alignItems: 'center', gap: 9, paddingVertical: 40, paddingHorizontal: 24 },
  emptyIconWrap: {
    width: 62,
    height: 62,
    borderRadius: 999,
    backgroundColor: 'rgba(6,23,62,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  emptyTitle: { fontSize: 15, fontWeight: '900', color: PALETTE.ink, textAlign: 'center' },
  emptyText: { fontSize: 12.5, fontWeight: '700', color: 'rgba(6,23,62,0.48)', textAlign: 'center' },

  // ----- Detail modal -----
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(4,14,36,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 26,
    backgroundColor: colors.white,
    overflow: 'hidden',
    maxHeight: Platform.OS === 'web' ? 660 : '86%',
  },
  modalHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalHeaderCenter: { flex: 1, alignItems: 'center', gap: 6 },
  modalCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: 'rgba(6,23,62,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: { fontSize: 18, fontWeight: '900', color: PALETTE.ink },
  modalStatusPill: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  modalStatusDot: { width: 7, height: 7, borderRadius: 4 },
  modalStatusText: { fontSize: 11, fontWeight: '900' },
  modalDivider: { height: 1, backgroundColor: 'rgba(6,23,62,0.07)', marginHorizontal: 16 },
  modalBody: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 20, gap: 12 },

  bigCounter: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: PALETTE.sheet,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  bigCounterCenter: { alignItems: 'center', minWidth: 120 },
  bigCounterValueWrap: { flexDirection: ROW_DIR, alignItems: 'center', gap: 6 },
  bigCounterValue: { fontSize: 44, fontWeight: '900', lineHeight: 50 },
  bigCounterInput: {
    fontSize: 44,
    fontWeight: '900',
    lineHeight: 50,
    minWidth: 110,
    textAlign: 'center',
    paddingVertical: 0,
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(6,23,62,0.18)',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null),
  },
  bigCounterCaption: { fontSize: 12, fontWeight: '800', color: 'rgba(6,23,62,0.45)' },

  breakdown: { gap: 8 },
  breakdownRow: { flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'space-between' },
  breakdownLabel: { fontSize: 13, fontWeight: '800', color: 'rgba(6,23,62,0.62)', textAlign: TEXT_RIGHT },
  breakdownValue: { fontSize: 14, fontWeight: '900', color: PALETTE.ink },
  breakdownValueEmphasis: { color: '#B45309' },
  breakdownMuted: { color: 'rgba(6,23,62,0.38)' },

  clearBtn: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: PALETTE.sheet,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.07)',
  },
  clearBtnText: { fontSize: 13, fontWeight: '900', color: colors.gray[700] },


});
