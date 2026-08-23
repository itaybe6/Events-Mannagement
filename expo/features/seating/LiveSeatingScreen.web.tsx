import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/constants/colors';
import AdminWebPageHeader from '@/components/desktop/AdminWebPageHeader';
import { useResponsive } from '@/lib/responsive';
import {
  useLiveSeatingModel,
  type LiveSeatingTable,
  type LiveTableStatus,
} from '@/features/seating/useLiveSeatingModel';
import LiveMapCanvas from '@/features/seating/LiveMapCanvas';

const WEB_RTL = Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null;

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
  empty: { bar: '#94A3B8', tint: '#F8FAFC', border: 'rgba(15,23,42,0.08)', label: 'ריק' },
  partial: { bar: '#3B82F6', tint: '#EFF6FF', border: 'rgba(59,130,246,0.28)', label: 'חלקי' },
  full: { bar: '#16A34A', tint: '#ECFDF5', border: 'rgba(22,163,74,0.32)', label: 'מלא' },
  over: { bar: '#F59E0B', tint: '#FFFBEB', border: 'rgba(245,158,11,0.38)', label: 'מעל תפוסה' },
};

function tableLabel(table: Pick<LiveSeatingTable, 'number' | 'name'>) {
  if (typeof table.number === 'number') return `שולחן ${table.number}`;
  const name = String(table.name || '').trim();
  return name || 'שולחן';
}

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

