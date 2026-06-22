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

const WEB_RTL = Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null;

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
  return { label: 'SMS', icon: 'chatbubble-ellipses-outline', color: '#195DE6', bg: 'rgba(25,93,230,0.10)' };
}

function successRate(sent: number, total: number) {
  if (!total) return 0;
  return Math.round((sent / total) * 100);
}

function SummaryCard({
  title,
  value,
  subtitle,
  icon,
  iconColor,
  iconBg,
  tone = 'default',
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  tone?: 'default' | 'dark';
}) {
  const isDark = tone === 'dark';
  return (
    <View style={[styles.summaryCard, isDark ? styles.summaryCardDark : null]}>
      <View style={styles.summaryHeader}>
        <View style={[styles.summaryIconBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : iconBg }]}>
          <Ionicons name={icon} size={18} color={isDark ? '#FFFFFF' : iconColor} />
        </View>
        <Text style={[styles.summaryTitle, isDark ? styles.summaryTitleDark : null]}>{title}</Text>
      </View>
      <Text style={[styles.summaryValue, isDark ? styles.summaryValueDark : null]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.summarySubtitle, isDark ? styles.summarySubtitleDark : null]}>{subtitle}</Text>
    </View>
  );
}

function MetricCell({ value, tone }: { value: string; tone: 'sent' | 'failed' | 'total' | 'muted' }) {
  const toneStyles = {
    sent: { color: '#16A34A', bg: 'rgba(22,163,74,0.08)' },
    failed: { color: colors.error, bg: 'rgba(220,38,38,0.08)' },
    total: { color: colors.text, bg: 'rgba(6,23,62,0.05)' },
    muted: { color: colors.gray[400], bg: 'rgba(6,23,62,0.03)' },
  }[tone];

  return (
    <View style={[styles.metricCell, { backgroundColor: toneStyles.bg }]}>
      <Text style={[styles.metricValue, { color: toneStyles.color }]}>{value}</Text>
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

  const activeRangeLabel = RANGE_OPTIONS.find((o) => o.key === rangeKey)?.label ?? '';

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
          tone="dark"
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

      <View style={styles.tableCard}>
        <View style={styles.tableTopBar}>
          <View style={styles.tableTopTextWrap}>
            <Text style={styles.tableTopTitle}>פירוט משלוחים</Text>
            <Text style={styles.tableTopSubtitle}>
              {loading
                ? 'טוען נתונים...'
                : `${formatCount(filteredRows.length)} משלוחים · טווח: ${activeRangeLabel}`}
            </Text>
          </View>

          <View style={styles.tableTopActions}>
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={17} color={colors.gray[500]} style={styles.searchIcon} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="חיפוש לפי שם אירוע..."
                placeholderTextColor={colors.gray[500]}
                style={styles.searchInput}
                textAlign="right"
              />
              {query.trim() ? (
                <Pressable
                  onPress={() => setQuery('')}
                  style={({ pressed }: any) => [styles.clearBtn, pressed ? { opacity: 0.7 } : null]}
                >
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
        </View>

        <View style={[styles.tableHeaderRow, WEB_RTL]}>
          <View style={styles.colEvent}>
            <Text style={styles.headerCellText}>אירוע</Text>
          </View>
          <View style={styles.colDate}>
            <Text style={styles.headerCellText}>תאריך</Text>
          </View>
          <View style={styles.colChannel}>
            <Text style={styles.headerCellText}>ערוץ</Text>
          </View>
          <View style={styles.colMetrics}>
            <Text style={styles.headerCellText}>נשלחו</Text>
          </View>
          <View style={styles.colMetrics}>
            <Text style={styles.headerCellText}>נכשלו</Text>
          </View>
          <View style={styles.colMetrics}>
            <Text style={styles.headerCellText}>סה״כ</Text>
          </View>
          <View style={styles.colRate}>
            <Text style={styles.headerCellText}>הצלחה</Text>
          </View>
          <View style={styles.colChevron} />
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
          <View style={styles.rowsWrap}>
            {filteredRows.map((r) => {
              const ch = channelMeta(r.messageType);
              const rate = successRate(r.sentCount, r.totalCount);
              const rateColor = rate >= 90 ? '#16A34A' : rate >= 70 ? '#D97706' : colors.error;

              return (
                <Pressable
                  key={`${r.eventId}|${r.sendDate}|${r.messageType}`}
                  onPress={() => router.push({ pathname: '/(admin)/admin-event-details', params: { id: r.eventId } })}
                  style={({ hovered, pressed }: any) => [
                    styles.tableRow,
                    WEB_RTL,
                    Platform.OS === 'web' && hovered ? styles.tableRowHover : null,
                    pressed ? { opacity: 0.95 } : null,
                  ]}
                >
                  <View style={styles.colEvent}>
                    <View style={styles.eventCell}>
                      <View style={styles.eventIconBox}>
                        <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                      </View>
                      <Text style={styles.eventTitleText} numberOfLines={1}>
                        {r.eventTitle}
                      </Text>
                    </View>
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

                  <View style={styles.colMetrics}>
                    <MetricCell value={formatCount(r.sentCount)} tone="sent" />
                  </View>
                  <View style={styles.colMetrics}>
                    <MetricCell value={formatCount(r.failedCount)} tone={r.failedCount > 0 ? 'failed' : 'muted'} />
                  </View>
                  <View style={styles.colMetrics}>
                    <MetricCell value={formatCount(r.totalCount)} tone="total" />
                  </View>

                  <View style={styles.colRate}>
                    <View style={styles.rateWrap}>
                      <View style={styles.rateBarTrack}>
                        <View
                          style={[
                            styles.rateBarFill,
                            { width: `${Math.max(rate, 4)}%` as any, backgroundColor: rateColor },
                          ]}
                        />
                      </View>
                      <Text style={[styles.rateText, { color: rateColor }]}>{rate}%</Text>
                    </View>
                  </View>

                  <View style={styles.colChevron}>
                    <Ionicons name="chevron-back" size={16} color={colors.gray[400]} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {!loading && !errorMsg && filteredRows.length > 0 ? (
          <View style={styles.tableFooter}>
            <View style={styles.footerStats}>
              <View style={styles.footerStat}>
                <View style={[styles.footerDot, { backgroundColor: '#16A34A' }]} />
                <Text style={styles.footerStatText}>{formatCount(totals.sent)} נשלחו</Text>
              </View>
              <View style={styles.footerStat}>
                <View style={[styles.footerDot, { backgroundColor: colors.error }]} />
                <Text style={styles.footerStatText}>{formatCount(totals.failed)} נכשלו</Text>
              </View>
              <View style={styles.footerStat}>
                <View style={[styles.footerDot, { backgroundColor: colors.primary }]} />
                <Text style={styles.footerStatText}>{formatCount(totals.total)} סה״כ</Text>
              </View>
            </View>
            <Text style={styles.tableFooterText}>לחץ על שורה לצפייה באירוע</Text>
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
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
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
  summaryCardDark: {
    backgroundColor: colors.primary,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
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
    writingDirection: 'rtl',
  },
  summaryTitleDark: {
    color: 'rgba(255,255,255,0.78)',
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  summaryValueDark: {
    color: '#FFFFFF',
  },
  summarySubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.gray[500],
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  summarySubtitleDark: {
    color: 'rgba(255,255,255,0.65)',
  },
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.05)',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 8px 24px rgba(11,28,65,0.05)' } as any) : null),
  },
  tableTopBar: {
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 16,
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(6,23,62,0.06)',
    backgroundColor: '#FCFDFF',
  },
  tableTopTextWrap: {
    gap: 4,
    alignItems: 'flex-end',
  },
  tableTopTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    width: '100%',
  },
  tableTopSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
    width: '100%',
  },
  tableTopActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F6FB',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 44,
    flexGrow: 1,
    flexBasis: 260,
    maxWidth: 360,
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
    writingDirection: 'rtl',
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
    flexDirection: 'row',
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
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#FAFBFE',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(6,23,62,0.05)',
  },
  headerCellText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.gray[500],
    textAlign: 'right',
    writingDirection: 'rtl',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  rowsWrap: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.05)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', transition: 'background-color 0.15s ease, border-color 0.15s ease' } as any) : null),
  },
  tableRowHover: {
    backgroundColor: '#FBFDFF',
    borderColor: 'rgba(25,93,230,0.14)',
  },
  colEvent: {
    flex: 1.6,
    minWidth: 0,
  },
  colDate: {
    width: 110,
  },
  colChannel: {
    width: 120,
  },
  colMetrics: {
    width: 88,
  },
  colRate: {
    width: 100,
  },
  colChevron: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  eventIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(25,93,230,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  eventTitleText: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  dateText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray[700],
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  channelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  channelPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  metricCell: {
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  rateWrap: {
    gap: 5,
    alignItems: 'stretch',
  },
  rateBarTrack: {
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(6,23,62,0.07)',
    overflow: 'hidden',
  },
  rateBarFill: {
    height: '100%',
    borderRadius: 999,
    ...(Platform.OS === 'web' ? ({ transition: 'width 0.3s ease' } as any) : null),
  },
  rateText: {
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
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
    paddingHorizontal: 22,
    paddingVertical: 16,
    backgroundColor: '#FAFBFE',
    borderTopWidth: 1,
    borderTopColor: 'rgba(6,23,62,0.05)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  footerStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
  },
  footerStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  footerStatText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[700],
  },
  tableFooterText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.gray[500],
  },
});
