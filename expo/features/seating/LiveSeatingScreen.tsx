import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/constants/colors';
import BackSwipe from '@/components/BackSwipe';
import { ROW_DIR, TEXT_RIGHT } from '@/lib/rtl';
import { guestArrivedPeople, guestInvitedPeople } from '@/features/guests/useGuestCheckInModel';
import {
  useLiveSeatingModel,
  type LiveSeatingTable,
  type LiveTableStatus,
} from '@/features/seating/useLiveSeatingModel';
import { buildLiveMapLayout, type PlacedTable } from '@/features/seating/liveSeatingLayout';
import type { Guest } from '@/types';

const PALETTE = {
  ink: '#06173e',
  inkDeep: '#040E24',
  sheet: '#F4F7FD',
  live: '#FF4D4D',
} as const;

type LiveFilter = 'all' | 'partial' | 'full' | 'empty' | 'over' | 'adjusted';
type LiveView = 'map' | 'list';

const FILTERS: Array<{ key: LiveFilter; label: string }> = [
  { key: 'all', label: 'הכל' },
  { key: 'partial', label: 'חלקיים' },
  { key: 'full', label: 'מלאים' },
  { key: 'empty', label: 'ריקים' },
  { key: 'over', label: 'מעל תפוסה' },
  { key: 'adjusted', label: 'עודכנו ידנית' },
];

const STATUS_STYLE: Record<
  LiveTableStatus,
  { bar: string; tint: string; border: string; label: string }
> = {
  empty: { bar: '#94A3B8', tint: '#EEF2F7', border: 'rgba(100,116,139,0.28)', label: 'ריק' },
  partial: { bar: '#3B82F6', tint: '#E6F0FF', border: 'rgba(59,130,246,0.38)', label: 'חלקי' },
  full: { bar: '#16A34A', tint: '#DCFCE7', border: 'rgba(22,163,74,0.42)', label: 'מלא' },
  over: { bar: '#F59E0B', tint: '#FEF3C7', border: 'rgba(245,158,11,0.48)', label: 'מעל תפוסה' },
};

const LEGEND: LiveTableStatus[] = ['empty', 'partial', 'full', 'over'];

function tableLabel(table: Pick<LiveSeatingTable, 'number' | 'name'>) {
  if (typeof table.number === 'number') return `שולחן ${table.number}`;
  const name = String(table.name || '').trim();
  return name || 'שולחן';
}

function tableShortLabel(table: Pick<LiveSeatingTable, 'number' | 'name'>) {
  if (typeof table.number === 'number') return String(table.number);
  return String(table.name || '?').trim().slice(0, 4);
}

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

