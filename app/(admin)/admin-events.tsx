import React, { useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, SafeAreaView, Platform, Alert, Image, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { eventService } from '@/lib/services/eventService';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { Event } from '@/types';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAppHeaderTotalHeight } from '@/components/AppHeader';

const MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
];

const EVENT_TYPES = ['חתונה', 'בר מצווה', 'בת מצווה', 'ברית', 'אירוע חברה'] as const;
type EventType = (typeof EVENT_TYPES)[number];

const EVENT_IMAGE_BY_TYPE: Record<EventType, number> = {
  חתונה: require('../../assets/images/wedding.jpg'),
  'בר מצווה': require('../../assets/images/Bar Mitzvah.jpg'),
  'בת מצווה': require('../../assets/images/Bar Mitzvah.jpg'),
  ברית: require('../../assets/images/baby.jpg'),
  'אירוע חברה': require('../../assets/images/wedding.jpg'),
};

const EVENT_BADGE_META: Record<EventType, { icon: keyof typeof Ionicons.glyphMap; tint: string }> = {
  חתונה: { icon: 'heart', tint: 'rgba(204, 160, 0, 0.85)' },
  'בר מצווה': { icon: 'sparkles', tint: 'rgba(6, 23, 62, 0.85)' },
  'בת מצווה': { icon: 'sparkles', tint: 'rgba(6, 23, 62, 0.85)' },
  ברית: { icon: 'star', tint: 'rgba(240, 203, 70, 0.9)' },
  'אירוע חברה': { icon: 'briefcase', tint: 'rgba(0, 53, 102, 0.85)' },
};

function inferEventType(title: string): EventType | null {
  const t = (title || '').trim();
  const match = EVENT_TYPES.find(et => t.startsWith(et) || t.includes(et));
  return match || null;
}

