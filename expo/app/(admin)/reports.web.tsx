import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { colors } from '@/constants/colors';
import AdminWebPageHeader from '@/components/desktop/AdminWebPageHeader';
import { messageService, type MessageReportRow } from '@/lib/services/messageService';

type RangeKey = 'today' | '7d' | '30d' | 'all';

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'היום' },
  { key: '7d', label: '7 ימים' },
  { key: '30d', label: '30 ימים' },
  { key: 'all', label: 'הכל' },
];

function computeRange(key: RangeKey): { from: Date | null; to: Date | null } {
  if (key === 'all') return { from: null, to: null };
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  if (key === 'today') return { from: startOfToday, to: null };
  const days = key === '7d' ? 7 : 30;
  const from = new Date(startOfToday);
  from.setDate(from.getDate() - (days - 1));
  return { from, to: null };
}

function formatCount(n: number) {
  return (Number(n) || 0).toLocaleString('he-IL');
}

function formatReportDate(value: string) {
  // value is YYYY-MM-DD
  const parts = String(value).split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d}.${m}.${y}`;
  }
  return value;
}

function channelMeta(type: string): { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string } {
  if (type === 'וואטסאפ' || type === 'WHATSAPP') {
    return { label: 'WhatsApp', icon: 'logo-whatsapp', color: '#1FA855', bg: 'rgba(37,211,102,0.12)' };
  }
  return { label: 'SMS', icon: 'chatbubble-ellipses-outline', color: colors.primary, bg: 'rgba(6,23,62,0.07)' };
}

function SummaryCard({
  title,
  value,
  subtitle,
  icon,
  iconColor,
  iconBg,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
}) {
  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryHeader}>
        <View style={[styles.summaryIconBox, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
        <Text style={styles.summaryTitle}>{title}</Text>
      </View>
      <Text style={styles.summaryValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.summarySubtitle}>{subtitle}</Text>
    </View>
  );
}

export default function AdminReportsWebScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<MessageReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rangeKey, setRangeKey] = useState<RangeKey>('30d');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);

    const range = computeRange(rangeKey);
    messageService
      .getMessageReports(range)
      .then((data) => {
        if (cancelled) return;
        setRows(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load message reports:', err);
        setRows([]);
        setErrorMsg('לא ניתן לטעון את הדוחות כרגע. נסה לרענן את העמוד.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [rangeKey]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.eventTitle.toLowerCase().includes(q));
  }, [rows, query]);

  const totals = useMemo(() => {
    let sent = 0;
    let failed = 0;
    let total = 0;
    let sms = 0;
    let whatsapp = 0;
    const events = new Set<string>();
    for (const r of filteredRows) {
      sent += r.sentCount;
      failed += r.failedCount;
      total += r.totalCount;
      events.add(r.eventId);
      if (r.messageType === 'וואטסאפ' || r.messageType === 'WHATSAPP') whatsapp += r.totalCount;
      else sms += r.totalCount;
    }
    return { sent, failed, total, sms, whatsapp, events: events.size, batches: filteredRows.length };
  }, [filteredRows]);

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
      <AdminWebPageHeader
        eyebrow="דוחות"
        title="דוחות הודעות"
        subtitle="כל ההודעות שיצאו במערכת • לפי אירוע, תאריך וכמות"
      />

      <View style={styles.summaryRow}>
        <SummaryCard
          title="סך הודעות שיצאו"
          value={formatCount(totals.total)}
          subtitle={`${formatCount(totals.sent)} נשלחו · ${formatCount(totals.failed)} נכשלו`}
          icon="paper-plane-outline"
          iconColor={colors.primary}
          iconBg="rgba(6,23,62,0.07)"
        />
        <SummaryCard
          title="אירועים פעילים"
          value={formatCount(totals.events)}
          subtitle={`${formatCount(totals.batches)} משלוחים מתועדים`}
          icon="calendar-outline"
          iconColor="#C6931A"
          iconBg="rgba(212,175,55,0.14)"
        />
        <SummaryCard
          title="SMS"
          value={formatCount(totals.sms)}
          subtitle="הודעות SMS שיצאו"
          icon="chatbubble-ellipses-outline"
          iconColor="#195DE6"
          iconBg="rgba(25,93,230,0.10)"
        />
        <SummaryCard
          title="WhatsApp"
          value={formatCount(totals.whatsapp)}
          subtitle="הודעות וואטסאפ שיצאו"
          icon="logo-whatsapp"
          iconColor="#1FA855"
          iconBg="rgba(37,211,102,0.12)"
        />
      </View>

      <View style={styles.toolbarCard}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.gray[500]} style={styles.searchIcon} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="חיפוש לפי שם אירוע..."
            placeholderTextColor={colors.gray[500]}
            style={styles.searchInput}
            textAlign="right"
          />
          {query.trim() ? (
            <Pressable onPress={() => setQuery('')} style={({ pressed }: any) => [styles.clearBtn, pressed ? { opacity: 0.7 } : null]}>
              <Ionicons name="close" size={14} color={colors.gray[600]} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.rangeRow}>
          {RANGE_OPTIONS.map((opt) => {
            const active = opt.key === rangeKey;
            return (
              <Pressable
                key={opt.key}
                onPress={() => setRangeKey(opt.key)}
                style={({ hovered, pressed }: any) => [
                  styles.rangeChip,
                  active ? styles.rangeChipActive : null,
                  Platform.OS === 'web' && hovered && !active ? styles.rangeChipHover : null,
                  pressed ? { opacity: 0.9 } : null,
                ]}
              >
                <Text style={[styles.rangeChipText, active ? styles.rangeChipTextActive : null]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.tableCard}>
        <View style={styles.tableHeaderRow}>
          <View style={styles.colEventWrap}>
            <Text style={styles.headerCellText}>אירוע</Text>
          </View>
          <View style={styles.colDate}>
            <Text style={styles.headerCellText}>תאריך</Text>
          </View>
          <View style={styles.colChannel}>
            <Text style={styles.headerCellText}>ערוץ</Text>
          </View>
          <View style={styles.colNum}>
            <Text style={styles.headerCellText}>נשלחו</Text>
          </View>
          <View style={styles.colNum}>
            <Text style={styles.headerCellText}>נכשלו</Text>
          </View>
          <View style={styles.colNum}>
            <Text style={styles.headerCellText}>סה״כ</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.centerStateText}>טוען דוחות...</Text>
          </View>
        ) : errorMsg ? (
          <View style={styles.centerState}>
            <Ionicons name="alert-circle-outline" size={40} color={colors.error} />
            <Text style={styles.centerStateTitle}>שגיאה בטעינת הדוחות</Text>
            <Text style={styles.centerStateText}>{errorMsg}</Text>
          </View>
        ) : filteredRows.length === 0 ? (
          <View style={styles.centerState}>
            <Ionicons name="document-text-outline" size={40} color={colors.gray[500]} />
            <Text style={styles.centerStateTitle}>אין הודעות בטווח הנבחר</Text>
            <Text style={styles.centerStateText}>נסה לשנות את טווח התאריכים או את החיפוש.</Text>
          </View>
        ) : (
          filteredRows.map((r, idx) => {
            const ch = channelMeta(r.messageType);
            return (
              <Pressable
                key={`${r.eventId}|${r.sendDate}|${r.messageType}`}
                onPress={() => router.push({ pathname: '/(admin)/admin-event-details', params: { id: r.eventId } })}
                style={({ hovered, pressed }: any) => [
                  styles.tableRow,
                  idx % 2 === 1 ? styles.tableRowAlt : null,
                  Platform.OS === 'web' && hovered ? styles.tableRowHover : null,
                  pressed ? { opacity: 0.95 } : null,
                ]}
              >
                <View style={styles.colEventWrap}>
                  <Text style={styles.eventTitleText} numberOfLines={1}>
                    {r.eventTitle}
                  </Text>
                </View>
                <View style={styles.colDate}>
                  <Text style={styles.dateText}>{formatReportDate(r.sendDate)}</Text>
                </View>
                <View style={styles.colChannel}>
                  <View style={[styles.channelPill, { backgroundColor: ch.bg }]}>
                    <Ionicons name={ch.icon} size={13} color={ch.color} />
                    <Text style={[styles.channelPillText, { color: ch.color }]}>{ch.label}</Text>
                  </View>
                </View>
                <View style={styles.colNum}>
                  <Text style={[styles.numText, styles.numSent]}>{formatCount(r.sentCount)}</Text>
                </View>
                <View style={styles.colNum}>
                  <Text style={[styles.numText, r.failedCount > 0 ? styles.numFailed : styles.numMuted]}>
                    {formatCount(r.failedCount)}
                  </Text>
                </View>
                <View style={styles.colNum}>
                  <Text style={[styles.numText, styles.numTotal]}>{formatCount(r.totalCount)}</Text>
                </View>
              </Pressable>
            );
          })
        )}

        {!loading && !errorMsg && filteredRows.length > 0 ? (
          <View style={styles.tableFooter}>
            <Text style={styles.tableFooterText}>מציג {formatCount(filteredRows.length)} משלוחים</Text>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#F7FAFF',
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage:
            'radial-gradient(circle at top right, rgba(25,93,230,0.14), rgba(25,93,230,0) 40%), radial-gradient(circle at top left, rgba(232,241,255,0.95), rgba(232,241,255,0) 34%), radial-gradient(circle at bottom left, rgba(242,224,186,0.34), rgba(242,224,186,0) 32%), radial-gradient(circle at bottom center, rgba(240,203,70,0.12), rgba(240,203,70,0) 26%)',
        } as any)
      : null),
  },
  pageContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
    gap: 20,
    width: '100%',
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  summaryCard: {
    flexGrow: 1,
    flexBasis: 220,
    minWidth: 200,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.05)',
    padding: 18,
    gap: 10,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 4px 14px rgba(11,28,65,0.03)' } as any) : null),
  },
  summaryHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
  },
  summaryIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
    flex: 1,
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  summarySubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.gray[500],
    textAlign: 'right',
  },
  toolbarCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.05)',
    padding: 16,
    gap: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 4px 14px rgba(11,28,65,0.03)' } as any) : null),
  },
  searchWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#F4F6FB',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 46,
    flexGrow: 1,
    flexBasis: 280,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
  },
  searchIcon: {
    marginLeft: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null),
  },
  clearBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(6,23,62,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  rangeRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  rangeChip: {
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F6FB',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  rangeChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  rangeChipHover: {
    backgroundColor: 'rgba(25,93,230,0.06)',
  },
  rangeChipText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.gray[600],
  },
  rangeChipTextActive: {
    color: '#FFFFFF',
  },
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.05)',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 4px 14px rgba(11,28,65,0.03)' } as any) : null),
  },
  tableHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: '#F8FAFD',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(6,23,62,0.06)',
  },
  headerCellText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
  },
  tableRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(6,23,62,0.04)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  tableRowAlt: {
    backgroundColor: 'rgba(244,246,251,0.5)',
  },
  tableRowHover: {
    backgroundColor: 'rgba(25,93,230,0.04)',
  },
  colEventWrap: {
    flex: 1,
    minWidth: 160,
    paddingLeft: 8,
  },
  colDate: {
    width: 120,
  },
  colChannel: {
    width: 130,
    flexDirection: 'row-reverse',
  },
  colNum: {
    width: 80,
    alignItems: 'flex-end',
  },
  eventTitleText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  dateText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray[700],
    textAlign: 'right',
  },
  channelPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  channelPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  numText: {
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'left',
  },
  numSent: {
    color: '#16A34A',
  },
  numFailed: {
    color: colors.error,
  },
  numMuted: {
    color: colors.gray[400],
  },
  numTotal: {
    color: colors.text,
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 10,
  },
  centerStateTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  centerStateText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'center',
    maxWidth: 420,
  },
  tableFooter: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: '#F8FAFD',
    alignItems: 'flex-end',
  },
  tableFooterText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
  },
});
