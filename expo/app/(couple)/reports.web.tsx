import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/constants/colors';
import { guestMatchesSearch } from '@/lib/guestPhone';
import {
  RSVP_BUCKET_LABELS,
  arrivedPeople,
  invitedPeople,
  isConfirmedGuest,
  rsvpBucket,
  rsvpBucketLabel,
  type CoupleReportCategory,
  type CoupleReportGuest,
  type CoupleReportTable,
  type RsvpBucket,
} from '@/lib/coupleReports';
import { eventService } from '@/lib/services/eventService';
import { guestService } from '@/lib/services/guestService';
import { tableService } from '@/lib/services/tableService';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import { useUserStore } from '@/store/userStore';

type ReportKind = 'checkin' | 'rsvp';
type CheckInFilter = 'all' | 'arrived' | 'missing';
type RsvpFilter = 'all' | RsvpBucket;

const WEB_RTL = Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null;

function formatCount(n: number) {
  return (Number(n) || 0).toLocaleString('he-IL');
}

function formatCheckedInAt(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' }).format(date);
  } catch {
    return date.toLocaleString('he-IL');
  }
}

function sideLabel(side?: 'groom' | 'bride' | null) {
  if (side === 'bride') return 'כלה';
  if (side === 'groom') return 'חתן';
  return '';
}

function tableLabel(guest: CoupleReportGuest, tables: Map<string, CoupleReportTable>) {
  const tableId = String(guest.tableId ?? '').trim();
  if (!tableId) return 'ללא שולחן';
  const table = tables.get(tableId);
  if (typeof table?.number === 'number' && Number.isFinite(table.number)) return `שולחן ${table.number}`;
  const name = String(table?.name ?? '').trim();
  return name || 'שולחן';
}

function rsvpTone(bucket: RsvpBucket): 'green' | 'red' | 'gold' | 'purple' {
  if (bucket === 'confirmed') return 'green';
  if (bucket === 'declined') return 'red';
  if (bucket === 'maybe') return 'purple';
  return 'gold';
}

