import React, { useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, SafeAreaView, Platform, Alert, Image, TextInput, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { eventService } from '@/lib/services/eventService';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { Event } from '@/types';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_HEADER_HEIGHT_COMPACT, getAppHeaderTotalHeight } from '@/components/AppHeader';
import { EVENT_BADGE_META, inferEventType, MONTHS, type EventType } from '@/features/events/eventsConstants';
import { useEventsListModel } from '@/features/events/useEventsListModel';
import { ALIGN_RIGHT, ROW_DIR } from '@/lib/rtl';

const EVENT_IMAGE_BY_TYPE: Record<EventType, number> = {
  חתונה: require('../../assets/images/wedding.jpg'),
  'בר מצווה': require('../../assets/images/Bar Mitzvah.jpg'),
  'בת מצווה': require('../../assets/images/Bar Mitzvah.jpg'),
  ברית: require('../../assets/images/baby.jpg'),
  'אירוע חברה': require('../../assets/images/wedding.jpg'),
};

export default function AdminEventsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const headerTotalHeight = getAppHeaderTotalHeight(insets.top, APP_HEADER_HEIGHT_COMPACT);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const loadEventsFn = useMemo(() => async () => {
    const data = await eventService.getEvents();
    return Array.isArray(data) ? (data as Event[]) : [];
  }, []);

  const {
    loading,
    query,
    setQuery,
    filterDate,
    setFilterDate,
    filterMonth,
    setFilterMonth,
    sortOrder,
    setSortOrder,
    refresh,
    filteredEvents,
  } = useEventsListModel(loadEventsFn, { errorTitle: 'שגיאה', errorMessage: 'לא ניתן לטעון אירועים כרגע' });

  // רענון ראשוני
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // רענון בכל חזרה לפוקוס
  useFocusEffect(
    React.useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const selectedMonthLabel = filterMonth !== '' ? MONTHS[Number(filterMonth)] : null;

  // UI
  const today = new Date();
  const getDaysLeft = (date: Date | string) => {
    const d = new Date(date);
    const diff = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff >= 0 ? `עוד ${diff} ימים` : 'עבר';
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.bg}>
        <View style={styles.bgBlobPrimary} />
        <View style={styles.bgBlobSecondary} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
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
            style={[styles.roundControlBtn, filterMonth !== '' && styles.roundControlBtnActive]}
            onPress={() => setShowMonthPicker(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="calendar-number-outline" size={18} color={filterMonth !== '' ? colors.white : colors.text} />
          </TouchableOpacity>
        </View>

        {/* Month Picker Modal */}
        <Modal
          visible={showMonthPicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowMonthPicker(false)}
        >
          <View style={styles.modalOverlay}>
            <TouchableOpacity
              style={styles.modalBackdrop}
              activeOpacity={1}
              onPress={() => setShowMonthPicker(false)}
            />

            <View style={styles.monthPickerSheet}>
              <LinearGradient
                colors={['rgba(255,255,255,0.98)', 'rgba(244, 247, 255, 0.94)']}
                style={styles.monthPickerSheetGradient}
              />

              <View style={styles.sheetHandle} />

              <View style={styles.monthPickerHeaderRow}>
                <View style={styles.monthPickerHeaderSide} />

                <View style={styles.monthPickerHeaderCenter}>
                  <Text style={styles.monthPickerTitle}>בחר חודש</Text>
                  <Text style={styles.monthPickerSubtitle}>
                    {selectedMonthLabel ? `מסנן: ${selectedMonthLabel}` : 'מציג: הכל'}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.monthPickerCloseBtn}
                  onPress={() => setShowMonthPicker(false)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="close" size={18} color={colors.text} />
                </TouchableOpacity>
              </View>

              <View style={styles.monthGrid}>
                <TouchableOpacity
                  style={[styles.monthChipV2, filterMonth === '' && !filterDate && styles.monthChipV2Active]}
                  onPress={() => {
                    setFilterMonth('');
                    setFilterDate(null);
                    setShowMonthPicker(false);
                  }}
                  activeOpacity={0.9}
                >
                  {filterMonth === '' && !filterDate ? (
                    <Ionicons name="checkmark" size={16} color={colors.white} />
                  ) : null}
                  <Text
                    style={[
                      styles.monthChipV2Text,
                      filterMonth === '' && !filterDate && styles.monthChipV2TextActive,
                    ]}
                  >
                    הכל
                  </Text>
                </TouchableOpacity>

                {MONTHS.map((m, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.monthChipV2, filterMonth === String(i) && styles.monthChipV2Active]}
                    onPress={() => {
                      setFilterMonth(String(i));
                      setFilterDate(null);
                      setShowMonthPicker(false);
                    }}
                    activeOpacity={0.9}
                  >
                    {filterMonth === String(i) ? (
                      <Ionicons name="checkmark" size={16} color={colors.white} />
                    ) : null}
                    <Text
                      style={[
                        styles.monthChipV2Text,
                        filterMonth === String(i) && styles.monthChipV2TextActive,
                      ]}
                    >
                      {m}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </Modal>

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
              const invitationImageUrl = String(event.invitationImageUrl ?? '').trim();
              const coverSource: any = invitationImageUrl ? { uri: invitationImageUrl } : EVENT_IMAGE_BY_TYPE[eventType];

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
                      {event.userName ? (
                        <>
                          <View style={styles.ownerAvatarWrap}>
                            {event.userAvatarUrl ? (
                              <Image source={{ uri: event.userAvatarUrl }} style={styles.ownerAvatarImg} />
                            ) : (
                              <Ionicons name="person" size={14} color={colors.white} />
                            )}
                          </View>
                          <Text style={styles.ownerBadgeText} numberOfLines={1}>
                            {event.userName}
                          </Text>
                        </>
                      ) : (
                        <>
                          <View style={[styles.badgeIconWrap, { backgroundColor: badge.tint }]} />
                          <Ionicons
                            name={badge.icon}
                            size={14}
                            color={colors.white}
                            style={styles.badgeIcon}
                          />
                          <Text style={styles.badgeText}>{eventType}</Text>
                        </>
                      )}
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

  controlsRow: {
    flexDirection: ROW_DIR,
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
    flexDirection: ROW_DIR,
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
  roundControlBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.22,
    elevation: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(7, 14, 34, 0.58)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  monthPickerSheet: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 28,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    shadowColor: colors.black,
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 16,
  },
  monthPickerSheetGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 54,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.16)',
    marginTop: 10,
    marginBottom: 8,
  },
  monthPickerHeaderRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    marginBottom: 10,
  },
  monthPickerHeaderSide: {
    width: 36,
  },
  monthPickerHeaderCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  monthPickerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  monthPickerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'center',
  },
  monthPickerCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthGrid: {
    flexDirection: ROW_DIR,
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  monthChipV2: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    minHeight: 44,
    flexBasis: '31%',
  },
  monthChipV2Active: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  monthChipV2Text: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.gray[800],
    textAlign: 'center',
  },
  monthChipV2TextActive: {
    color: colors.white,
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
    flexDirection: ROW_DIR,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    paddingHorizontal: 8,
    marginBottom: 12,
    gap: -80,
  },
  dateCol: {
    width: 86,
    alignItems: ALIGN_RIGHT,
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
    alignItems: ALIGN_RIGHT,
    // In RTL, we want the content closer to the right edge
    paddingStart: 0,
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
    flexDirection: ROW_DIR,
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: ALIGN_RIGHT,
    alignSelf: ALIGN_RIGHT,
  },
  metaItem: {
    flexDirection: ROW_DIR,
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
    start: 14,
    bottom: 14,
    flexDirection: ROW_DIR,
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
    start: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    opacity: 0.95,
  },
  badgeIcon: {
    marginStart: 2,
  },
  badgeText: {
    paddingStart: 22,
    fontSize: 12,
    fontWeight: '900',
    color: colors.text,
  },
  ownerAvatarWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    overflow: 'hidden',
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ownerAvatarImg: {
    width: '100%',
    height: '100%',
  },
  ownerBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.text,
    maxWidth: 160,
  },
  coverBottomRow: {
    position: 'absolute',
    end: 14,
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