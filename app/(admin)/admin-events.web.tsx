import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { eventService } from '@/lib/services/eventService';
import { Event } from '@/types';

export default function AdminEventsWebScreen() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState<string>(''); // YYYY-MM-DD
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    void loadEvents();
  }, []);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const data = await eventService.getEvents();
      setEvents(data);
    } finally {
      setLoading(false);
    }
  };

  const rows = useMemo(() => {
    const today = new Date();
    const toYmd = (d: Date) => d.toISOString().slice(0, 10);

    let filtered: Event[] = [...events];
    if (filterDate.trim()) {
      filtered = filtered.filter((e) => {
        const d = new Date((e as any).date);
        return toYmd(d) === filterDate.trim();
      });
    }

    filtered.sort((a, b) => {
      const da = new Date((a as any).date).getTime();
      const db = new Date((b as any).date).getTime();
      return sortOrder === 'asc' ? da - db : db - da;
    });

    return filtered.map((e) => {
      const d = new Date((e as any).date);
      const diff = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return {
        id: e.id,
        title: e.title,
        date: d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        location: e.location,
        city: e.city,
        daysLeft: diff >= 0 ? `עוד ${diff} ימים` : 'עבר',
      };
    });
  }, [events, filterDate, sortOrder]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRight}>
          <Ionicons name="calendar-outline" size={22} color={colors.primary} />
          <Text style={styles.title}>אירועים</Text>
        </View>

        <View style={styles.headerLeft}>
          <Pressable
            onPress={() => setSortOrder((p) => (p === 'asc' ? 'desc' : 'asc'))}
            style={({ hovered, pressed }) => [
              styles.ghostButton,
              (hovered || pressed) && styles.ghostButtonHover,
            ]}
          >
            <Ionicons name="swap-vertical" size={18} color={colors.text} />
            <Text style={styles.ghostButtonText}>מיון: {sortOrder === 'asc' ? 'עולה' : 'יורד'}</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push('/(admin)/admin-events-create')}
            style={({ hovered, pressed }) => [
              styles.primaryButton,
              (hovered || pressed) && styles.primaryButtonHover,
            ]}
          >
            <Ionicons name="add" size={18} color={colors.white} />
            <Text style={styles.primaryButtonText}>הוסף אירוע</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.filters}>
        <Text style={styles.filterHint}>סינון לפי תאריך (YYYY-MM-DD):</Text>
        <View style={styles.filterRow}>
          <input
            style={styles.webInput as any}
            value={filterDate}
            onChange={(e) => setFilterDate((e.target as HTMLInputElement).value)}
            placeholder="2026-02-02"
          />
          <Pressable
            onPress={() => setFilterDate('')}
            style={({ hovered, pressed }) => [
              styles.ghostButton,
              (hovered || pressed) && styles.ghostButtonHover,
            ]}
          >
            <Text style={styles.ghostButtonText}>נקה</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.table}>
        <View style={[styles.row, styles.rowHeader]}>
          <Text style={[styles.cell, styles.cellWide]}>שם אירוע</Text>
          <Text style={styles.cell}>תאריך</Text>
          <Text style={styles.cell}>מיקום</Text>
          <Text style={styles.cell}>עיר</Text>
          <Text style={styles.cell}>סטטוס</Text>
          <Text style={[styles.cell, styles.cellAction]} />
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator />
            <Text style={styles.loadingText}>טוען אירועים...</Text>
          </View>
        ) : (
          <ScrollView style={styles.body}>
            {rows.length === 0 ? (
              <Text style={styles.empty}>לא נמצאו אירועים.</Text>
            ) : (
              rows.map((r) => (
                <View key={r.id} style={styles.row}>
                  <Text style={[styles.cell, styles.cellWide]} numberOfLines={1}>
                    {r.title}
                  </Text>
                  <Text style={styles.cell}>{r.date}</Text>
                  <Text style={styles.cell} numberOfLines={1}>
                    {r.location}
                  </Text>
                  <Text style={styles.cell} numberOfLines={1}>
                    {r.city}
                  </Text>
                  <Text style={styles.cell}>{r.daysLeft}</Text>
                  <Pressable
                    onPress={() =>
                      router.push({ pathname: '/(admin)/admin-event-details', params: { id: r.id } })
                    }
                    style={({ hovered, pressed }) => [
                      styles.linkButton,
                      (hovered || pressed) && styles.linkButtonHover,
                    ]}
                  >
                    <Text style={styles.linkButtonText}>פרטים</Text>
                  </Pressable>
                </View>
              ))
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.gray[50],
  },
  header: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  headerRight: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  headerLeft: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  filters: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: 16,
    padding: 12,
    marginBottom: 14,
  },
  filterHint: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[700],
    textAlign: 'right',
  },
  filterRow: {
    marginTop: 8,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  webInput: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    border: `1px solid ${colors.gray[200]}`,
    background: colors.gray[50],
    padding: '0 12px',
    fontSize: 14,
    color: colors.text,
    direction: 'rtl',
    outline: 'none',
  },
  table: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: 16,
    overflow: 'hidden',
  },
  body: {
    maxHeight: 520,
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: colors.gray[200],
    gap: 10,
  },
  rowHeader: {
    borderTopWidth: 0,
    backgroundColor: colors.gray[100],
  },
  cell: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    textAlign: 'right',
  },
  cellWide: {
    flex: 2,
    fontWeight: '800',
  },
  cellAction: {
    flex: 0.6,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  primaryButtonHover: {
    opacity: 0.92,
  },
  primaryButtonText: {
    color: colors.white,
    fontWeight: '800',
  },
  ghostButton: {
    backgroundColor: colors.gray[100],
    borderWidth: 1,
    borderColor: colors.gray[200],
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  ghostButtonHover: {
    backgroundColor: colors.gray[200],
  },
  ghostButtonText: {
    color: colors.text,
    fontWeight: '800',
  },
  linkButton: {
    flex: 0.6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: `${colors.accent}22`,
    borderWidth: 1,
    borderColor: `${colors.accent}55`,
  },
  linkButtonHover: {
    backgroundColor: `${colors.accent}33`,
  },
  linkButtonText: {
    color: colors.text,
    fontWeight: '900',
    fontSize: 12,
  },
  loading: {
    padding: 18,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    color: colors.gray[700],
    fontWeight: '700',
  },
  empty: {
    padding: 18,
    color: colors.gray[700],
    textAlign: 'right',
    fontWeight: '700',
  },
});