export default function CoupleReportsWebScreen() {
  const { eventId: queryEventId } = useLocalSearchParams<{ eventId?: string }>();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isCompact = width < 1100;

  const { userData } = useUserStore();
  const activeUserId = useEventSelectionStore((s) => s.activeUserId);
  const activeEventId = useEventSelectionStore((s) => s.activeEventId);
  const setActiveEvent = useEventSelectionStore((s) => s.setActiveEvent);

  const resolvedEventId = useMemo(
    () =>
      String(
        queryEventId ||
          (userData?.id && activeUserId === userData.id ? activeEventId : null) ||
          userData?.event_id ||
          ''
      ).trim() || null,
    [activeEventId, activeUserId, queryEventId, userData?.event_id, userData?.id]
  );

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [guests, setGuests] = useState<CoupleReportGuest[]>([]);
  const [categories, setCategories] = useState<CoupleReportCategory[]>([]);
  const [tables, setTables] = useState<CoupleReportTable[]>([]);

  const [kind, setKind] = useState<ReportKind>('checkin');
  const [checkInFilter, setCheckInFilter] = useState<CheckInFilter>('all');
  const [rsvpFilter, setRsvpFilter] = useState<RsvpFilter>('all');
  const [query, setQuery] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!resolvedEventId) {
        setGuests([]);
        setCategories([]);
        setTables([]);
        setLoading(false);
        return;
      }

      if (userData?.id) setActiveEvent(userData.id, resolvedEventId);
      setLoading(true);
      setErrorMsg(null);

      try {
        const [evt, guestRows, cats, tbls] = await Promise.all([
          eventService.getEventLite(resolvedEventId),
          guestService.getGuests(resolvedEventId),
          guestService.getGuestCategories(resolvedEventId),
          tableService.getTablesLite(resolvedEventId).catch(() => []),
        ]);
        if (cancelled) return;

        setEventTitle(String((evt as any)?.title || '').trim());
        setGuests(
          (guestRows || []).map((g) => ({
            id: g.id,
            name: g.name,
            phone: g.phone,
            status: g.status,
            category_id: g.category_id,
            tableId: g.tableId,
            numberOfPeople: g.numberOfPeople,
            checkedIn: g.checkedIn,
            checkedInAt: g.checkedInAt,
            checkedInCount: g.checkedInCount,
          }))
        );
        setCategories(
          (cats || []).map((c: any) => ({
            id: String(c.id),
            name: String(c.name || ''),
            side: c.side ?? null,
          }))
        );
        setTables(
          (tbls || []).map((t: any) => ({
            id: String(t.id),
            number: t.number ?? null,
            name: t.name ?? null,
          }))
        );
      } catch (error) {
        console.error('Couple reports load error:', error);
        if (!cancelled) {
          setErrorMsg('לא ניתן לטעון את הדוחות כרגע. נסו לרענן את העמוד.');
          setGuests([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [resolvedEventId, setActiveEvent, userData?.id]);

  const categoryById = useMemo(() => {
    const map = new Map<string, CoupleReportCategory>();
    for (const category of categories) map.set(String(category.id), category);
    return map;
  }, [categories]);

  const tableById = useMemo(() => {
    const map = new Map<string, CoupleReportTable>();
    for (const table of tables) map.set(String(table.id), table);
    return map;
  }, [tables]);

  const confirmers = useMemo(() => guests.filter(isConfirmedGuest), [guests]);

  const checkInStats = useMemo(() => {
    const arrived = confirmers.filter((g) => Boolean(g.checkedIn));
    const missing = confirmers.filter((g) => !g.checkedIn);
    const arrivedPeopleCount = arrived.reduce((sum, g) => sum + arrivedPeople(g), 0);
    const missingPeopleCount = missing.reduce((sum, g) => sum + invitedPeople(g), 0);
    const confirmedPeople = confirmers.reduce((sum, g) => sum + invitedPeople(g), 0);
    return {
      arrived,
      missing,
      arrivedCount: arrived.length,
      missingCount: missing.length,
      arrivedPeople: arrivedPeopleCount,
      missingPeople: missingPeopleCount,
      confirmedCount: confirmers.length,
      confirmedPeople,
      rate: confirmedPeople > 0 ? Math.round((arrivedPeopleCount / confirmedPeople) * 100) : 0,
    };
  }, [confirmers]);

  const rsvpStats = useMemo(() => {
    const buckets: Record<RsvpBucket, CoupleReportGuest[]> = {
      confirmed: [],
      declined: [],
      pending: [],
      maybe: [],
    };
    for (const guest of guests) buckets[rsvpBucket(guest.status)].push(guest);
    const people = (rows: CoupleReportGuest[]) => rows.reduce((sum, g) => sum + invitedPeople(g), 0);
    return {
      buckets,
      counts: {
        confirmed: people(buckets.confirmed),
        declined: people(buckets.declined),
        pending: people(buckets.pending),
        maybe: people(buckets.maybe),
        total: people(guests),
      },
      invites: {
        confirmed: buckets.confirmed.length,
        declined: buckets.declined.length,
        pending: buckets.pending.length,
        maybe: buckets.maybe.length,
        total: guests.length,
      },
    };
  }, [guests]);

  const visibleGuests = useMemo(() => {
    const q = query.trim();
    const source = kind === 'checkin' ? confirmers : guests;
    return source
      .filter((guest) => {
        if (q && !guestMatchesSearch(guest, q)) return false;
        if (kind === 'checkin') {
          if (checkInFilter === 'arrived') return Boolean(guest.checkedIn);
          if (checkInFilter === 'missing') return !guest.checkedIn;
          return true;
        }
        if (rsvpFilter === 'all') return true;
        return rsvpBucket(guest.status) === rsvpFilter;
      })
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'he'));
  }, [checkInFilter, confirmers, guests, kind, query, rsvpFilter]);

  const exportOpts = useMemo(
    () => ({
      eventTitle: eventTitle || 'אירוע',
      categories,
      tables,
    }),
    [categories, eventTitle, tables]
  );

  const handleExport = useCallback(async () => {
    if (exporting) return;
    if (kind === 'checkin' && !confirmers.length) {
      Alert.alert('אין נתונים לייצוא', 'עדיין אין מאשרים באירוע.');
      return;
    }
    if (kind === 'rsvp' && !guests.length) {
      Alert.alert('אין נתונים לייצוא', 'עדיין אין מוזמנים באירוע.');
      return;
    }

    setExporting(true);
    try {
      const mod = await import('@/lib/exportCoupleReportsExcel');
      if (kind === 'checkin') {
        mod.exportCheckInReportToExcel(guests, exportOpts);
      } else {
        mod.exportRsvpReportToExcel(guests, exportOpts);
      }
    } catch (error) {
      console.error('Couple reports excel export error:', error);
      const message = error instanceof Error ? error.message : '';
      Alert.alert('שגיאה', message.includes('אין') ? message : 'אירעה תקלה בייצוא לאקסל. נסו שוב.');
    } finally {
      setExporting(false);
    }
  }, [confirmers.length, exportOpts, exporting, guests, kind]);

  const renderStatusChip = (guest: CoupleReportGuest) => {
    if (kind === 'checkin') {
      const arrived = Boolean(guest.checkedIn);
      return (
        <View style={[styles.statusChip, arrived ? styles.chipGreen : styles.chipOrange]}>
          <Text style={[styles.statusChipText, arrived ? styles.chipTextGreen : styles.chipTextOrange]}>
            {arrived ? 'הגיע' : 'לא הגיע'}
          </Text>
        </View>
      );
    }
    const bucket = rsvpBucket(guest.status);
    const tone = rsvpTone(bucket);
    return (
      <View
        style={[
          styles.statusChip,
          tone === 'green'
            ? styles.chipGreen
            : tone === 'red'
              ? styles.chipRed
              : tone === 'purple'
                ? styles.chipPurple
                : styles.chipGold,
        ]}
      >
        <Text
          style={[
            styles.statusChipText,
            tone === 'green'
              ? styles.chipTextGreen
              : tone === 'red'
                ? styles.chipTextRed
                : tone === 'purple'
                  ? styles.chipTextPurple
                  : styles.chipTextGold,
          ]}
        >
          {rsvpBucketLabel(guest.status)}
        </Text>
      </View>
    );
  };

  const renderGuestMeta = (guest: CoupleReportGuest) => {
    const category = guest.category_id ? categoryById.get(String(guest.category_id).trim()) : undefined;
    const group = [sideLabel(category?.side), String(category?.name ?? '').trim()].filter(Boolean).join(' · ');
    const people = kind === 'checkin' && guest.checkedIn ? arrivedPeople(guest) : invitedPeople(guest);
    return { group, people, table: tableLabel(guest, tableById), phone: String(guest.phone ?? '').trim() };
  };

  return (
    <View style={[styles.page, isMobile ? styles.pageMobile : null]}>
      <View style={[styles.hero, isMobile ? styles.heroMobile : null]}>
        <View style={styles.heroCopy}>
          <View style={styles.eyebrow}>
            <Ionicons name="bar-chart-outline" size={14} color={colors.primary} />
            <Text style={styles.eyebrowText}>דוחות האירוע</Text>
          </View>
          <Text style={[styles.heroTitle, isMobile ? styles.heroTitleMobile : null]}>דוחות</Text>
          <Text style={styles.heroSubtitle}>
            {eventTitle
              ? `${eventTitle} · צ׳ק אין של מאשרים ואישורי הגעה, כולל ייצוא לאקסל.`
              : 'צ׳ק אין של מאשרים ואישורי הגעה, כולל ייצוא לאקסל.'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="ייצוא אקסל"
          onPress={() => void handleExport()}
          disabled={exporting || loading}
          style={({ hovered, pressed }: any) => [
            styles.exportBtn,
            Platform.OS === 'web' && hovered ? styles.exportBtnHover : null,
            pressed ? { opacity: 0.92 } : null,
            exporting || loading ? { opacity: 0.7 } : null,
          ]}
        >
          {exporting ? (
            <ActivityIndicator size={16} color={colors.white} />
          ) : (
            <Ionicons name="download-outline" size={18} color={colors.white} />
          )}
          <Text style={styles.exportBtnText}>{exporting ? 'מייצא…' : 'ייצוא אקסל'}</Text>
        </Pressable>
      </View>

      <View style={[styles.kindRow, isMobile ? styles.kindRowMobile : null]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: kind === 'checkin' }}
          onPress={() => setKind('checkin')}
          style={({ hovered, pressed }: any) => [
            styles.kindCard,
            kind === 'checkin' ? styles.kindCardActive : null,
            Platform.OS === 'web' && hovered && kind !== 'checkin' ? styles.kindCardHover : null,
            pressed ? { opacity: 0.94 } : null,
          ]}
        >
          <View style={[styles.kindIcon, kind === 'checkin' ? styles.kindIconActive : styles.kindIconCheckin]}>
            <Ionicons name="checkbox-outline" size={20} color={kind === 'checkin' ? colors.white : '#0E9F6E'} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.kindTitle, kind === 'checkin' ? styles.kindTitleActive : null]}>צ׳ק אין</Text>
            <Text style={[styles.kindText, kind === 'checkin' ? styles.kindTextActive : null]}>
              מאשרים שהגיעו ומאשרים שטרם הגיעו
            </Text>
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: kind === 'rsvp' }}
          onPress={() => setKind('rsvp')}
          style={({ hovered, pressed }: any) => [
            styles.kindCard,
            kind === 'rsvp' ? styles.kindCardActive : null,
            Platform.OS === 'web' && hovered && kind !== 'rsvp' ? styles.kindCardHover : null,
            pressed ? { opacity: 0.94 } : null,
          ]}
        >
          <View style={[styles.kindIcon, kind === 'rsvp' ? styles.kindIconActive : styles.kindIconRsvp]}>
            <Ionicons name="people-outline" size={20} color={kind === 'rsvp' ? colors.white : '#195DE6'} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.kindTitle, kind === 'rsvp' ? styles.kindTitleActive : null]}>אישורי הגעה</Text>
            <Text style={[styles.kindText, kind === 'rsvp' ? styles.kindTextActive : null]}>
              אישרו · לא אישרו · ממתינים · אולי
            </Text>
          </View>
        </Pressable>
      </View>

      {kind === 'checkin' ? (
        <View style={[styles.summaryRow, WEB_RTL]}>
          <SummaryCard title="מאשרים" value={formatCount(checkInStats.confirmedPeople)} subtitle={`${formatCount(checkInStats.confirmedCount)} הזמנות`} icon="checkmark-circle-outline" tone="blue" />
          <SummaryCard title="הגיעו" value={formatCount(checkInStats.arrivedPeople)} subtitle={`${formatCount(checkInStats.arrivedCount)} הזמנות`} icon="walk-outline" tone="green" />
          <SummaryCard title="לא הגיעו" value={formatCount(checkInStats.missingPeople)} subtitle={`${formatCount(checkInStats.missingCount)} הזמנות`} icon="time-outline" tone="orange" />
          <SummaryCard title="אחוז הגעה" value={`${checkInStats.rate}%`} subtitle="מתוך המאשרים" icon="pie-chart-outline" tone="navy" />
        </View>
      ) : (
        <View style={[styles.summaryRow, WEB_RTL]}>
          <SummaryCard title="סה״כ מוזמנים" value={formatCount(rsvpStats.counts.total)} subtitle={`${formatCount(rsvpStats.invites.total)} הזמנות`} icon="people-outline" tone="navy" />
          <SummaryCard title="אישרו הגעה" value={formatCount(rsvpStats.counts.confirmed)} subtitle={`${formatCount(rsvpStats.invites.confirmed)} הזמנות`} icon="checkmark-circle-outline" tone="green" />
          <SummaryCard title="לא אישרו" value={formatCount(rsvpStats.counts.declined)} subtitle={`${formatCount(rsvpStats.invites.declined)} הזמנות`} icon="close-circle-outline" tone="red" />
          <SummaryCard title="ממתינים" value={formatCount(rsvpStats.counts.pending)} subtitle={`${formatCount(rsvpStats.invites.pending)} הזמנות`} icon="hourglass-outline" tone="gold" />
          <SummaryCard title="אולי" value={formatCount(rsvpStats.counts.maybe)} subtitle={`${formatCount(rsvpStats.invites.maybe)} הזמנות`} icon="help-circle-outline" tone="purple" />
        </View>
      )}

      <View style={styles.tableCard}>
        <View style={[styles.tableTopBar, isMobile ? styles.tableTopBarMobile : null]}>
          <View style={styles.tableTopTextWrap}>
            <Text style={styles.tableTopTitle}>{kind === 'checkin' ? 'פירוט צ׳ק אין' : 'פירוט אישורי הגעה'}</Text>
            <Text style={styles.tableTopSubtitle}>
              {loading ? 'טוען נתונים…' : `${formatCount(visibleGuests.length)} שורות בתצוגה הנוכחית`}
            </Text>
          </View>

          <View style={[styles.tableTopActions, isMobile ? styles.tableTopActionsMobile : null]}>
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={16} color={colors.gray[500]} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="חיפוש לפי שם או טלפון"
                placeholderTextColor={colors.gray[500]}
                style={styles.searchInput}
                textAlign="right"
              />
              {query.trim() ? (
                <Pressable onPress={() => setQuery('')} accessibilityLabel="ניקוי חיפוש">
                  <Ionicons name="close-circle" size={16} color={colors.gray[500]} />
                </Pressable>
              ) : null}
            </View>

            <View style={[styles.filterRow, WEB_RTL]}>
              {kind === 'checkin'
                ? (
                    [
                      { key: 'all', label: `הכל · ${checkInStats.confirmedCount}` },
                      { key: 'arrived', label: `הגיעו · ${checkInStats.arrivedCount}` },
                      { key: 'missing', label: `לא הגיעו · ${checkInStats.missingCount}` },
                    ] as const
                  ).map((opt) => (
                    <FilterChip
                      key={opt.key}
                      label={opt.label}
                      active={checkInFilter === opt.key}
                      onPress={() => setCheckInFilter(opt.key)}
                    />
                  ))
                : (
                    [
                      { key: 'all', label: `הכל · ${rsvpStats.invites.total}` },
                      { key: 'confirmed', label: `${RSVP_BUCKET_LABELS.confirmed} · ${rsvpStats.invites.confirmed}` },
                      { key: 'declined', label: `${RSVP_BUCKET_LABELS.declined} · ${rsvpStats.invites.declined}` },
                      { key: 'pending', label: `${RSVP_BUCKET_LABELS.pending} · ${rsvpStats.invites.pending}` },
                      { key: 'maybe', label: `${RSVP_BUCKET_LABELS.maybe} · ${rsvpStats.invites.maybe}` },
                    ] as const
                  ).map((opt) => (
                    <FilterChip
                      key={opt.key}
                      label={opt.label}
                      active={rsvpFilter === opt.key}
                      onPress={() => setRsvpFilter(opt.key)}
                    />
                  ))}
            </View>
          </View>
        </View>

        {!isMobile ? (
          <View style={[styles.tableHeaderRow, WEB_RTL]}>
            <Text style={[styles.headerCell, styles.colName]}>שם</Text>
            <Text style={[styles.headerCell, styles.colPeople]}>אורחים</Text>
            <Text style={[styles.headerCell, styles.colStatus]}>סטטוס</Text>
            <Text style={[styles.headerCell, styles.colTable]}>שולחן</Text>
            {!isCompact ? <Text style={[styles.headerCell, styles.colGroup]}>קבוצה</Text> : null}
            <Text style={[styles.headerCell, styles.colPhone]}>טלפון</Text>
            {kind === 'checkin' ? <Text style={[styles.headerCell, styles.colTime]}>שעת צ׳ק אין</Text> : null}
          </View>
        ) : null}

        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.centerStateText}>טוען דוחות…</Text>
          </View>
        ) : errorMsg ? (
          <View style={styles.centerState}>
            <Ionicons name="alert-circle-outline" size={36} color={colors.error} />
            <Text style={styles.centerStateTitle}>שגיאה בטעינת הדוחות</Text>
            <Text style={styles.centerStateText}>{errorMsg}</Text>
          </View>
        ) : visibleGuests.length === 0 ? (
          <View style={styles.centerState}>
            <Ionicons name="document-text-outline" size={36} color={colors.gray[400]} />
            <Text style={styles.centerStateTitle}>אין שורות להצגה</Text>
            <Text style={styles.centerStateText}>נסו לשנות את הסינון או את החיפוש.</Text>
          </View>
        ) : (
          <View style={styles.rowsWrap}>
            {visibleGuests.map((guest) => {
              const meta = renderGuestMeta(guest);
              if (isMobile) {
                return (
                  <View key={guest.id || guest.name} style={styles.mobileRow}>
                    <View style={styles.mobileRowTop}>
                      <Text style={styles.guestName} numberOfLines={1}>
                        {guest.name}
                      </Text>
                      {renderStatusChip(guest)}
                    </View>
                    <Text style={styles.mobileMeta}>
                      {meta.people} אורחים · {meta.table}
                      {meta.group ? ` · ${meta.group}` : ''}
                    </Text>
                    {meta.phone ? <Text style={styles.mobileMeta}>{meta.phone}</Text> : null}
                    {kind === 'checkin' && guest.checkedIn ? (
                      <Text style={styles.mobileMeta}>{formatCheckedInAt(guest.checkedInAt)}</Text>
                    ) : null}
                  </View>
                );
              }

              return (
                <View key={guest.id || guest.name} style={[styles.tableRow, WEB_RTL]}>
                  <View style={styles.colName}>
                    <Text style={styles.guestName} numberOfLines={1}>
                      {guest.name}
                    </Text>
                  </View>
                  <View style={styles.colPeople}>
                    <Text style={styles.cellText}>{meta.people}</Text>
                  </View>
                  <View style={styles.colStatus}>{renderStatusChip(guest)}</View>
                  <View style={styles.colTable}>
                    <Text style={styles.cellMuted} numberOfLines={1}>
                      {meta.table}
                    </Text>
                  </View>
                  {!isCompact ? (
                    <View style={styles.colGroup}>
                      <Text style={styles.cellMuted} numberOfLines={1}>
                        {meta.group || '—'}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.colPhone}>
                    <Text style={styles.cellMuted} numberOfLines={1}>
                      {meta.phone || '—'}
                    </Text>
                  </View>
                  {kind === 'checkin' ? (
                    <View style={styles.colTime}>
                      <Text style={styles.cellMuted} numberOfLines={1}>
                        {guest.checkedIn ? formatCheckedInAt(guest.checkedInAt) : '—'}
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

function SummaryCard({
  title,
  value,
  subtitle,
  icon,
  tone,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: 'navy' | 'blue' | 'green' | 'orange' | 'red' | 'gold' | 'purple';
}) {
  const palette = {
    navy: { icon: colors.primary, bg: 'rgba(6,23,62,0.08)', card: '#FFFFFF' },
    blue: { icon: '#195DE6', bg: 'rgba(25,93,230,0.10)', card: '#FFFFFF' },
    green: { icon: '#0E9F6E', bg: 'rgba(14,159,110,0.10)', card: '#FFFFFF' },
    orange: { icon: '#C2410C', bg: 'rgba(194,65,12,0.10)', card: '#FFFFFF' },
    red: { icon: '#DC2626', bg: 'rgba(220,38,38,0.08)', card: '#FFFFFF' },
    gold: { icon: '#C6931A', bg: 'rgba(212,175,55,0.16)', card: '#FFFFFF' },
    purple: { icon: '#7C3AED', bg: 'rgba(124,58,237,0.10)', card: '#FFFFFF' },
  }[tone];

  return (
    <View style={[styles.summaryCard, tone === 'navy' ? styles.summaryCardDark : null]}>
      <View style={styles.summaryHeader}>
        <View style={[styles.summaryIcon, { backgroundColor: tone === 'navy' ? 'rgba(255,255,255,0.12)' : palette.bg }]}>
          <Ionicons name={icon} size={16} color={tone === 'navy' ? colors.white : palette.icon} />
        </View>
        <Text style={[styles.summaryTitle, tone === 'navy' ? styles.summaryTitleDark : null]}>{title}</Text>
      </View>
      <Text style={[styles.summaryValue, tone === 'navy' ? styles.summaryValueDark : null]}>{value}</Text>
      <Text style={[styles.summarySubtitle, tone === 'navy' ? styles.summarySubtitleDark : null]}>{subtitle}</Text>
    </View>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ hovered, pressed }: any) => [
        styles.filterChip,
        active ? styles.filterChipActive : null,
        Platform.OS === 'web' && hovered && !active ? styles.filterChipHover : null,
        pressed ? { opacity: 0.9 } : null,
      ]}
    >
      <Text style={[styles.filterChipText, active ? styles.filterChipTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 28,
    gap: 16,
  },
  pageMobile: {
    paddingHorizontal: 12,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  heroMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  eyebrow: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(6,23,62,0.06)',
  },
  eyebrowText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'right',
  },
  heroTitleMobile: {
    fontSize: 26,
  },
  heroSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
    lineHeight: 22,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 46,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: colors.primary,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  exportBtnHover: {
    backgroundColor: '#0A214F',
  },
  exportBtnText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
  kindRow: {
    flexDirection: 'row',
    gap: 12,
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  kindRowMobile: {
    flexDirection: 'column',
  },
  kindCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 92,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', boxShadow: '0 4px 14px rgba(11,28,65,0.04)' } as any) : null),
  },
  kindCardActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  kindCardHover: {
    backgroundColor: '#F8FAFD',
  },
  kindIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kindIconCheckin: {
    backgroundColor: 'rgba(14,159,110,0.12)',
  },
  kindIconRsvp: {
    backgroundColor: 'rgba(25,93,230,0.10)',
  },
  kindIconActive: {
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  kindTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'right',
  },
  kindTitleActive: {
    color: colors.white,
  },
  kindText: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
  },
  kindTextActive: {
    color: 'rgba(255,255,255,0.78)',
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  summaryCard: {
    flexGrow: 1,
    flexBasis: 150,
    minWidth: 140,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.05)',
    padding: 14,
    gap: 8,
  },
  summaryCardDark: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
  },
  summaryTitleDark: {
    color: 'rgba(255,255,255,0.78)',
  },
  summaryValue: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'right',
  },
  summaryValueDark: {
    color: colors.white,
  },
  summarySubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.gray[500],
    textAlign: 'right',
  },
  summarySubtitleDark: {
    color: 'rgba(255,255,255,0.62)',
  },
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.05)',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 8px 24px rgba(11,28,65,0.04)' } as any) : null),
  },
  tableTopBar: {
    gap: 14,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(6,23,62,0.06)',
  },
  tableTopBarMobile: {
    paddingHorizontal: 14,
  },
  tableTopTextWrap: {
    gap: 4,
  },
  tableTopTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'right',
  },
  tableTopSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[500],
    textAlign: 'right',
  },
  tableTopActions: {
    gap: 10,
  },
  tableTopActionsMobile: {
    gap: 10,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#F7FAFF',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null),
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#F4F7FC',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  filterChipActive: {
    backgroundColor: colors.primary,
  },
  filterChipHover: {
    backgroundColor: '#E8EEF8',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
  },
  filterChipTextActive: {
    color: colors.white,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: '#F8FAFD',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(6,23,62,0.06)',
  },
  headerCell: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[500],
    textAlign: 'right',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(6,23,62,0.05)',
  },
  colName: { flex: 1.4, minWidth: 0 },
  colPeople: { width: 72 },
  colStatus: { width: 110 },
  colTable: { flex: 0.9, minWidth: 0 },
  colGroup: { flex: 1, minWidth: 0 },
  colPhone: { width: 120 },
  colTime: { width: 130 },
  guestName: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'right',
  },
  cellText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'right',
  },
  cellMuted: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
  },
  statusChip: {
    alignSelf: 'flex-start',
    minHeight: 26,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '800',
  },
  chipGreen: { backgroundColor: 'rgba(14,159,110,0.12)' },
  chipTextGreen: { color: '#0E9F6E' },
  chipOrange: { backgroundColor: 'rgba(194,65,12,0.10)' },
  chipTextOrange: { color: '#C2410C' },
  chipRed: { backgroundColor: 'rgba(220,38,38,0.08)' },
  chipTextRed: { color: '#DC2626' },
  chipGold: { backgroundColor: 'rgba(212,175,55,0.16)' },
  chipTextGold: { color: '#A16207' },
  chipPurple: { backgroundColor: 'rgba(124,58,237,0.10)' },
  chipTextPurple: { color: '#7C3AED' },
  rowsWrap: {
    paddingBottom: 8,
  },
  mobileRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(6,23,62,0.05)',
    gap: 4,
  },
  mobileRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  mobileMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 20,
    gap: 8,
  },
  centerStateTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'center',
  },
  centerStateText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[500],
    textAlign: 'center',
  },
});