export default function AdminEventsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const headerTotalHeight = getAppHeaderTotalHeight(insets.top);
  const monthsBarHeight = Platform.OS === 'ios' ? 68 : 64;

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [filterDate, setFilterDate] = useState<Date | null>(null);
  const [filterMonth, setFilterMonth] = useState('');
  const [sortOrder, setSortOrder] = useState('asc');
  const [query, setQuery] = useState('');

  // רענון ראשוני
  useEffect(() => {
    loadEvents();
  }, []);

  // רענון בכל חזרה לפוקוס
  useFocusEffect(
    React.useCallback(() => {
      loadEvents();
    }, [])
  );

  const loadEvents = async () => {
    setLoading(true);
    try {
      const data = await eventService.getEvents();
      setEvents(data);
    } catch (e) {
      console.error('Admin events load error:', e);
      Alert.alert('שגיאה', 'לא ניתן לטעון אירועים כרגע');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  // Filtering
  let filteredEvents: Event[] = [...events];
  if (filterDate) {
    filteredEvents = filteredEvents.filter(e => {
      const d = new Date(e.date);
      return d.toDateString() === filterDate.toDateString();
    });
  } else if (filterMonth) {
    filteredEvents = filteredEvents.filter(e => {
      const d = new Date(e.date);
      return d.getMonth() === parseInt(filterMonth);
    });
  }
  if (query.trim()) {
    const q = query.trim().toLowerCase();
    filteredEvents = filteredEvents.filter(e => {
      const hay = [
        e.title,
        e.location,
        e.city,
        e.userName || '',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }
  // Sorting
  filteredEvents.sort((a, b) => {
    const da = new Date(a.date);
    const db = new Date(b.date);
    return sortOrder === 'asc' ? da.getTime() - db.getTime() : db.getTime() - da.getTime();
  });

  // UI
  const today = new Date();
  const getDaysLeft = (date: Date | string) => {
    const d = new Date(date);
    const diff = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff >= 0 ? `עוד ${diff} ימים` : 'עבר';
  };

  const monthsBarContent = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.monthsRow}
    >
      {filterDate ? (
        <TouchableOpacity
          style={[styles.monthChip, styles.monthChipDate]}
          onPress={() => setFilterDate(null)}
          activeOpacity={0.85}
        >
          <Ionicons name="close" size={14} color={colors.text} />
          <Text style={styles.monthChipDateText}>
            {filterDate.toLocaleDateString('he-IL')}
          </Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity
        style={[styles.monthChip, !filterMonth && !filterDate && styles.monthChipActive]}
        onPress={() => {
          setFilterMonth('');
          setFilterDate(null);
        }}
        activeOpacity={0.85}
      >
        <Text style={[styles.monthChipText, !filterMonth && !filterDate && styles.monthChipTextActive]}>הכל</Text>
      </TouchableOpacity>

      {MONTHS.map((m, i) => (
        <TouchableOpacity
          key={i}
          style={[styles.monthChip, filterMonth === String(i) && styles.monthChipActive]}
          onPress={() => {
            setFilterMonth(String(i));
            setFilterDate(null);
          }}
          activeOpacity={0.85}
        >
          <Text style={[styles.monthChipText, filterMonth === String(i) && styles.monthChipTextActive]}>
            {m}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.bg}>
        <View style={styles.bgBlobPrimary} />
        <View style={styles.bgBlobSecondary} />
      </View>

      {/* Months chips (always fixed to top of this screen) */}
      <View
        style={[
          styles.monthsWrap,
          styles.monthsOverlay,
          Platform.OS === 'web' ? { top: headerTotalHeight } : null,
        ]}
      >
        {monthsBarContent}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: monthsBarHeight },
        ]}
      >
        {/* Search / controls */}
        <View style={styles.controlsRow}>
          <View style={styles.searchCard}>
            <Ionicons name="search" size={18} color={colors.gray[500]} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="חפש אירוע..."
              placeholderTextColor={colors.gray[500]}
              style={styles.searchInput}
              textAlign="right"
              returnKeyType="search"
            />
          </View>

          <TouchableOpacity
            style={styles.roundControlBtn}
            onPress={() => setShowDatePicker(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="calendar-outline" size={18} color={colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.roundControlBtn}
            onPress={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            activeOpacity={0.85}
          >
            <Ionicons name={sortOrder === 'asc' ? 'swap-vertical' : 'swap-vertical'} size={18} color={colors.text} />
          </TouchableOpacity>
        </View>

        <DateTimePickerModal
          isVisible={showDatePicker}
          mode="date"
          onConfirm={date => {
            setShowDatePicker(false);
            setFilterDate(date as Date);
            setFilterMonth('');
          }}
          onCancel={() => setShowDatePicker(false)}
          minimumDate={new Date()}
          locale="he-IL"
        />

        {/* Events */}
        <View style={styles.timelineWrap}>
          {loading ? (
            <View style={{ paddingTop: 30 }}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : filteredEvents.length === 0 ? (
            <View style={styles.emptyStateCard}>
              <Ionicons name="calendar-outline" size={44} color={colors.gray[500]} />
              <Text style={styles.emptyStateText}>לא נמצאו אירועים</Text>
            </View>
          ) : (
            filteredEvents.map(event => {
              const dateObj = new Date(event.date);
              const dayNum = dateObj.toLocaleDateString('he-IL', { day: '2-digit' });
              const monthName = MONTHS[dateObj.getMonth()];
              const eventType = inferEventType(event.title) || 'חתונה';
              const badge = EVENT_BADGE_META[eventType];
              const cover = EVENT_IMAGE_BY_TYPE[eventType];
              const coverSource: any = cover;

              return (
                <View key={event.id} style={styles.eventBlock}>
                  <View style={styles.eventTopRow}>
                    <View style={styles.dateCol}>
                      <Text style={[styles.dayBig, eventType === 'חתונה' && { color: colors.secondary }]}>
                        {dayNum}
                      </Text>
                      <Text style={styles.monthSmall}>{monthName}</Text>
                    </View>

                    <View style={styles.metaCol}>
                      <Text style={styles.eventTitleNew} numberOfLines={2}>
                        {event.title}
                      </Text>
                      <View style={styles.metaLine}>
                        {typeof event.guests === 'number' && event.guests > 0 ? (
                          <>
                            <View style={styles.metaItem}>
                              <Ionicons name="people" size={14} color={colors.gray[600]} />
                              <Text style={styles.metaText}>{event.guests}</Text>
                            </View>
                            <Text style={styles.metaDot}>•</Text>
                          </>
                        ) : null}
                        <Text style={styles.metaText} numberOfLines={1}>
                          {event.location}
                          {event.city ? `, ${event.city}` : ''}
                        </Text>
                      </View>
                      {event.userName ? (
                        <Text style={styles.ownerLine} numberOfLines={1}>
                          {event.userName}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  <TouchableOpacity
                    onPress={() => router.push({ pathname: '/(admin)/admin-event-details', params: { id: event.id } })}
                    style={styles.coverCard}
                    activeOpacity={0.92}
                  >
                    <Image source={coverSource} style={styles.coverImg} resizeMode="cover" />
                    <LinearGradient
                      colors={['rgba(0,0,0,0.0)', 'rgba(0,0,0,0.38)']}
                      style={styles.coverGradient}
                    />

                    <View style={styles.badgePill}>
                      <View style={[styles.badgeIconWrap, { backgroundColor: badge.tint }]} />
                      <Ionicons
                        name={badge.icon}
                        size={14}
                        color={colors.white}
                        style={styles.badgeIcon}
                      />
                      <Text style={styles.badgeText}>{eventType}</Text>
                    </View>

                    <View style={styles.coverBottomRow}>
                      <Text style={styles.daysLeft}>{getDaysLeft(event.date)}</Text>
                    </View>
                  </TouchableOpacity>

                  <View style={styles.divider} />
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Floating Action Button */}
      <View style={styles.fabWrap}>
        <TouchableOpacity
          style={styles.fab}
          onPress={() => router.push('/(admin)/admin-events-create')}
          activeOpacity={0.92}
        >
          <Ionicons name="add" size={32} color={colors.white} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.gray[100],
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.gray[100],
  },
  bgBlobPrimary: {
    position: 'absolute',
    width: 520,
    height: 520,
    borderRadius: 260,
    backgroundColor: colors.primary,
    opacity: 0.06,
    top: -180,
    right: -140,
  },
  bgBlobSecondary: {
    position: 'absolute',
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: colors.accent,
    opacity: 0.08,
    top: 90,
    left: -160,
  },

  scrollContent: {
    paddingBottom: 140,
  },

  monthsWrap: {
    backgroundColor: 'rgba(248, 249, 250, 0.85)',
    paddingTop: Platform.OS === 'ios' ? 18 : 14,
    paddingBottom: 10,
  },
  monthsOverlay: {
    ...(Platform.OS === 'web'
      ? ({ position: 'fixed' as any } as any)
      : { position: 'absolute' as const }),
    top: 0,
    left: 0,
    right: 0,
    zIndex: 200,
    elevation: 10,
  },
  monthsRow: {
    paddingHorizontal: 18,
    flexDirection: 'row-reverse',
    gap: 10,
    alignItems: 'center',
  },
  monthChip: {
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  monthChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.gray[700],
  },
  monthChipTextActive: {
    color: colors.white,
  },
  monthChipDate: {
    flexDirection: 'row-reverse',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  monthChipDateText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },

  controlsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 10,
  },
  searchCard: {
    flex: 1,
    height: 54,
    borderRadius: 24,
    paddingHorizontal: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: colors.black,
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  roundControlBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.black,
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },

  timelineWrap: {
    paddingHorizontal: 14,
    paddingTop: 4,
  },
  eventBlock: {
    paddingHorizontal: 6,
    paddingTop: 12,
  },
  eventTopRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  dateCol: {
    width: 86,
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
  },
  dayBig: {
    fontSize: 78,
    lineHeight: 78,
    fontWeight: '200',
    color: 'rgba(6, 23, 62, 0.85)',
    letterSpacing: -2,
  },
  monthSmall: {
    marginTop: -6,
    fontSize: 16,
    fontWeight: '700',
    color: colors.gray[500],
    textAlign: 'right',
  },
  metaCol: {
    flex: 1,
    alignItems: 'flex-end',
    paddingLeft: 10,
  },
  eventTitleNew: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    lineHeight: 22,
    marginBottom: 4,
  },
  metaLine: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  metaItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
  },
  metaDot: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.gray[500],
  },
  ownerLine: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
  },

  coverCard: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: colors.white,
    shadowColor: colors.black,
    shadowOpacity: 0.10,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  coverImg: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  coverGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  badgePill: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  badgeIconWrap: {
    position: 'absolute',
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    opacity: 0.95,
  },
  badgeIcon: {
    marginRight: 2,
  },
  badgeText: {
    paddingRight: 22,
    fontSize: 12,
    fontWeight: '900',
    color: colors.text,
  },
  coverBottomRow: {
    position: 'absolute',
    left: 14,
    bottom: 14,
  },
  daysLeft: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.white,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 2 },
  },
  divider: {
    width: '58%',
    alignSelf: 'center',
    height: 1,
    marginTop: 22,
    marginBottom: 10,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },

  emptyStateCard: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 26,
    padding: 28,
    alignItems: 'center',
    marginTop: 40,
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.gray[600],
    marginTop: 12,
    textAlign: 'center',
  },

  fabWrap: {
    position: 'absolute',
    left: 18,
    bottom: 108,
  },
  fab: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
}); 