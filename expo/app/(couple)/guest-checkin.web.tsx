import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';

import WebAppMenu from '@/components/desktop/WebAppMenu';
import { useWebAppShell } from '@/components/desktop/WebAppShell';
import { colors } from '@/constants/colors';
import {
  guestArrivedPeople,
  guestInvitedPeople,
  isConfirmedGuest,
  useGuestCheckInModel,
} from '@/features/guests/useGuestCheckInModel';
import { eventService } from '@/lib/services/eventService';
import { tableService } from '@/lib/services/tableService';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import { useUserStore } from '@/store/userStore';
import type { Guest, Table } from '@/types';

type BoardTab = 'pending' | 'arrived';

type TableGroup = {
  key: string;
  label: string;
  sort: number;
  guests: Guest[];
  people: number;
};

function initialsFromName(name: string) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const a = parts[0]?.[0] ?? '';
  const b = parts[1]?.[0] ?? '';
  return `${a}${b}`.trim().toUpperCase() || '•';
}

function parseTableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number.parseInt(value.trim(), 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function rsvpBadge(status: Guest['status']) {
  if (status === 'אולי מגיע') return { label: 'אולי', tone: 'maybe' as const };
  if (status === 'ממתין') return { label: 'ממתין', tone: 'pending' as const };
  if (status === 'לא מגיע') return { label: 'לא מגיע', tone: 'declined' as const };
  return null;
}

function groupByTable(guests: Guest[], tableNumberById: Map<string, number | null>, tableLabelById: Map<string, string>) {
  const groups = new Map<string, TableGroup>();

  for (const guest of guests) {
    const tableId = String(guest.tableId ?? '').trim();
    const tableNumber = tableId ? tableNumberById.get(tableId) ?? null : null;
    let key = 'none';
    let label = 'ללא שולחן';
    let sort = 2_000_000;

    if (typeof tableNumber === 'number') {
      key = `t:${tableNumber}`;
      label = `שולחן ${tableNumber}`;
      sort = tableNumber;
    } else if (tableId) {
      key = `id:${tableId}`;
      label = tableLabelById.get(tableId) || 'שולחן';
      sort = 1_000_000;
    }

    const current = groups.get(key) || { key, label, sort, guests: [] as Guest[], people: 0 };
    current.guests.push(guest);
    current.people += guest.checkedIn ? guestArrivedPeople(guest) : guestInvitedPeople(guest);
    groups.set(key, current);
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (a.sort !== b.sort) return a.sort - b.sort;
    return a.label.localeCompare(b.label, 'he');
  });
}

function Switch({
  checked,
  disabled,
  saving,
  onPress,
  accessibilityLabel,
}: {
  checked: boolean;
  disabled?: boolean;
  saving?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked, disabled: Boolean(disabled) }}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      style={({ hovered, pressed }: any) => [
        styles.switchWrap,
        checked ? styles.switchWrapOn : null,
        disabled ? { opacity: 0.6 } : null,
        Platform.OS === 'web' && hovered ? styles.switchHover : null,
        pressed ? { opacity: 0.92 } : null,
      ]}
    >
      <View style={[styles.switchTrack, checked ? styles.switchTrackOn : null]} />
      <View style={[styles.switchThumb, checked ? styles.switchThumbOn : null]}>
        {saving ? <ActivityIndicator size={14} color={colors.primary} /> : null}
      </View>
    </Pressable>
  );
}