export default function LiveSeatingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
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
    eventTitle,
    tables,
    totals,
    guestsByTable,
    supportsManualEdit,
    savingTableIds,
    refresh,
    adjustTable,
    clearTable,
  } = useLiveSeatingModel(resolvedEventId || null);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LiveFilter>('all');
  const [view, setView] = useState<LiveView>('map');
  const [activeTableId, setActiveTableId] = useState<string | null>(null);

  const columns = windowWidth >= 700 ? 3 : 2;

  const visibleTables = useMemo(() => {
    const q = query.trim().toLowerCase();

    return tables.filter((table) => {
      if (filter === 'adjusted') {
        if (table.manualExtra === 0) return false;
      } else if (filter !== 'all' && table.status !== filter) {
        return false;
      }

      if (!q) return true;

      if (String(table.number ?? '').includes(q)) return true;
      if (String(table.name || '').toLowerCase().includes(q)) return true;
      if (String(table.area || '').toLowerCase().includes(q)) return true;

      // Searching a guest's name should land on the table they are seated at.
      const seated = guestsByTable.get(table.id) || [];
      return seated.some((g) => String(g.name || '').toLowerCase().includes(q));
    });
  }, [filter, guestsByTable, query, tables]);

  // The map card is a fixed window the whole hall is scaled into, so the plan
  // is readable at a glance instead of needing to be panned around.
  const mapViewport = useMemo(
    () => ({
      width: Math.max(240, windowWidth - 24 - 20),
      height: Math.round(Math.min(Math.max(windowHeight * 0.46, 280), 460)),
    }),
    [windowHeight, windowWidth]
  );

  const mapLayout = useMemo(
    () => buildLiveMapLayout(visibleTables, mapViewport),
    [mapViewport, visibleTables]
  );

  const activeTable = useMemo(
    () => (activeTableId ? tables.find((t) => t.id === activeTableId) ?? null : null),
    [activeTableId, tables]
  );
  const activeGuests = useMemo(
    () => (activeTableId ? guestsByTable.get(activeTableId) || [] : []),
    [activeTableId, guestsByTable]
  );

  const handleAdjust = useCallback(
    async (tableId: string, delta: number) => {
      const result = await adjustTable(tableId, delta);
      if (!result.ok && result.error) Alert.alert('שגיאה', result.error);
    },
    [adjustTable]
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

  const occupancy = totals.capacity > 0 ? Math.min(1, totals.livePeople / totals.capacity) : 0;

  const controls = (
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

      <View style={styles.controlsRow}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={17} color={colors.gray[500]} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="חיפוש שולחן או שם אורח"
            placeholderTextColor={colors.gray[500]}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="ניקוי חיפוש">
              <Ionicons name="close-circle" size={17} color={colors.gray[500]} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.viewToggle}>
          {(['map', 'list'] as const).map((key) => {
            const active = view === key;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => setView(key)}
                style={[styles.viewToggleBtn, active && styles.viewToggleBtnActive]}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={key === 'map' ? 'תצוגת מפה' : 'תצוגת רשימה'}
                accessibilityState={{ selected: active }}
              >
                <Ionicons
                  name={key === 'map' ? 'map' : 'list'}
                  size={17}
                  color={active ? colors.white : 'rgba(6,23,62,0.45)'}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {FILTERS.map((item) => {
          const active = filter === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              onPress={() => setFilter(item.key)}
              style={[styles.filterChip, active && styles.filterChipActive]}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  const emptyBlock = (
    <View style={styles.emptyBox}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name="grid-outline" size={30} color="rgba(6,23,62,0.35)" />
      </View>
      <Text style={styles.emptyTitle}>
        {tables.length ? 'אין שולחנות שתואמים לסינון' : 'אין שולחנות באירוע'}
      </Text>
      <Text style={styles.emptyText}>
        {tables.length
          ? 'נסו לשנות את החיפוש או הסינון'
          : 'יש לבנות את מפת ההושבה לפני שימוש במפת הלייב'}
      </Text>
    </View>
  );

  return (
    <BackSwipe fallbackHref={backHref}>
      <View style={styles.screenRoot}>
        <StatusBar barStyle="light-content" backgroundColor={PALETTE.ink} />

        <View style={[styles.hero, { paddingTop: insets.top + 10 }]}>
          <LinearGradient
            colors={['#0C3070', '#071B45', PALETTE.inkDeep]}
            locations={[0, 0.58, 1]}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          <View style={styles.heroTopBar}>
            <TouchableOpacity
              onPress={() => router.replace(backHref as any)}
              style={styles.heroIconBtn}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="חזרה"
            >
              <Ionicons name="chevron-forward" size={21} color={colors.white} />
            </TouchableOpacity>

            <View style={styles.heroTitleWrap}>
              <LiveBadge />
              <Text style={styles.heroTitle} numberOfLines={1}>
                מפת לייב
              </Text>
              <Text style={styles.heroSubtitle} numberOfLines={1}>
                {eventTitle || 'אירוע'}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => void refresh({ silent: true })}
              style={styles.heroIconBtn}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="רענון"
            >
              {refreshing ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Ionicons name="refresh" size={19} color={colors.white} />
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.heroStat}>
            <View style={styles.heroStatMain}>
              <Text style={styles.heroStatValue}>{totals.livePeople}</Text>
              <View style={styles.heroStatCopy}>
                <Text style={styles.heroStatLabel}>יושבים עכשיו</Text>
                <Text style={styles.heroStatCaption}>
                  {`מתוך ${totals.capacity} מקומות · ${totals.freeSeats} פנויים`}
                </Text>
              </View>
            </View>

            <View style={styles.heroProgressTrack}>
              <View style={[styles.heroProgressFill, { width: `${Math.round(occupancy * 100)}%` }]} />
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.heroPills}>
            <HeroPill icon="checkbox-outline" label="צ׳ק-אין" value={String(totals.checkedInPeople)} />
            <HeroPill
              icon="hand-left-outline"
              label="תוספת ידנית"
              value={signed(totals.manualExtra)}
              tone={totals.adjustedTables > 0 ? 'warn' : undefined}
            />
            <HeroPill icon="albums-outline" label="שולחנות מלאים" value={`${totals.fullTables}/${totals.tables}`} />
            {totals.unseatedArrivedPeople > 0 ? (
              <HeroPill
                icon="alert-circle-outline"
                label="הגיעו ללא שולחן"
                value={String(totals.unseatedArrivedPeople)}
                tone="warn"
              />
            ) : null}
          </ScrollView>
        </View>

        <View style={styles.sheet}>
          {loading && !tables.length ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={PALETTE.ink} />
              <Text style={styles.loadingText}>טוען את מפת הלייב...</Text>
            </View>
          ) : view === 'list' ? (
            <FlatList
              data={visibleTables}
              key={`live-cols-${columns}`}
              numColumns={columns}
              keyExtractor={(item) => item.id}
              columnWrapperStyle={styles.gridRow}
              contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => void refresh({ silent: true })}
                  tintColor={PALETTE.ink}
                />
              }
              ListHeaderComponent={controls}
              renderItem={({ item }) => (
                <TableCard
                  table={item}
                  columns={columns}
                  saving={savingTableIds.has(item.id)}
                  canEdit={supportsManualEdit}
                  onOpen={() => setActiveTableId(item.id)}
                  onAdjust={(delta) => void handleAdjust(item.id, delta)}
                />
              )}
              ListEmptyComponent={emptyBlock}
            />
          ) : (
            <ScrollView
              contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => void refresh({ silent: true })}
                  tintColor={PALETTE.ink}
                />
              }
            >
              {controls}

              {visibleTables.length === 0 ? (
                emptyBlock
              ) : mapLayout.placed.length === 0 ? (
                // Belt and braces: never leave a blank canvas where tables exist.
                <View style={styles.emptyBox}>
                  <View style={styles.emptyIconWrap}>
                    <Ionicons name="map-outline" size={30} color="rgba(6,23,62,0.35)" />
                  </View>
                  <Text style={styles.emptyTitle}>לא ניתן לצייר את המפה</Text>
                  <Text style={styles.emptyText}>עברו לתצוגת רשימה כדי לראות ולעדכן את השולחנות</Text>
                </View>
              ) : (
                <>
                  <View style={[styles.canvasCard, { height: mapViewport.height + 20 }]}>
                    <View style={{ width: mapLayout.width, height: mapLayout.height }}>
                      {mapLayout.placed.map((placed) => (
                        <MapTile
                          key={placed.table.id}
                          placed={placed}
                          onPress={() => setActiveTableId(placed.table.id)}
                        />
                      ))}
                    </View>
                  </View>

                  <View style={styles.legendRow}>
                    {LEGEND.map((key) => (
                      <View key={key} style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: STATUS_STYLE[key].bar }]} />
                        <Text style={styles.legendText}>{STATUS_STYLE[key].label}</Text>
                      </View>
                    ))}
                  </View>

                  <Text style={styles.mapHint}>
                    {mapLayout.autoPlacedCount > 0
                      ? `הקישו על שולחן לעדכון · ${mapLayout.autoPlacedCount} שולחנות ללא מיקום בסקיצה מסודרים בתחתית המפה`
                      : 'הקישו על שולחן כדי לעדכן את מספר היושבים'}
                  </Text>
                </>
              )}
            </ScrollView>
          )}
        </View>

        <TableDetailModal
          table={activeTable}
          guests={activeGuests}
          saving={activeTable ? savingTableIds.has(activeTable.id) : false}
          canEdit={supportsManualEdit}
          onClose={() => setActiveTableId(null)}
          onAdjust={(delta) => {
            if (activeTable) void handleAdjust(activeTable.id, delta);
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
function LiveBadge() {
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
    <View style={styles.liveBadge}>
      <View style={styles.liveDotWrap}>
        <Animated.View style={[styles.liveDotRing, ringStyle]} />
        <View style={styles.liveDot} />
      </View>
      <Text style={styles.liveBadgeText}>בזמן אמת</Text>
    </View>
  );
}

function HeroPill({
  icon,
  label,
  value,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  tone?: 'warn';
}) {
  const warn = tone === 'warn';
  return (
    <View style={[styles.heroPill, warn && styles.heroPillWarn]}>
      <Ionicons name={icon} size={13} color={warn ? '#FFD27A' : 'rgba(255,255,255,0.75)'} />
      <Text style={[styles.heroPillLabel, warn && styles.heroPillLabelWarn]}>{label}</Text>
      <Text style={[styles.heroPillValue, warn && styles.heroPillValueWarn]}>{value}</Text>
    </View>
  );
}

/** One table on the spatial map, sized by its footprint and coloured by fill. */
function MapTile({ placed, onPress }: { placed: PlacedTable; onPress: () => void }) {
  const { table, left, top, width, height } = placed;
  const palette = STATUS_STYLE[table.status];
  const short = Math.min(width, height);

  const showCount = short >= 40;
  const numberSize = short >= 58 ? 16 : short >= 44 ? 13 : 11;
  const countSize = short >= 58 ? 12 : 10;
  const isReserve = table.shape === 'reserve';

  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.mapTile,
        {
          left,
          top,
          width,
          height,
          borderRadius: Math.max(6, Math.min(16, short * 0.22)),
          backgroundColor: isReserve ? 'rgba(6,23,62,0.82)' : palette.tint,
          borderColor: isReserve ? 'rgba(6,23,62,0.9)' : palette.border,
        },
        pressed && { opacity: 0.82 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${tableLabel(table)}, ${table.livePeople} מתוך ${table.capacity} יושבים`}
    >
      <Text
        style={[styles.mapTileNumber, { fontSize: numberSize }, isReserve && styles.mapTileNumberReserve]}
        numberOfLines={1}
      >
        {tableShortLabel(table)}
      </Text>
      {showCount ? (
        <Text
          style={[
            styles.mapTileCount,
            { fontSize: countSize, color: isReserve ? 'rgba(255,255,255,0.72)' : palette.bar },
          ]}
          numberOfLines={1}
        >
          {`${table.livePeople}/${table.capacity}`}
        </Text>
      ) : null}
      {table.manualExtra !== 0 && short >= 34 ? <View style={styles.mapTileFlag} /> : null}
    </Pressable>
  );
}

function TableCard({
  table,
  columns,
  saving,
  canEdit,
  onOpen,
  onAdjust,
}: {
  table: LiveSeatingTable;
  columns: number;
  saving: boolean;
  canEdit: boolean;
  onOpen: () => void;
  onAdjust: (delta: number) => void;
}) {
  const palette = STATUS_STYLE[table.status];
  const fill = table.capacity > 0 ? Math.min(1, table.livePeople / table.capacity) : 0;

  return (
    <View style={[styles.card, { maxWidth: `${100 / columns}%` }]}>
      <View style={styles.cardInner}>
        <Pressable
          onPress={onOpen}
          style={({ pressed }) => [styles.cardHeadArea, pressed && { opacity: 0.86 }]}
          accessibilityRole="button"
          accessibilityLabel={`${tableLabel(table)}, ${table.livePeople} מתוך ${table.capacity} יושבים`}
        >
          <View style={styles.cardTopRow}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {tableLabel(table)}
            </Text>
            <View style={[styles.cardStatusDot, { backgroundColor: palette.bar }]} />
          </View>

          <View style={styles.cardCountRow}>
            <Text style={[styles.cardCount, { color: palette.bar }]}>{table.livePeople}</Text>
            <Text style={styles.cardCapacity}>{`/ ${table.capacity}`}</Text>
            {table.manualExtra !== 0 ? (
              <View style={styles.manualBadge}>
                <Text style={styles.manualBadgeText}>{signed(table.manualExtra)}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${fill * 100}%`, backgroundColor: palette.bar }]} />
          </View>

          <Text style={styles.cardMeta} numberOfLines={1}>
            {table.status === 'over'
              ? `${table.livePeople - table.capacity} מעל התפוסה`
              : `${table.freeSeats} מקומות פנויים`}
          </Text>
        </Pressable>

        <View style={styles.stepperRow}>
          <StepperButton
            icon="remove"
            disabled={!canEdit || saving || table.livePeople <= 0}
            onPress={() => onAdjust(-1)}
            accessibilityLabel={`הפחתת יושב אחד מ${tableLabel(table)}`}
          />
          {saving ? (
            <ActivityIndicator size="small" color={colors.gray[600]} style={styles.stepperSpinner} />
          ) : (
            <Text style={styles.stepperHint}>יושבים</Text>
          )}
          <StepperButton
            icon="add"
            disabled={!canEdit || saving}
            onPress={() => onAdjust(1)}
            accessibilityLabel={`הוספת יושב אחד ל${tableLabel(table)}`}
          />
        </View>
      </View>
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
  guests,
  saving,
  canEdit,
  onClose,
  onAdjust,
  onClear,
}: {
  table: LiveSeatingTable | null;
  guests: Guest[];
  saving: boolean;
  canEdit: boolean;
  onClose: () => void;
  onAdjust: (delta: number) => void;
  onClear: () => void;
}) {
  const arrived = guests.filter((g) => g.checkedIn);
  const expected = guests.filter((g) => !g.checkedIn);
  const palette = table ? STATUS_STYLE[table.status] : STATUS_STYLE.empty;

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
                    <Text style={[styles.bigCounterValue, { color: palette.bar }]}>{table.livePeople}</Text>
                    <Text style={styles.bigCounterCaption}>{`מתוך ${table.capacity} מקומות`}</Text>
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

                <Text style={styles.sectionLabel}>{`הגיעו (${arrived.length})`}</Text>
                {arrived.length === 0 ? (
                  <Text style={styles.sectionEmpty}>אף אורח בשולחן לא סומן כהגיע</Text>
                ) : (
                  arrived.map((guest) => (
                    <View key={guest.id} style={styles.guestRow}>
                      <Text style={styles.guestCount}>{`${guestArrivedPeople(guest)}×`}</Text>
                      <Text style={styles.guestName} numberOfLines={1}>
                        {guest.name}
                      </Text>
                    </View>
                  ))
                )}

                {expected.length ? (
                  <>
                    <Text style={styles.sectionLabel}>{`טרם הגיעו (${expected.length})`}</Text>
                    {expected.map((guest) => (
                      <View key={guest.id} style={[styles.guestRow, styles.guestRowMuted]}>
                        <Text style={[styles.guestCount, styles.guestCountMuted]}>
                          {`${guestInvitedPeople(guest)}×`}
                        </Text>
                        <Text style={[styles.guestName, styles.guestNameMuted]} numberOfLines={1}>
                          {guest.name}
                        </Text>
                      </View>
                    ))}
                  </>
                ) : null}
              </ScrollView>
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
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
  hero: { position: 'relative', paddingHorizontal: 16, paddingBottom: 38, overflow: 'hidden' },
  heroTopBar: { flexDirection: ROW_DIR, alignItems: 'center', gap: 10 },
  heroIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitleWrap: { flex: 1, alignItems: 'center' },
  heroTitle: { marginTop: 5, fontSize: 19, fontWeight: '900', color: colors.white, textAlign: 'center' },
  heroSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.62)',
    textAlign: 'center',
  },

  liveBadge: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,77,77,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,77,77,0.38)',
  },
  liveDotWrap: { width: 7, height: 7, alignItems: 'center', justifyContent: 'center' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: PALETTE.live },
  liveDotRing: { position: 'absolute', width: 7, height: 7, borderRadius: 4, backgroundColor: PALETTE.live },
  liveBadgeText: { fontSize: 10, fontWeight: '900', color: '#FFB4B4', letterSpacing: 0.4 },

  heroStat: { marginTop: 20, gap: 12 },
  heroStatMain: { flexDirection: ROW_DIR, alignItems: 'center', gap: 14 },
  heroStatValue: { fontSize: 52, fontWeight: '900', color: colors.white, lineHeight: 56 },
  heroStatCopy: { flex: 1 },
  heroStatLabel: { fontSize: 15, fontWeight: '900', color: colors.white, textAlign: TEXT_RIGHT },
  heroStatCaption: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.62)',
    textAlign: TEXT_RIGHT,
  },
  heroProgressTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
  },
  heroProgressFill: { height: '100%', borderRadius: 999, backgroundColor: '#6EE7FF' },

  heroPills: { flexDirection: ROW_DIR, gap: 8, paddingTop: 16 },
  heroPill: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  heroPillWarn: { backgroundColor: 'rgba(240,203,70,0.14)', borderColor: 'rgba(240,203,70,0.36)' },
  heroPillLabel: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.7)' },
  heroPillLabelWarn: { color: '#FFD27A' },
  heroPillValue: { fontSize: 12.5, fontWeight: '900', color: colors.white },
  heroPillValueWarn: { color: '#FFE1A3' },

  // ----- Sheet -----
  sheet: {
    flex: 1,
    marginTop: -22,
    backgroundColor: PALETTE.sheet,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: 'hidden',
  },
  scrollContent: { paddingHorizontal: 12, paddingTop: 16 },
  gridRow: { flexDirection: ROW_DIR },

  controlsBlock: { gap: 12, paddingBottom: 14 },
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

  controlsRow: { flexDirection: ROW_DIR, alignItems: 'center', gap: 8 },
  searchWrap: {
    flex: 1,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.white,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.07)',
    paddingHorizontal: 13,
    height: 46,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: PALETTE.ink,
    textAlign: TEXT_RIGHT,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null),
  },
  viewToggle: {
    flexDirection: ROW_DIR,
    backgroundColor: colors.white,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.07)',
    padding: 3,
    gap: 3,
  },
  viewToggleBtn: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  viewToggleBtnActive: { backgroundColor: PALETTE.ink },

  filterRow: { flexDirection: ROW_DIR, gap: 7, paddingVertical: 1 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.07)',
  },
  filterChipActive: { backgroundColor: PALETTE.ink, borderColor: PALETTE.ink },
  filterChipText: { fontSize: 12, fontWeight: '800', color: 'rgba(6,23,62,0.6)' },
  filterChipTextActive: { color: colors.white },

  // ----- Map -----
  canvasCard: {
    backgroundColor: colors.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: PALETTE.ink,
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  mapTile: {
    position: 'absolute',
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapTileNumber: { fontWeight: '900', color: PALETTE.ink },
  mapTileNumberReserve: { color: colors.white },
  mapTileCount: { fontWeight: '900', marginTop: 1 },
  mapTileFlag: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#F59E0B',
  },

  legendRow: {
    flexDirection: ROW_DIR,
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 14,
    marginTop: 14,
  },
  legendItem: { flexDirection: ROW_DIR, alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { fontSize: 11.5, fontWeight: '800', color: 'rgba(6,23,62,0.55)' },
  mapHint: {
    marginTop: 10,
    fontSize: 11.5,
    fontWeight: '700',
    color: 'rgba(6,23,62,0.42)',
    textAlign: 'center',
    paddingHorizontal: 10,
  },

  // ----- List cards -----
  card: { flex: 1, padding: 5 },
  cardInner: {
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
    padding: 13,
    gap: 11,
    shadowColor: PALETTE.ink,
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  cardHeadArea: { gap: 8 },
  cardTopRow: { flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  cardTitle: { flex: 1, fontSize: 13, fontWeight: '900', color: PALETTE.ink, textAlign: TEXT_RIGHT },
  cardStatusDot: { width: 9, height: 9, borderRadius: 5 },
  manualBadge: {
    backgroundColor: 'rgba(245,158,11,0.14)',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  manualBadgeText: { fontSize: 10.5, fontWeight: '900', color: '#B45309' },

  cardCountRow: { flexDirection: ROW_DIR, alignItems: 'baseline', gap: 5 },
  cardCount: { fontSize: 28, fontWeight: '900', lineHeight: 32 },
  cardCapacity: { fontSize: 13.5, fontWeight: '800', color: 'rgba(6,23,62,0.45)' },

  progressTrack: { height: 6, borderRadius: 999, backgroundColor: 'rgba(6,23,62,0.07)', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
  cardMeta: { fontSize: 11, fontWeight: '700', color: 'rgba(6,23,62,0.45)', textAlign: TEXT_RIGHT },

  stepperRow: { flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'space-between' },
  stepperHint: { fontSize: 11, fontWeight: '800', color: 'rgba(6,23,62,0.32)' },
  stepperSpinner: { width: 34 },
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
  bigCounterCenter: { alignItems: 'center' },
  bigCounterValue: { fontSize: 44, fontWeight: '900', lineHeight: 50 },
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

  sectionLabel: { marginTop: 6, fontSize: 13, fontWeight: '900', color: PALETTE.ink, textAlign: TEXT_RIGHT },
  sectionEmpty: { fontSize: 12, fontWeight: '700', color: 'rgba(6,23,62,0.38)', textAlign: TEXT_RIGHT },

  guestRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(22,163,74,0.07)',
  },
  guestRowMuted: { backgroundColor: 'rgba(6,23,62,0.04)' },
  guestName: { flex: 1, fontSize: 14, fontWeight: '800', color: PALETTE.ink, textAlign: TEXT_RIGHT },
  guestNameMuted: { color: 'rgba(6,23,62,0.5)' },
  guestCount: { width: 44, fontSize: 13, fontWeight: '900', color: '#16A34A' },
  guestCountMuted: { color: 'rgba(6,23,62,0.38)' },
});