export default function LiveSeatingWebScreen() {
  const router = useRouter();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { isPhone } = useResponsive();
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
    setLivePeople,
    clearTable,
    clearAll,
  } = useLiveSeatingModel(resolvedEventId || null);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LiveFilter>('all');
  const [view, setView] = useState<LiveView>('map');
  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // The detail panel sits beside the grid on a desktop and replaces it on a phone.
  const showSidePanel = windowWidth >= 1100;

  const cardMinWidth = isPhone ? 150 : 190;

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

      const seated = guestsByTable.get(table.id) || [];
      return seated.some((g) => String(g.name || '').toLowerCase().includes(q));
    });
  }, [filter, guestsByTable, query, tables]);

  // A fixed window the whole hall is scaled into, so the plan reads at a glance
  // instead of needing to be panned around. The detail panel eats into it.
  const mapViewport = useMemo(
    () => ({
      width: Math.max(320, windowWidth - (showSidePanel && activeTableId ? 440 : 90)),
      height: Math.round(Math.min(Math.max(windowHeight * 0.52, 320), 620)),
    }),
    [activeTableId, showSidePanel, windowHeight, windowWidth]
  );

  const activeTable = useMemo(
    () => (activeTableId ? tables.find((t) => t.id === activeTableId) ?? null : null),
    [activeTableId, tables]
  );
  const handleAdjust = useCallback(
    async (tableId: string, delta: number) => {
      const result = await adjustTable(tableId, delta);
      setNotice(result.ok ? null : result.error ?? 'הפעולה נכשלה');
    },
    [adjustTable]
  );

  const handleSetCount = useCallback(
    async (tableId: string, value: number) => {
      const result = await setLivePeople(tableId, value);
      setNotice(result.ok ? null : result.error ?? 'הפעולה נכשלה');
    },
    [setLivePeople]
  );

  const handleClear = useCallback(
    async (tableId: string) => {
      const result = await clearTable(tableId);
      setNotice(result.ok ? null : result.error ?? 'הפעולה נכשלה');
    },
    [clearTable]
  );

  const handleClearAll = useCallback(async () => {
    const result = await clearAll();
    setNotice(result.ok ? 'כל העדכונים הידניים אופסו' : result.error ?? 'הפעולה נכשלה');
  }, [clearAll]);

  if (!resolvedEventId) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerTitle}>חסר מזהה אירוע</Text>
        <Pressable onPress={() => router.replace('/(admin)/admin-events')} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>חזרה לרשימת אירועים</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
      <AdminWebPageHeader
        eyebrow="בזמן אמת"
        title="מפת לייב"
        subtitle={[eventTitle || 'אירוע', `${totals.livePeople} יושבים כרגע`, `${totals.freeSeats} מקומות פנויים`].join(' • ')}
        actions={
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => void refresh({ silent: true })}
              style={({ hovered }: any) => [styles.ghostBtn, hovered && styles.ghostBtnHover]}
              accessibilityRole="button"
              accessibilityLabel="רענון"
            >
              {refreshing ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="refresh" size={16} color={colors.primary} />
              )}
              <Text style={styles.ghostBtnText}>רענון</Text>
            </Pressable>

            <Pressable
              onPress={() => router.push(backHref as any)}
              style={({ hovered }: any) => [styles.ghostBtn, hovered && styles.ghostBtnHover]}
              accessibilityRole="button"
              accessibilityLabel="חזרה לאירוע"
            >
              <Ionicons name="arrow-back" size={16} color={colors.primary} />
              <Text style={styles.ghostBtnText}>חזרה לאירוע</Text>
            </Pressable>
          </View>
        }
      />

      {error || notice || !supportsManualEdit ? (
        <View style={styles.noticeBox}>
          <Ionicons name="information-circle-outline" size={16} color="#B45309" />
          <Text style={styles.noticeText}>
            {error ||
              notice ||
              'עדכון ידני של כמות היושבים לא זמין — יש להריץ את מיגרציית מפת הלייב במסד הנתונים.'}
          </Text>
          {notice ? (
            <Pressable onPress={() => setNotice(null)} accessibilityLabel="סגירת ההודעה">
              <Ionicons name="close" size={15} color="#B45309" />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.statsRow}>
        <StatCard
          title="יושבים עכשיו"
          value={String(totals.livePeople)}
          caption={`מתוך ${totals.capacity} מקומות`}
          icon="people"
          accent={colors.primary}
          tone="dark"
        />
        <StatCard
          title="הגיעו לפי צ׳ק-אין"
          value={String(totals.checkedInPeople)}
          caption={`${totals.assignedPeople} משובצים בתכנון`}
          icon="checkbox-outline"
          accent="#16A34A"
        />
        <StatCard
          title="תוספת ידנית"
          value={signed(totals.manualExtra)}
          caption="עדכונים שנרשמו במפת הלייב"
          icon="hand-left-outline"
          accent="#B45309"
        />
        <StatCard
          title="שולחנות מלאים"
          value={`${totals.fullTables}/${totals.tables}`}
          caption={`${totals.emptyTables} ריקים · ${totals.overTables} מעל תפוסה`}
          icon="grid-outline"
          accent="#3B82F6"
        />
        {totals.unseatedArrivedPeople > 0 ? (
          <StatCard
            title="הגיעו ללא שולחן"
            value={String(totals.unseatedArrivedPeople)}
            caption="אורחים שסומנו כהגיעו אך אינם משובצים"
            icon="alert-circle-outline"
            accent="#DC2626"
          />
        ) : null}
      </View>

      <View style={styles.toolbar}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={17} color={colors.gray[500]} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="חיפוש לפי מספר שולחן, אזור או שם אורח"
            placeholderTextColor={colors.gray[500]}
            style={styles.searchInput}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} accessibilityLabel="ניקוי חיפוש">
              <Ionicons name="close-circle" size={17} color={colors.gray[500]} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.filterRow}>
          {FILTERS.map((item) => {
            const active = filter === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setFilter(item.key)}
                style={({ hovered }: any) => [
                  styles.filterChip,
                  active && styles.filterChipActive,
                  hovered && !active && styles.filterChipHover,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.viewToggle}>
          {(['map', 'list'] as const).map((key) => {
            const active = view === key;
            return (
              <Pressable
                key={key}
                onPress={() => setView(key)}
                style={({ hovered }: any) => [
                  styles.viewToggleBtn,
                  active && styles.viewToggleBtnActive,
                  hovered && !active && styles.viewToggleBtnHover,
                ]}
                accessibilityRole="button"
                accessibilityLabel={key === 'map' ? 'תצוגת מפה' : 'תצוגת רשימה'}
                accessibilityState={{ selected: active }}
              >
                <Ionicons
                  name={key === 'map' ? 'map-outline' : 'list-outline'}
                  size={15}
                  color={active ? colors.white : colors.gray[700]}
                />
                <Text style={[styles.viewToggleText, active && styles.viewToggleTextActive]}>
                  {key === 'map' ? 'מפה' : 'רשימה'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {totals.adjustedTables > 0 && supportsManualEdit ? (
          <Pressable
            onPress={() => void handleClearAll()}
            style={({ hovered }: any) => [styles.ghostBtn, hovered && styles.ghostBtnHover]}
            accessibilityRole="button"
          >
            <Ionicons name="refresh-outline" size={15} color={colors.gray[700]} />
            <Text style={[styles.ghostBtnText, { color: colors.gray[700] }]}>איפוס עדכונים ידניים</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.body, showSidePanel && styles.bodyWithPanel]}>
        <View style={styles.gridWrap}>
          {loading && !tables.length ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>טוען את מפת הלייב...</Text>
            </View>
          ) : visibleTables.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="grid-outline" size={38} color={colors.gray[400]} />
              <Text style={styles.emptyTitle}>
                {tables.length ? 'אין שולחנות שתואמים לסינון' : 'אין שולחנות באירוע'}
              </Text>
              <Text style={styles.emptyText}>
                {tables.length
                  ? 'נסו לשנות את החיפוש או הסינון'
                  : 'יש לבנות את מפת ההושבה לפני שימוש במפת הלייב'}
              </Text>
            </View>
          ) : view === 'list' ? (
            <View style={styles.grid}>
              {visibleTables.map((table) => (
                <TableCard
                  key={table.id}
                  table={table}
                  minWidth={cardMinWidth}
                  selected={table.id === activeTableId}
                  saving={savingTableIds.has(table.id)}
                  canEdit={supportsManualEdit}
                  onOpen={() => setActiveTableId((prev) => (prev === table.id ? null : table.id))}
                  onAdjust={(delta) => void handleAdjust(table.id, delta)}
                />
              ))}
            </View>
          ) : (
            <LiveMapCanvas
              tables={visibleTables}
              viewport={mapViewport}
              selectedId={activeTableId}
              onSelectTable={(id) => setActiveTableId((prev) => (prev === id ? null : id))}
              actionWord="לחצו"
            />
          )}
        </View>

        {activeTable ? (
          <View style={[styles.panel, showSidePanel ? styles.panelSide : styles.panelInline]}>
            <TableDetailPanel
              table={activeTable}
              saving={savingTableIds.has(activeTable.id)}
              canEdit={supportsManualEdit}
              onClose={() => setActiveTableId(null)}
              onAdjust={(delta) => void handleAdjust(activeTable.id, delta)}
              onSetCount={(value) => void handleSetCount(activeTable.id, value)}
              onClear={() => void handleClear(activeTable.id)}
            />
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

function StatCard({
  title,
  value,
  caption,
  icon,
  accent,
  tone,
}: {
  title: string;
  value: string;
  caption: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  tone?: 'dark';
}) {
  return (
    <View style={[styles.statCard, tone === 'dark' && styles.statCardDark]}>
      <View style={[styles.statIcon, { backgroundColor: tone === 'dark' ? 'rgba(255,255,255,0.12)' : `${accent}1A` }]}>
        <Ionicons name={icon} size={17} color={tone === 'dark' ? colors.white : accent} />
      </View>
      <View style={styles.statText}>
        <Text style={[styles.statTitle, tone === 'dark' && styles.statTitleDark]}>{title}</Text>
        <Text style={[styles.statValue, tone === 'dark' && styles.statValueDark]}>{value}</Text>
        <Text style={[styles.statCaption, tone === 'dark' && styles.statCaptionDark]}>{caption}</Text>
      </View>
    </View>
  );
}

function TableCard({
  table,
  minWidth,
  selected,
  saving,
  canEdit,
  onOpen,
  onAdjust,
}: {
  table: LiveSeatingTable;
  minWidth: number;
  selected: boolean;
  saving: boolean;
  canEdit: boolean;
  onOpen: () => void;
  onAdjust: (delta: number) => void;
}) {
  const palette = STATUS_STYLE[table.status];
  const fill = table.capacity > 0 ? Math.min(1, table.livePeople / table.capacity) : 0;

  return (
    <View
      style={[
        styles.card,
        { minWidth, backgroundColor: palette.tint, borderColor: palette.border },
        selected && styles.cardSelected,
      ]}
    >
      <Pressable
        onPress={onOpen}
        style={({ hovered }: any) => [styles.cardHeadArea, hovered && styles.cardHeadAreaHover]}
        accessibilityRole="button"
        accessibilityLabel={`${tableLabel(table)}, ${table.livePeople} מתוך ${table.capacity} יושבים`}
      >
        <View style={styles.cardTopRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {tableLabel(table)}
          </Text>
          {table.manualExtra !== 0 ? (
            <View style={styles.manualBadge}>
              <Text style={styles.manualBadgeText}>{signed(table.manualExtra)}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.cardCountRow}>
          <Text style={[styles.cardCount, { color: palette.bar }]}>{table.livePeople}</Text>
          <Text style={styles.cardCapacity}>{`/ ${table.capacity}`}</Text>
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
          <ActivityIndicator size="small" color={colors.gray[600]} />
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
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ hovered }: any) => [
        styles.stepperBtn,
        large && styles.stepperBtnLarge,
        disabled && styles.stepperBtnDisabled,
        hovered && !disabled && styles.stepperBtnHover,
      ]}
    >
      <Ionicons name={icon} size={large ? 24 : 18} color={disabled ? colors.gray[400] : colors.primary} />
    </Pressable>
  );
}

function TableDetailPanel({
  table,
  saving,
  canEdit,
  onClose,
  onAdjust,
  onSetCount,
  onClear,
}: {
  table: LiveSeatingTable;
  saving: boolean;
  canEdit: boolean;
  onClose: () => void;
  onAdjust: (delta: number) => void;
  onSetCount: (value: number) => void;
  onClear: () => void;
}) {
  const palette = STATUS_STYLE[table.status];
  const counter = useHeadcountEditor(table, canEdit, onSetCount);

  return (
    <>
      <View style={styles.panelHeader}>
        <View>
          <Text style={styles.panelTitle}>{tableLabel(table)}</Text>
          <Text style={[styles.panelStatus, { color: palette.bar }]}>{palette.label}</Text>
        </View>
        <Pressable onPress={onClose} style={styles.panelClose} accessibilityLabel="סגירה">
          <Ionicons name="close" size={17} color={colors.gray[600]} />
        </Pressable>
      </View>

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
            <Pressable
              onPress={counter.start}
              disabled={!canEdit || saving}
              accessibilityRole="button"
              accessibilityLabel={`${table.livePeople} יושבים, לחצו להקלדת מספר`}
              style={styles.bigCounterValueWrap}
            >
              <Text style={[styles.bigCounterValue, { color: palette.bar }]}>{table.livePeople}</Text>
              {canEdit ? <Ionicons name="create-outline" size={14} color={colors.gray[500]} /> : null}
            </Pressable>
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
        <Pressable
          onPress={onClear}
          disabled={saving}
          style={({ hovered }: any) => [styles.clearBtn, hovered && styles.clearBtnHover]}
          accessibilityRole="button"
        >
          <Ionicons name="refresh-outline" size={15} color={colors.gray[700]} />
          <Text style={styles.clearBtnText}>איפוס התוספת הידנית</Text>
        </Pressable>
      ) : null}
    </>
  );
}

/**
 * Tap-to-type headcount. Counting a table and typing "11" beats clicking plus
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
      <Text style={[styles.breakdownLabel, muted && styles.breakdownMuted]}>{label}</Text>
      <Text style={[styles.breakdownValue, emphasize && styles.breakdownValueEmphasis, muted && styles.breakdownMuted]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7FAFF' },
  pageContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40, gap: 16 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#F7FAFF' },
  centerTitle: { fontSize: 16, fontWeight: '900', color: colors.text },
  primaryBtn: { backgroundColor: colors.primary, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 12 },
  primaryBtnText: { color: colors.white, fontWeight: '900' },

  headerActions: { flexDirection: 'row', gap: 8, ...WEB_RTL },
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    ...WEB_RTL,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  ghostBtnHover: { backgroundColor: '#F1F5F9' },
  ghostBtnText: { fontSize: 12, fontWeight: '900', color: colors.primary },

  noticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    ...WEB_RTL,
  },
  noticeText: { flex: 1, fontSize: 12.5, fontWeight: '800', color: '#92400E', textAlign: 'right' },

  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, ...WEB_RTL },
  statCard: {
    flexGrow: 1,
    flexBasis: 210,
    minWidth: 190,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...WEB_RTL,
  },
  statCardDark: { backgroundColor: colors.primary, borderColor: colors.primary },
  statIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  statText: { flex: 1, minWidth: 0 },
  statTitle: { fontSize: 11.5, fontWeight: '800', color: colors.gray[600], textAlign: 'right' },
  statTitleDark: { color: 'rgba(255,255,255,0.72)' },
  statValue: { fontSize: 24, fontWeight: '900', color: colors.text, textAlign: 'right', lineHeight: 30 },
  statValueDark: { color: colors.white },
  statCaption: { fontSize: 11, fontWeight: '700', color: colors.gray[500], textAlign: 'right' },
  statCaptionDark: { color: 'rgba(255,255,255,0.62)' },

  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, ...WEB_RTL },
  searchWrap: {
    flexGrow: 1,
    flexBasis: 280,
    minWidth: 220,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 13,
    borderRadius: 13,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    ...WEB_RTL,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'right',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null),
  },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, ...WEB_RTL },
  filterChip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  filterChipHover: { backgroundColor: '#F1F5F9' },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: 12, fontWeight: '800', color: colors.gray[700] },
  filterChipTextActive: { color: colors.white },

  body: { gap: 16, ...WEB_RTL },
  bodyWithPanel: { flexDirection: 'row', alignItems: 'flex-start' },
  gridWrap: { flex: 1, minWidth: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, ...WEB_RTL },

  viewToggle: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    padding: 3,
    gap: 3,
    ...WEB_RTL,
  },
  viewToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    ...WEB_RTL,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  viewToggleBtnHover: { backgroundColor: '#F1F5F9' },
  viewToggleBtnActive: { backgroundColor: colors.primary },
  viewToggleText: { fontSize: 12, fontWeight: '800', color: colors.gray[700] },
  viewToggleTextActive: { color: colors.white },


  card: {
    flexGrow: 1,
    flexBasis: 190,
    maxWidth: 260,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  cardHeadArea: {
    gap: 8,
    borderRadius: 12,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  cardHeadAreaHover: {
    ...(Platform.OS === 'web' ? ({ opacity: 0.86 } as any) : null),
  },
  cardSelected: { borderColor: colors.primary, borderWidth: 2 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, ...WEB_RTL },
  cardTitle: { flex: 1, fontSize: 13.5, fontWeight: '900', color: colors.text, textAlign: 'right' },
  manualBadge: { backgroundColor: 'rgba(245,158,11,0.16)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  manualBadgeText: { fontSize: 11, fontWeight: '900', color: '#B45309' },

  cardCountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5, ...WEB_RTL },
  cardCount: { fontSize: 30, fontWeight: '900', lineHeight: 34 },
  cardCapacity: { fontSize: 14, fontWeight: '800', color: colors.gray[600] },

  progressTrack: { height: 6, borderRadius: 999, backgroundColor: 'rgba(15,23,42,0.08)', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
  cardMeta: { fontSize: 11.5, fontWeight: '700', color: colors.gray[600], textAlign: 'right' },

  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', ...WEB_RTL },
  stepperHint: { fontSize: 11, fontWeight: '800', color: colors.gray[500] },
  stepperBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  stepperBtnLarge: { width: 52, height: 52, borderRadius: 18 },
  stepperBtnHover: { backgroundColor: '#F1F5F9' },
  stepperBtnDisabled: { opacity: 0.45, ...(Platform.OS === 'web' ? ({ cursor: 'default' } as any) : null) },

  panel: {
    backgroundColor: colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    padding: 16,
    gap: 10,
    ...WEB_RTL,
  },
  panelSide: { width: 340, flexShrink: 0, position: 'sticky' as any, top: 16 },
  panelInline: { width: '100%' },
  panelHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', ...WEB_RTL },
  panelTitle: { fontSize: 17, fontWeight: '900', color: colors.text, textAlign: 'right' },
  panelStatus: { marginTop: 2, fontSize: 12, fontWeight: '900', textAlign: 'right' },
  panelClose: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },

  bigCounter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.gray[50],
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...WEB_RTL,
  },
  bigCounterCenter: { alignItems: 'center', minWidth: 110 },
  bigCounterValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    ...WEB_RTL,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  bigCounterValue: { fontSize: 38, fontWeight: '900', lineHeight: 44 },
  bigCounterInput: {
    fontSize: 38,
    fontWeight: '900',
    lineHeight: 44,
    minWidth: 100,
    textAlign: 'center',
    paddingVertical: 0,
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(15,23,42,0.18)',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null),
  },
  bigCounterCaption: { fontSize: 11.5, fontWeight: '800', color: colors.gray[600] },

  breakdown: { gap: 7 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', ...WEB_RTL },
  breakdownLabel: { fontSize: 12.5, fontWeight: '800', color: colors.gray[700], textAlign: 'right' },
  breakdownValue: { fontSize: 13.5, fontWeight: '900', color: colors.text },
  breakdownValueEmphasis: { color: '#B45309' },
  breakdownMuted: { color: colors.gray[500] },

  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.gray[100],
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    ...WEB_RTL,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  clearBtnHover: { backgroundColor: colors.gray[200] },
  clearBtnText: { fontSize: 12.5, fontWeight: '900', color: colors.gray[700] },



  loadingBox: { alignItems: 'center', gap: 10, paddingVertical: 60 },
  loadingText: { fontSize: 13, fontWeight: '800', color: colors.gray[600] },
  emptyBox: { alignItems: 'center', gap: 8, paddingVertical: 60, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 15, fontWeight: '900', color: colors.text, textAlign: 'center' },
  emptyText: { fontSize: 12.5, fontWeight: '700', color: colors.gray[600], textAlign: 'center' },
});