export default function CoupleGuestCheckInWebScreen() {
  const { eventId: queryEventId } = useLocalSearchParams<{ eventId?: string }>();
  const { width } = useWindowDimensions();
  const { hasSidebar } = useWebAppShell();
  const { userData } = useUserStore();
  const activeUserId = useEventSelectionStore((s) => s.activeUserId);
  const activeEventId = useEventSelectionStore((s) => s.activeEventId);

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

  const isMobile = width < 768;
  const isDual = width >= 960;

  const {
    loading,
    searching,
    listHint,
    guests,
    categories,
    filteredGuests,
    counts,
    query,
    setQuery,
    setFilter,
    refresh,
    toggleCheckIn,
    savingId,
    setCheckedInCount,
    savingCountId,
    addWalkInGuest,
    addingWalkIn,
  } = useGuestCheckInModel({
    eventId: resolvedEventId,
    errorTitle: 'שגיאה',
    errorMessage: 'לא ניתן לטעון את רשימת המאשרים',
  });

  const [eventTitle, setEventTitle] = useState('');
  const [tables, setTables] = useState<Table[]>([]);
  const [mobileTab, setMobileTab] = useState<BoardTab>('pending');
  const [exporting, setExporting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addPeople, setAddPeople] = useState(1);
  const [addError, setAddError] = useState<string | null>(null);
  const queryDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setFilter('all');
  }, [setFilter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let active = true;
    if (!resolvedEventId) {
      setEventTitle('');
      setTables([]);
      return;
    }
    void Promise.all([eventService.getEventLite(resolvedEventId), tableService.getTablesLite(resolvedEventId)])
      .then(([event, nextTables]) => {
        if (!active) return;
        setEventTitle(String(event?.title || '').trim());
        setTables(nextTables);
      })
      .catch(() => {
        if (!active) return;
        setEventTitle('');
        setTables([]);
      });
    return () => {
      active = false;
    };
  }, [resolvedEventId]);

  const onChangeQuery = useCallback(
    (text: string) => {
      if (queryDebounceRef.current) clearTimeout(queryDebounceRef.current);
      queryDebounceRef.current = setTimeout(() => setQuery(text), 120);
    },
    [setQuery]
  );

  useEffect(() => {
    return () => {
      if (queryDebounceRef.current) clearTimeout(queryDebounceRef.current);
    };
  }, []);

  const tableNumberById = useMemo(() => {
    const map = new Map<string, number | null>();
    tables.forEach((table) => map.set(table.id, parseTableNumber(table.number)));
    return map;
  }, [tables]);

  const tableLabelById = useMemo(() => {
    const map = new Map<string, string>();
    tables.forEach((table) => {
      const number = parseTableNumber(table.number);
      map.set(table.id, typeof number === 'number' ? `שולחן ${number}` : String(table.name || 'שולחן').trim());
    });
    return map;
  }, [tables]);

  const pendingGuests = useMemo(() => {
    return filteredGuests
      .filter((guest) => !guest.checkedIn)
      .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  }, [filteredGuests]);

  const arrivedGuests = useMemo(() => {
    return filteredGuests
      .filter((guest) => Boolean(guest.checkedIn))
      .sort((a, b) => {
        const aAt = a.checkedInAt ? new Date(a.checkedInAt).getTime() : 0;
        const bAt = b.checkedInAt ? new Date(b.checkedInAt).getTime() : 0;
        if (aAt !== bAt) return bAt - aAt;
        return a.name.localeCompare(b.name, 'he');
      });
  }, [filteredGuests]);

  const pendingGroups = useMemo(
    () => groupByTable(pendingGuests, tableNumberById, tableLabelById),
    [pendingGuests, tableLabelById, tableNumberById]
  );
  const arrivedGroups = useMemo(
    () => groupByTable(arrivedGuests, tableNumberById, tableLabelById),
    [arrivedGuests, tableLabelById, tableNumberById]
  );

  const attendanceRate = counts.confirmed > 0 ? Math.round((counts.checkedIn / counts.confirmed) * 100) : 0;

  const handleExport = useCallback(async () => {
    if (exporting) return;
    const hasRows = guests.some((guest) => isConfirmedGuest(guest) || guest.checkedIn);
    if (!hasRows) {
      Alert.alert('אין אורחים לייצוא', 'עדיין אין מאשרים או אורחים שסומנו כהגיעו.');
      return;
    }
    setExporting(true);
    try {
      const { exportCheckInGuestsToExcel } = await import('@/lib/exportCheckInGuestsExcel');
      exportCheckInGuestsToExcel(guests, {
        eventTitle: eventTitle || 'אירוע',
        categories,
        tables: tables.map((table) => ({
          id: table.id,
          number: parseTableNumber(table.number),
          name: table.name,
          capacity: table.capacity,
        })),
      });
    } catch (error) {
      console.error('Export check-in Excel error:', error);
      Alert.alert('שגיאה', 'אירעה תקלה בייצוא לאקסל. נסו שוב.');
    } finally {
      setExporting(false);
    }
  }, [categories, eventTitle, exporting, guests, tables]);

  const confirmAdd = useCallback(async () => {
    setAddError(null);
    const result = await addWalkInGuest({
      name: addName,
      phone: addPhone,
      numberOfPeople: addPeople,
    });
    if (!result.ok) {
      setAddError(result.error);
      return;
    }
    setAddOpen(false);
    setAddName('');
    setAddPhone('');
    setAddPeople(1);
    setMobileTab('arrived');
  }, [addName, addPeople, addPhone, addWalkInGuest]);

  const renderGuestRow = (guest: Guest) => {
    const checkedIn = Boolean(guest.checkedIn);
    const invited = guestInvitedPeople(guest);
    const arrived = guestArrivedPeople(guest);
    const tableId = String(guest.tableId ?? '').trim();
    const tableNumber = tableId ? tableNumberById.get(tableId) ?? null : null;
    const tableLabel =
      typeof tableNumber === 'number' ? `שולחן ${tableNumber}` : tableId ? tableLabelById.get(tableId) : '';
    const badge = !isConfirmedGuest(guest) ? rsvpBadge(guest.status) : null;
    const count = checkedIn ? arrived : invited;

    return (
      <View key={guest.id} style={[styles.guestRow, checkedIn ? styles.guestRowOn : null]}>
        <View style={[styles.guestAccent, checkedIn ? styles.guestAccentOn : null]} />
        <View style={[styles.avatar, checkedIn ? styles.avatarOn : null]}>
          <Text style={styles.avatarText}>{initialsFromName(guest.name)}</Text>
        </View>
        <View style={styles.guestCopy}>
          <Text style={styles.guestName} numberOfLines={1}>
            {guest.name}
          </Text>
          <View style={styles.guestMeta}>
            {tableLabel ? <Text style={styles.guestMetaText}>{tableLabel}</Text> : <Text style={styles.guestMetaMuted}>ללא שולחן</Text>}
            {badge ? (
              <View
                style={[
                  styles.rsvpChip,
                  badge.tone === 'maybe'
                    ? styles.rsvpChip_maybe
                    : badge.tone === 'pending'
                      ? styles.rsvpChip_pending
                      : styles.rsvpChip_declined,
                ]}
              >
                <Text
                  style={[
                    styles.rsvpChipText,
                    badge.tone === 'maybe'
                      ? styles.rsvpChipText_maybe
                      : badge.tone === 'pending'
                        ? styles.rsvpChipText_pending
                        : styles.rsvpChipText_declined,
                  ]}
                >
                  {badge.label}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.guestActions}>
          {checkedIn ? (
            <View style={styles.stepper}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`הפחת כמות שהגיעה עבור ${guest.name}`}
                onPress={() => void setCheckedInCount(guest, Math.max(0, count - 1))}
                disabled={savingCountId === guest.id || count <= 0}
                style={({ hovered, pressed }: any) => [
                  styles.stepBtn,
                  count <= 0 ? styles.stepBtnDisabled : null,
                  Platform.OS === 'web' && hovered ? styles.stepBtnHover : null,
                  pressed ? { opacity: 0.9 } : null,
                ]}
              >
                <Text style={styles.stepBtnText}>-</Text>
              </Pressable>
              <Text style={styles.stepCount}>{savingCountId === guest.id ? '…' : count}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`הגדל כמות שהגיעה עבור ${guest.name}`}
                onPress={() => void setCheckedInCount(guest, count + 1)}
                disabled={savingCountId === guest.id}
                style={({ hovered, pressed }: any) => [
                  styles.stepBtn,
                  Platform.OS === 'web' && hovered ? styles.stepBtnHover : null,
                  pressed ? { opacity: 0.9 } : null,
                ]}
              >
                <Text style={styles.stepBtnText}>+</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.peoplePill}>
              <Text style={styles.peoplePillText}>{invited}</Text>
            </View>
          )}
          <Switch
            checked={checkedIn}
            saving={savingId === guest.id}
            disabled={savingId === guest.id}
            accessibilityLabel={checkedIn ? `סמן שלא הגיע: ${guest.name}` : `סמן שהגיע: ${guest.name}`}
            onPress={() => void toggleCheckIn(guest)}
          />
        </View>
      </View>
    );
  };

  const renderColumn = (kind: BoardTab, groups: TableGroup[], emptyTitle: string, emptyText: string) => (
    <View style={[styles.boardCol, kind === 'arrived' ? styles.boardColArrived : styles.boardColPending]}>
      <View style={styles.boardColHeader}>
        <View style={[styles.boardColDot, kind === 'arrived' ? styles.boardColDotArrived : styles.boardColDotPending]} />
        <Text style={styles.boardColTitle}>{kind === 'arrived' ? 'הגיעו' : 'טרם הגיעו'}</Text>
        <View style={styles.boardColCount}>
          <Text style={styles.boardColCountText}>{kind === 'arrived' ? counts.checkedIn : counts.pending}</Text>
        </View>
      </View>
      <ScrollView style={styles.boardColScroll} contentContainerStyle={styles.boardColScrollContent} showsVerticalScrollIndicator={false}>
        {loading && groups.length === 0 ? (
          <View style={styles.emptyBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.emptyTitle}>טוען מאשרים…</Text>
          </View>
        ) : groups.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons
              name={kind === 'arrived' ? 'walk-outline' : 'hourglass-outline'}
              size={36}
              color={colors.gray[400]}
            />
            <Text style={styles.emptyTitle}>{emptyTitle}</Text>
            <Text style={styles.emptyText}>{emptyText}</Text>
          </View>
        ) : (
          groups.map((group) => (
            <View key={group.key} style={styles.tableGroup}>
              <View style={styles.tableGroupHeader}>
                <Text style={styles.tableGroupTitle}>{group.label}</Text>
                <Text style={styles.tableGroupMeta}>
                  {group.guests.length} · {group.people} אנשים
                </Text>
              </View>
              {group.guests.map(renderGuestRow)}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );

  return (
    <View style={styles.page}>
      {!hasSidebar ? (
        <View style={styles.mobileNavRow}>
          <WebAppMenu compact />
        </View>
      ) : null}

      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <View style={styles.livePill}>
            <Ionicons name="pulse-outline" size={13} color="#0E9F6E" />
            <Text style={styles.livePillText}>בזמן אמת</Text>
          </View>
          <Text style={styles.heroTitle}>צ׳ק אין מאשרים</Text>
          <Text style={styles.heroSubtitle}>
            {eventTitle
              ? `${eventTitle} · רשימת מי שאישר הגעה, מחולקת להגיעו ולטרם הגיעו.`
              : 'רשימת מי שאישר הגעה, מחולקת להגיעו ולטרם הגיעו.'}
          </Text>
        </View>

        <View style={styles.heroActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="ייצוא אקסל"
            onPress={() => void handleExport()}
            disabled={exporting}
            style={({ hovered, pressed }: any) => [
              styles.secondaryBtn,
              Platform.OS === 'web' && hovered ? styles.secondaryBtnHover : null,
              pressed ? { opacity: 0.92 } : null,
              exporting ? { opacity: 0.7 } : null,
            ]}
          >
            {exporting ? <ActivityIndicator size={14} color={colors.primary} /> : <Ionicons name="download-outline" size={16} color={colors.primary} />}
            {!isMobile ? <Text style={styles.secondaryBtnText}>{exporting ? 'מייצא…' : 'ייצוא אקסל'}</Text> : null}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="הוספת מוזמן שלא ברשימה"
            onPress={() => {
              setAddError(null);
              setAddOpen(true);
            }}
            style={({ hovered, pressed }: any) => [
              styles.primaryBtn,
              Platform.OS === 'web' && hovered ? styles.primaryBtnHover : null,
              pressed ? { opacity: 0.92 } : null,
            ]}
          >
            <Ionicons name="person-add" size={16} color={colors.white} />
            {!isMobile ? <Text style={styles.primaryBtnText}>הוסף מוזמן</Text> : null}
          </Pressable>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{counts.confirmed}</Text>
          <Text style={styles.statLabel}>מאשרים</Text>
        </View>
        <View style={[styles.statCard, styles.statCardArrived]}>
          <Text style={[styles.statValue, styles.statValueArrived]}>{counts.checkedIn}</Text>
          <Text style={styles.statLabel}>הגיעו</Text>
        </View>
        <View style={[styles.statCard, styles.statCardPending]}>
          <Text style={[styles.statValue, styles.statValuePending]}>{counts.pending}</Text>
          <Text style={styles.statLabel}>טרם הגיעו</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{attendanceRate}%</Text>
          <Text style={styles.statLabel}>יחס הגעה</Text>
        </View>
      </View>

      <View style={styles.progressWrap}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, attendanceRate))}%` } as any]} />
        </View>
        <Text style={styles.progressText}>
          {counts.checkedIn} מתוך {counts.confirmed} מאשרים באולם
          {counts.unexpectedArrived > 0 ? ` · +${counts.unexpectedArrived} הגיעו מחוץ לרשימה` : ''}
        </Text>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.gray[500]} />
        <TextInput
          style={styles.searchInput}
          placeholder="חיפוש שם או טלפון מתוך המאשרים…"
          placeholderTextColor={colors.gray[500]}
          defaultValue={query}
          onChangeText={onChangeQuery}
          textAlign="right"
          autoCapitalize="none"
        />
        {searching ? <ActivityIndicator size="small" color={colors.primary} /> : null}
      </View>
      {listHint ? <Text style={styles.listHint}>{listHint}</Text> : null}

      {!isDual ? (
        <View style={styles.mobileTabs}>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: mobileTab === 'pending' }}
            onPress={() => setMobileTab('pending')}
            style={[styles.mobileTab, mobileTab === 'pending' ? styles.mobileTabActivePending : null]}
          >
            <Text style={[styles.mobileTabText, mobileTab === 'pending' ? styles.mobileTabTextActive : null]}>
              טרם הגיעו · {counts.pending}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: mobileTab === 'arrived' }}
            onPress={() => setMobileTab('arrived')}
            style={[styles.mobileTab, mobileTab === 'arrived' ? styles.mobileTabActiveArrived : null]}
          >
            <Text style={[styles.mobileTabText, mobileTab === 'arrived' ? styles.mobileTabTextActive : null]}>
              הגיעו · {counts.checkedIn}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.board, isDual ? styles.boardDual : null]}>
        {isDual || mobileTab === 'pending'
          ? renderColumn('pending', pendingGroups, 'כולם כבר כאן', 'כל המאשרים סומנו כהגיעו, או שעדיין אין מאשרים.')
          : null}
        {isDual || mobileTab === 'arrived'
          ? renderColumn('arrived', arrivedGroups, 'עדיין אין הגעות', 'ברגע שמסמנים מאשר כהגיע, הוא יופיע כאן.')
          : null}
      </View>

      {addOpen ? (
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalScrim} onPress={() => !addingWalkIn && setAddOpen(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>מוזמן חדש בכניסה</Text>
            <Text style={styles.modalSubtitle}>מי שלא ברשימת המאשרים יתווסף ויסומן מיד כהגיע.</Text>
            <TextInput
              style={styles.formInput}
              value={addName}
              onChangeText={setAddName}
              placeholder="שם מלא"
              placeholderTextColor={colors.gray[500]}
              textAlign="right"
              autoFocus
            />
            <TextInput
              style={styles.formInput}
              value={addPhone}
              onChangeText={setAddPhone}
              placeholder="טלפון (לא חובה)"
              placeholderTextColor={colors.gray[500]}
              textAlign="right"
              keyboardType="phone-pad"
            />
            <View style={styles.formStepper}>
              <Pressable onPress={() => setAddPeople((n) => Math.max(1, n - 1))} style={styles.formStepBtn}>
                <Text style={styles.stepBtnText}>-</Text>
              </Pressable>
              <Text style={styles.formStepValue}>{addPeople} {addPeople === 1 ? 'אורח' : 'אורחים'}</Text>
              <Pressable onPress={() => setAddPeople((n) => Math.min(50, n + 1))} style={styles.formStepBtn}>
                <Text style={styles.stepBtnText}>+</Text>
              </Pressable>
            </View>
            {addError ? <Text style={styles.formError}>{addError}</Text> : null}
            <View style={styles.modalFooter}>
              <Pressable
                onPress={() => void confirmAdd()}
                disabled={addingWalkIn || !addName.trim()}
                style={[styles.primaryBtn, (!addName.trim() || addingWalkIn) && { opacity: 0.6 }]}
              >
                {addingWalkIn ? <ActivityIndicator size={14} color={colors.white} /> : <Text style={styles.primaryBtnText}>הוסף וסמן כהגיע</Text>}
              </Pressable>
              <Pressable onPress={() => setAddOpen(false)} disabled={addingWalkIn} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>ביטול</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
    ...(Platform.OS === 'web' ? ({ height: '100%' } as any) : null),
  },
  mobileNavRow: { alignItems: 'flex-start' },
  hero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroCopy: { flex: 1, minWidth: 0, alignItems: 'flex-end', gap: 4 },
  livePill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(14,159,110,0.10)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  livePillText: { fontSize: 11, fontWeight: '800', color: '#0E9F6E' },
  heroTitle: { fontSize: 28, fontWeight: '900', color: colors.primary, textAlign: 'right' },
  heroSubtitle: { fontSize: 13, fontWeight: '600', color: colors.gray[600], textAlign: 'right', lineHeight: 20 },
  heroActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  primaryBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  primaryBtnHover: { backgroundColor: '#0A2258' },
  primaryBtnText: { color: colors.white, fontWeight: '800', fontSize: 13 },
  secondaryBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.10)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  secondaryBtnHover: { backgroundColor: 'rgba(6,23,62,0.04)' },
  secondaryBtnText: { color: colors.primary, fontWeight: '800', fontSize: 13 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
    alignItems: 'center',
  },
  statCardArrived: { backgroundColor: 'rgba(14,159,110,0.06)', borderColor: 'rgba(14,159,110,0.16)' },
  statCardPending: { backgroundColor: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.18)' },
  statValue: { fontSize: 22, fontWeight: '900', color: colors.primary },
  statValueArrived: { color: '#0E9F6E' },
  statValuePending: { color: '#C2410C' },
  statLabel: { marginTop: 2, fontSize: 12, fontWeight: '800', color: colors.gray[600] },
  progressWrap: { gap: 6 },
  progressTrack: { height: 8, borderRadius: 999, backgroundColor: 'rgba(6,23,62,0.08)', overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 999, backgroundColor: '#0E9F6E' },
  progressText: { fontSize: 12, fontWeight: '700', color: colors.gray[600], textAlign: 'right' },
  searchWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
    paddingHorizontal: 14,
    minHeight: 48,
  },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.primary, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null) },
  listHint: { fontSize: 12, fontWeight: '600', color: colors.gray[500], textAlign: 'right' },
  mobileTabs: { flexDirection: 'row', gap: 8 },
  mobileTab: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(6,23,62,0.06)',
    alignItems: 'center',
  },
  mobileTabActivePending: { backgroundColor: '#C2410C' },
  mobileTabActiveArrived: { backgroundColor: '#0E9F6E' },
  mobileTabText: { fontWeight: '800', color: colors.primary, fontSize: 13 },
  mobileTabTextActive: { color: colors.white },
  board: { flex: 1, minHeight: 360, gap: 12 },
  boardDual: { flexDirection: 'row' },
  boardCol: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
    overflow: 'hidden',
  },
  boardColPending: { borderTopWidth: 4, borderTopColor: '#F59E0B' },
  boardColArrived: { borderTopWidth: 4, borderTopColor: '#0E9F6E' },
  boardColHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(6,23,62,0.06)',
  },
  boardColDot: { width: 8, height: 8, borderRadius: 4 },
  boardColDotPending: { backgroundColor: '#F59E0B' },
  boardColDotArrived: { backgroundColor: '#0E9F6E' },
  boardColTitle: { flex: 1, fontSize: 16, fontWeight: '900', color: colors.primary, textAlign: 'right' },
  boardColCount: { backgroundColor: 'rgba(6,23,62,0.06)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  boardColCountText: { fontSize: 13, fontWeight: '900', color: colors.primary },
  boardColScroll: { flex: 1 },
  boardColScrollContent: { padding: 12, gap: 12, paddingBottom: 20 },
  tableGroup: { gap: 6 },
  tableGroupHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingHorizontal: 4 },
  tableGroupTitle: { fontSize: 12, fontWeight: '900', color: colors.gray[600] },
  tableGroupMeta: { fontSize: 11, fontWeight: '700', color: colors.gray[500] },
  guestRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
    overflow: 'hidden',
  },
  guestRowOn: { backgroundColor: 'rgba(14,159,110,0.08)' },
  guestAccent: { width: 3, alignSelf: 'stretch', borderRadius: 99, backgroundColor: 'rgba(6,23,62,0.12)' },
  guestAccentOn: { backgroundColor: '#0E9F6E' },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(6,23,62,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOn: { backgroundColor: 'rgba(14,159,110,0.16)' },
  avatarText: { fontSize: 12, fontWeight: '900', color: colors.primary },
  guestCopy: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  guestName: { fontSize: 14, fontWeight: '800', color: colors.primary, textAlign: 'right' },
  guestMeta: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginTop: 2 },
  guestMetaText: { fontSize: 11, fontWeight: '700', color: colors.gray[600] },
  guestMetaMuted: { fontSize: 11, fontWeight: '700', color: colors.gray[400] },
  rsvpChip: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  rsvpChip_maybe: { backgroundColor: 'rgba(139,92,246,0.12)' },
  rsvpChip_pending: { backgroundColor: 'rgba(245,158,11,0.14)' },
  rsvpChip_declined: { backgroundColor: 'rgba(239,68,68,0.12)' },
  rsvpChipText: { fontSize: 10, fontWeight: '800' },
  rsvpChipText_maybe: { color: '#7C3AED' },
  rsvpChipText_pending: { color: '#B45309' },
  rsvpChipText_declined: { color: '#DC2626' },
  guestActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  peoplePill: { minWidth: 32, borderRadius: 999, backgroundColor: 'rgba(6,23,62,0.06)', paddingHorizontal: 8, paddingVertical: 4, alignItems: 'center' },
  peoplePillText: { fontSize: 12, fontWeight: '900', color: colors.primary },
  stepper: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  stepBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  stepBtnHover: { backgroundColor: 'rgba(6,23,62,0.04)' },
  stepBtnDisabled: { opacity: 0.4 },
  stepBtnText: { fontSize: 14, fontWeight: '900', color: colors.primary },
  stepCount: { minWidth: 18, textAlign: 'center', fontWeight: '900', color: colors.primary },
  switchWrap: {
    width: 48,
    height: 28,
    borderRadius: 999,
    justifyContent: 'center',
    backgroundColor: 'rgba(6,23,62,0.10)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  switchWrapOn: { backgroundColor: '#0E9F6E' },
  switchHover: { opacity: 0.96 },
  switchTrack: { ...StyleSheet.absoluteFillObject, borderRadius: 999 },
  switchTrackOn: {},
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    right: 3,
  },
  switchThumbOn: { right: 23 },
  emptyBox: { alignItems: 'center', paddingVertical: 36, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: colors.primary, textAlign: 'center' },
  emptyText: { fontSize: 13, fontWeight: '600', color: colors.gray[500], textAlign: 'center', maxWidth: 240 },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6,23,62,0.35)',
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    gap: 10,
    zIndex: 41,
  },
  modalTitle: { fontSize: 18, fontWeight: '900', color: colors.primary, textAlign: 'right' },
  modalSubtitle: { fontSize: 13, fontWeight: '600', color: colors.gray[600], textAlign: 'right' },
  formInput: {
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.10)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
    backgroundColor: '#F8FAFC',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null),
  },
  formStepper: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 12 },
  formStepBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(6,23,62,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formStepValue: { fontSize: 15, fontWeight: '800', color: colors.primary },
  formError: { color: '#DC2626', fontWeight: '700', textAlign: 'right' },
  modalFooter: { flexDirection: 'row-reverse', gap: 8, marginTop: 6 },
});
