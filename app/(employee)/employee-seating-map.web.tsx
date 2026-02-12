import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import DesktopTopBar, { TopBarIconButton } from '@/components/desktop/DesktopTopBar';
import { useSeatingMapModel } from '@/features/seating/useSeatingMapModel';

export default function EmployeeSeatingMapWebScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  const resolvedEventId = useMemo(() => String(eventId || '').trim(), [eventId]);
  const fallbackToDetails = useMemo(
    () =>
      resolvedEventId
        ? `/(employee)/employee-event-details?id=${resolvedEventId}`
        : '/(employee)/employee-events',
    [resolvedEventId]
  );

  const { loading, eventTitle, tables, guests, annotations, sumPeople, refresh } = useSeatingMapModel(
    resolvedEventId ? resolvedEventId : null
  );

  const [query, setQuery] = useState('');
  const [activeTableId, setActiveTableId] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const tableById = useMemo(() => new Map(tables.map((t) => [t.id, t])), [tables]);
  const activeTable = activeTableId ? tableById.get(activeTableId) : null;

  const guestsForActiveTable = useMemo(() => {
    if (!activeTableId) return [];
    return guests.filter((g) => g.table_id === activeTableId);
  }, [activeTableId, guests]);

  const filteredTables = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tables;
    return tables.filter((t) => {
      const label = `${t.number ?? ''} ${t.name ?? ''}`.toLowerCase();
      return label.includes(q);
    });
  }, [query, tables]);

  const stats = useMemo(() => {
    const byId = new Map<string, number>();
    guests.forEach((g) => {
      if (!g.table_id) return;
      byId.set(g.table_id, (byId.get(g.table_id) || 0) + (Number(g.number_of_people) || 1));
    });
    const full = tables.filter((t) => (byId.get(t.id) || 0) >= (Number(t.capacity) || 0)).length;
    const total = tables.length;
    const reserve = tables.filter((t) => t.shape === 'reserve').length;
    return { total, full, reserve };
  }, [guests, tables]);

  return (
    <View style={styles.page}>
      <DesktopTopBar
        title="מפת הושבה"
        subtitle={`${eventTitle || 'אירוע'}${resolvedEventId ? ` · ${resolvedEventId}` : ''}`}
        leftActions={
          <>
            <TopBarIconButton icon="arrow-forward" label="חזרה" onPress={() => router.replace(fallbackToDetails)} />
            <TopBarIconButton icon="refresh" label="רענון" onPress={() => void refresh()} />
          </>
        }
      />

      {!resolvedEventId ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="alert-circle-outline" size={44} color={colors.gray[500]} />
          <Text style={styles.emptyTitle}>חסר מזהה אירוע</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="חזרה לרשימת אירועים"
            onPress={() => router.replace('/(employee)/employee-events')}
            style={({ hovered, pressed }: any) => [
              styles.primaryBtn,
              Platform.OS === 'web' && hovered ? styles.primaryBtnHover : null,
              pressed ? { opacity: 0.92 } : null,
            ]}
          >
            <Text style={styles.primaryBtnText}>חזרה לרשימת אירועים</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.contentRow}>
          <View style={styles.main}>
            <View style={styles.mapCard}>
              {loading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={styles.loadingText}>טוען מפת הושבה...</Text>
                </View>
              ) : (
                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={{ minHeight: 720 }}
                  maximumZoomScale={3}
                  minimumZoomScale={0.5}
                  bounces={false}
                  bouncesZoom={false}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  showsVerticalScrollIndicator={false}
                >
                  <View style={styles.canvas}>
                    {tables.map((t) => {
                      const x = typeof t.x === 'number' ? t.x : 40;
                      const y = typeof t.y === 'number' ? t.y : 60;
                      const guestsAtTable = guests.filter((g) => g.table_id === t.id);
                      const totalPeople = sumPeople(guestsAtTable);
                      const isFull = totalPeople >= (Number(t.capacity) || 0);
                      const isReserve = t.shape === 'reserve';
                      const active = activeTableId === t.id;

                      return (
                        <Pressable
                          key={t.id}
                          accessibilityRole="button"
                          accessibilityLabel={`שולחן ${t.number ?? ''}`}
                          onPress={() => setActiveTableId(t.id)}
                          style={({ hovered, pressed }: any) => [
                            styles.table,
                            t.shape === 'rectangle' ? styles.tableRect : styles.tableSquare,
                            isFull ? styles.tableFull : null,
                            isReserve ? styles.tableReserve : null,
                            active ? styles.tableActive : null,
                            Platform.OS === 'web' && hovered ? styles.tableHover : null,
                            pressed ? { opacity: 0.92 } : null,
                            { left: x, top: y },
                          ]}
                        >
                          <Text style={[styles.tableNumber, (isFull || isReserve) ? { color: colors.white } : null]}>
                            {t.number ?? '?'}
                          </Text>
                          <Text style={[styles.tableCap, (isFull || isReserve) ? { color: 'rgba(255,255,255,0.88)' } : null]}>
                            {totalPeople} / {t.capacity}
                          </Text>
                        </Pressable>
                      );
                    })}

                    {annotations.map((a, idx) => (
                      <View
                        key={String(a.id || idx)}
                        style={[
                          styles.textArea,
                          {
                            left: typeof a.x === 'number' ? a.x : 200,
                            top: typeof a.y === 'number' ? a.y : 200 + idx * 40,
                          },
                        ]}
                      >
                        <Text style={styles.textAreaText}>{String(a.text || '').trim()}</Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              )}
            </View>
          </View>

          <View style={styles.side}>
            <View style={styles.filterCard}>
              <Text style={styles.cardTitle}>חיפוש וטבלאות</Text>

              <View style={styles.searchWrap}>
                <Ionicons name="search" size={18} color={colors.gray[500]} style={styles.searchIcon} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="חיפוש מספר/שם שולחן..."
                  placeholderTextColor={colors.gray[500]}
                  style={styles.searchInput}
                  textAlign="right"
                />
              </View>

              <View style={styles.statsRow}>
                <View style={styles.statPill}>
                  <Text style={styles.statValue}>{stats.total}</Text>
                  <Text style={styles.statLabel}>שולחנות</Text>
                </View>
                <View style={styles.statPill}>
                  <Text style={styles.statValue}>{stats.full}</Text>
                  <Text style={styles.statLabel}>מלאים</Text>
                </View>
                <View style={styles.statPill}>
                  <Text style={styles.statValue}>{stats.reserve}</Text>
                  <Text style={styles.statLabel}>רזרבה</Text>
                </View>
              </View>

              <View style={{ height: 10 }} />

              <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
                {filteredTables.map((t) => {
                  const active = activeTableId === t.id;
                  const guestsAt = guests.filter((g) => g.table_id === t.id);
                  const ppl = sumPeople(guestsAt);
                  const full = ppl >= (Number(t.capacity) || 0);
                  return (
                    <Pressable
                      key={t.id}
                      accessibilityRole="button"
                      accessibilityLabel={`בחירת שולחן ${t.number ?? ''}`}
                      onPress={() => setActiveTableId(t.id)}
                      style={({ hovered, pressed }: any) => [
                        styles.tableRow,
                        active ? styles.tableRowActive : null,
                        full ? styles.tableRowFull : null,
                        Platform.OS === 'web' && hovered ? styles.tableRowHover : null,
                        pressed ? { opacity: 0.92 } : null,
                      ]}
                    >
                      <View style={styles.tableRowLeft}>
                        <Text style={styles.tableRowCap}>{`${ppl}/${t.capacity}`}</Text>
                        {t.shape === 'reserve' ? <Text style={styles.reserveTag}>רזרבה</Text> : null}
                      </View>
                      <View style={styles.tableRowRight}>
                        <Text style={styles.tableRowTitle} numberOfLines={1}>
                          {t.number != null ? `שולחן ${t.number}` : 'שולחן'}
                        </Text>
                        <Text style={styles.tableRowSub} numberOfLines={1}>
                          {t.name || '—'}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.detailCard}>
              <Text style={styles.cardTitle}>פרטי שולחן</Text>

              {!activeTable ? (
                <View style={styles.detailEmpty}>
                  <Ionicons name="grid-outline" size={42} color={colors.gray[500]} />
                  <Text style={styles.emptyText}>בחר שולחן כדי לראות פרטים.</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.detailTitle} numberOfLines={1}>
                    {activeTable.number != null ? `שולחן ${activeTable.number}` : 'שולחן'}
                  </Text>
                  <Text style={styles.detailSub} numberOfLines={1}>
                    {activeTable.name || '—'}
                  </Text>

                  <View style={styles.detailMetaRow}>
                    <View style={styles.metaPill}>
                      <Text style={styles.metaPillText}>{`${sumPeople(guestsForActiveTable)}/${activeTable.capacity}`}</Text>
                    </View>
                    {activeTable.shape === 'reserve' ? (
                      <View style={[styles.metaPill, { backgroundColor: 'rgba(0,0,0,0.06)' }]}>
                        <Text style={styles.metaPillText}>רזרבה</Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.divider} />

                  <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
                    {guestsForActiveTable.length === 0 ? (
                      <Text style={styles.emptyText}>אין אורחים בשולחן.</Text>
                    ) : (
                      guestsForActiveTable.map((g) => (
                        <View key={g.id} style={styles.guestRow}>
                          <Text style={styles.guestPeople}>{`${Number(g.number_of_people) || 1}×`}</Text>
                          <Text style={styles.guestName} numberOfLines={1}>
                            {g.name}
                          </Text>
                        </View>
                      ))
                    )}
                  </ScrollView>
                </>
              )}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },

  contentRow: {
    flex: 1,
    flexDirection: 'row-reverse',
    gap: 16,
    paddingTop: 16,
    alignItems: 'flex-start',
  },
  main: { flex: 1, minWidth: 0 },
  side: { width: 380 },

  mapCard: {
    height: '100%',
    minHeight: 760,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    overflow: 'hidden',
  },
  canvas: { width: 1600, height: 980, backgroundColor: colors.white, position: 'relative' },

  table: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gray[50],
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.gray[300],
  },
  tableSquare: { width: 80, height: 80 },
  tableRect: { width: 64, height: 130 },
  tableHover: { opacity: 0.96 },
  tableActive: { borderColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } },
  tableFull: { backgroundColor: colors.success, borderColor: colors.success },
  tableReserve: { backgroundColor: 'rgba(0,0,0,0.74)', borderColor: colors.gray[800] },
  tableNumber: { fontWeight: '900', fontSize: 16, color: colors.text, textAlign: 'center' },
  tableCap: { fontSize: 12, fontWeight: '800', color: colors.gray[600], marginTop: 2, textAlign: 'center' },

  textArea: {
    position: 'absolute',
    backgroundColor: colors.gray[100],
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.gray[300],
  },
  textAreaText: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right' },

  filterCard: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    padding: 14,
    marginBottom: 16,
  },
  detailCard: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    padding: 14,
  },
  cardTitle: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right' },

  searchWrap: {
    marginTop: 12,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    justifyContent: 'center',
  },
  searchIcon: { position: 'absolute', left: 12 },
  searchInput: { paddingLeft: 40, paddingRight: 12, fontSize: 14, fontWeight: '800', color: colors.text },

  statsRow: { marginTop: 12, flexDirection: 'row-reverse', gap: 10 },
  statPill: { flex: 1, backgroundColor: 'rgba(15,23,42,0.04)', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 10, borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)' },
  statValue: { fontSize: 16, fontWeight: '900', color: colors.text, textAlign: 'center' },
  statLabel: { marginTop: 4, fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'center' },

  tableRow: { marginTop: 10, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 10, borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)', backgroundColor: 'rgba(15,23,42,0.03)', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  tableRowHover: { backgroundColor: 'rgba(15,23,42,0.05)' },
  tableRowActive: { backgroundColor: 'rgba(15,69,230,0.06)', borderColor: 'rgba(15,69,230,0.16)' },
  tableRowFull: { borderColor: 'rgba(34,197,94,0.30)' },
  tableRowRight: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  tableRowTitle: { fontSize: 12, fontWeight: '900', color: colors.text, textAlign: 'right' },
  tableRowSub: { marginTop: 2, fontSize: 12, fontWeight: '700', color: colors.gray[600], textAlign: 'right' },
  tableRowLeft: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  tableRowCap: { fontSize: 12, fontWeight: '900', color: colors.gray[800] },
  reserveTag: { fontSize: 12, fontWeight: '900', color: colors.gray[700], backgroundColor: 'rgba(0,0,0,0.06)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },

  detailEmpty: { paddingVertical: 18, alignItems: 'center', gap: 8 },
  detailTitle: { marginTop: 10, fontSize: 16, fontWeight: '900', color: colors.text, textAlign: 'right' },
  detailSub: { marginTop: 4, fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'right' },
  detailMetaRow: { marginTop: 10, flexDirection: 'row-reverse', gap: 10, flexWrap: 'wrap' },
  metaPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(15,69,230,0.08)', borderWidth: 1, borderColor: 'rgba(15,69,230,0.14)' },
  metaPillText: { fontSize: 12, fontWeight: '900', color: colors.text, textAlign: 'right' },
  divider: { height: 1, backgroundColor: 'rgba(15,23,42,0.08)', marginVertical: 12 },
  guestRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 10, borderRadius: 14, backgroundColor: 'rgba(15,23,42,0.04)', borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)', marginBottom: 10 },
  guestName: { flex: 1, textAlign: 'right', fontSize: 13, fontWeight: '900', color: colors.text },
  guestPeople: { width: 44, textAlign: 'left', fontSize: 12, fontWeight: '900', color: colors.primary },

  loadingRow: { paddingVertical: 26, alignItems: 'center', gap: 10 },
  loadingText: { fontSize: 13, fontWeight: '800', color: colors.gray[600] },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  emptyTitle: { fontSize: 15, fontWeight: '900', color: colors.text, textAlign: 'center' },
  emptyText: { fontSize: 13, fontWeight: '700', color: colors.gray[600], textAlign: 'center' },
  primaryBtn: {
    marginTop: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  primaryBtnHover: { opacity: 0.95 },
  primaryBtnText: { color: colors.white, fontSize: 13, fontWeight: '900', textAlign: 'center' },
});

