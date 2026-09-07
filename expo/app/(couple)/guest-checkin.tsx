import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';

import { colors } from '@/constants/colors';
import {
  guestArrivedPeople,
  guestInvitedPeople,
  isConfirmedGuest,
  useGuestCheckInModel,
} from '@/features/guests/useGuestCheckInModel';
import { tableService } from '@/lib/services/tableService';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import { useUserStore } from '@/store/userStore';
import type { Guest, Table } from '@/types';

type BoardTab = 'pending' | 'arrived';

function tableLabel(guest: Guest, tables: Table[]) {
  const tableId = String(guest.tableId ?? '').trim();
  if (!tableId) return 'ללא שולחן';
  const table = tables.find((item) => item.id === tableId);
  if (typeof table?.number === 'number') return `שולחן ${table.number}`;
  return String(table?.name || 'שולחן').trim();
}

export default function CoupleGuestCheckInScreen() {
  const { eventId: queryEventId } = useLocalSearchParams<{ eventId?: string }>();
  const { userData } = useUserStore();
  const activeUserId = useEventSelectionStore((s) => s.activeUserId);
  const activeEventId = useEventSelectionStore((s) => s.activeEventId);
  const resolvedEventId =
    String(
      queryEventId ||
        (userData?.id && activeUserId === userData.id ? activeEventId : null) ||
        userData?.event_id ||
        ''
    ).trim() || null;

  const {
    loading,
    searching,
    filteredGuests,
    counts,
    setQuery,
    setFilter,
    refresh,
    toggleCheckIn,
    savingId,
  } = useGuestCheckInModel({
    eventId: resolvedEventId,
    errorTitle: 'שגיאה',
    errorMessage: 'לא ניתן לטעון את רשימת המאשרים',
  });

  const [tab, setTab] = useState<BoardTab>('pending');
  const [tables, setTables] = useState<Table[]>([]);

  useEffect(() => {
    setFilter('all');
  }, [setFilter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!resolvedEventId) return;
    void tableService.getTablesLite(resolvedEventId).then(setTables).catch(() => setTables([]));
  }, [resolvedEventId]);

  const pendingGuests = useMemo(
    () => filteredGuests.filter((guest) => !guest.checkedIn).sort((a, b) => a.name.localeCompare(b.name, 'he')),
    [filteredGuests]
  );
  const arrivedGuests = useMemo(
    () => filteredGuests.filter((guest) => Boolean(guest.checkedIn)),
    [filteredGuests]
  );
  const visible = tab === 'pending' ? pendingGuests : arrivedGuests;
  const rate = counts.confirmed > 0 ? Math.round((counts.checkedIn / counts.confirmed) * 100) : 0;

  const renderRow = useCallback(
    (guest: Guest) => {
      const checkedIn = Boolean(guest.checkedIn);
      const people = checkedIn ? guestArrivedPeople(guest) : guestInvitedPeople(guest);
      return (
        <View key={guest.id} style={[styles.row, checkedIn ? styles.rowOn : null]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.name} numberOfLines={1}>
              {guest.name}
            </Text>
            <Text style={styles.meta}>
              {tableLabel(guest, tables)} · {people} {people === 1 ? 'אורח' : 'אורחים'}
              {!isConfirmedGuest(guest) ? ` · ${guest.status}` : ''}
            </Text>
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: checkedIn }}
            disabled={savingId === guest.id}
            onPress={() => void toggleCheckIn(guest)}
            style={[styles.switch, checkedIn ? styles.switchOn : null]}
          >
            {savingId === guest.id ? (
              <ActivityIndicator size={14} color={checkedIn ? colors.white : colors.primary} />
            ) : (
              <Text style={[styles.switchText, checkedIn ? styles.switchTextOn : null]}>
                {checkedIn ? 'הגיע' : 'סמן'}
              </Text>
            )}
          </Pressable>
        </View>
      );
    },
    [savingId, tables, toggleCheckIn]
  );

  return (
    <View style={styles.page}>
      <Text style={styles.title}>צ׳ק אין מאשרים</Text>
      <Text style={styles.subtitle}>
        {counts.checkedIn} הגיעו · {counts.pending} טרם הגיעו · {rate}% מתוך {counts.confirmed} מאשרים
      </Text>

      <View style={styles.search}>
        <Ionicons name="search" size={16} color={colors.gray[500]} />
        <TextInput
          style={styles.searchInput}
          placeholder="חיפוש שם או טלפון"
          placeholderTextColor={colors.gray[500]}
          onChangeText={setQuery}
          textAlign="right"
        />
        {searching ? <ActivityIndicator size="small" color={colors.primary} /> : null}
      </View>

      <View style={styles.tabs}>
        <Pressable onPress={() => setTab('pending')} style={[styles.tab, tab === 'pending' && styles.tabPending]}>
          <Text style={[styles.tabText, tab === 'pending' && styles.tabTextOn]}>טרם הגיעו · {counts.pending}</Text>
        </Pressable>
        <Pressable onPress={() => setTab('arrived')} style={[styles.tab, tab === 'arrived' && styles.tabArrived]}>
          <Text style={[styles.tabText, tab === 'arrived' && styles.tabTextOn]}>הגיעו · {counts.checkedIn}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {loading && visible.length === 0 ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : visible.length === 0 ? (
          <Text style={styles.empty}>{tab === 'arrived' ? 'עדיין אין הגעות' : 'אין מאשרים שממתינים'}</Text>
        ) : (
          visible.map(renderRow)
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7FAFF', padding: 16, gap: 10 },
  title: { fontSize: 24, fontWeight: '900', color: colors.primary, textAlign: 'right' },
  subtitle: { fontSize: 13, fontWeight: '700', color: colors.gray[600], textAlign: 'right' },
  search: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
    paddingHorizontal: 12,
    minHeight: 46,
  },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.primary },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { flex: 1, borderRadius: 14, paddingVertical: 10, backgroundColor: 'rgba(6,23,62,0.06)', alignItems: 'center' },
  tabPending: { backgroundColor: '#C2410C' },
  tabArrived: { backgroundColor: '#0E9F6E' },
  tabText: { fontWeight: '800', color: colors.primary, fontSize: 13 },
  tabTextOn: { color: colors.white },
  list: { gap: 8, paddingBottom: 28 },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
  },
  rowOn: { backgroundColor: 'rgba(14,159,110,0.08)' },
  name: { fontSize: 15, fontWeight: '800', color: colors.primary, textAlign: 'right' },
  meta: { marginTop: 2, fontSize: 12, fontWeight: '600', color: colors.gray[600], textAlign: 'right' },
  switch: {
    minWidth: 64,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(6,23,62,0.08)',
    alignItems: 'center',
  },
  switchOn: { backgroundColor: '#0E9F6E' },
  switchText: { fontWeight: '800', color: colors.primary, fontSize: 12 },
  switchTextOn: { color: colors.white },
  empty: { marginTop: 32, textAlign: 'center', color: colors.gray[500], fontWeight: '700' },
});
