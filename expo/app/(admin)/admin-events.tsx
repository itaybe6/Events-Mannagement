import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform, Alert, Image, Modal, Animated, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { eventService } from '@/lib/services/eventService';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { Event } from '@/types';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isFutureEventDate, isPastEventDate, MONTHS, type EventTimeFilter } from '@/features/events/eventsConstants';
import { EventListCard } from '@/features/events/EventListCard';
import { useEventsListModel } from '@/features/events/useEventsListModel';
import { AppKeyboardAwareScrollView } from '@/components/AppKeyboardAware';
import { ALIGN_RIGHT, IS_RTL, ROW_DIR, rtlText } from '@/lib/rtl';

// With I18nManager.forceRTL, `textAlign: 'right'` often pins Hebrew to the physical LEFT (mirroring).
// Same pattern as BrideGroomSeating `guestName` / admin-event-details modals.
const filterSheetTextDir = {
  textAlign: (IS_RTL ? 'left' : 'right') as 'left' | 'right',
  writingDirection: 'rtl' as const,
};
import { useUserStore } from '@/store/userStore';

export default function AdminEventsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const userType = useUserStore((state) => state.userType);
  const isEmployeeAppUser = userType === 'employee' && Platform.OS !== 'web';

  const [approvingEventId, setApprovingEventId] = useState<string | null>(null);
  const [showFilterDialog, setShowFilterDialog] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [eventTimeFilter, setEventTimeFilter] = useState<EventTimeFilter>('future');
  const [isStickyHeaderActive, setIsStickyHeaderActive] = useState(false);
  const [headerContentHeight, setHeaderContentHeight] = useState(52);
  const lastScrollYRef = useRef(0);
  const scrollY = useRef(new Animated.Value(0)).current;
  const loadEventsFn = useMemo(
    () => async (options?: { force?: boolean }) => {
      const data = await eventService.getEvents(options);
      return Array.isArray(data) ? (data as Event[]) : [];
    },
    []
  );

  const initialEvents = useMemo(() => eventService.peekEvents(), []);

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
  } = useEventsListModel(loadEventsFn, {
    errorTitle: 'שגיאה',
    errorMessage: 'לא ניתן לטעון אירועים כרגע',
    initialEvents,
  });

  const handleToggleApproval = async (event: Event, nextValue: boolean) => {
    if (approvingEventId) return;
    setApprovingEventId(event.id);
    try {
      await eventService.setEventApproval(event.id, nextValue);
      await refresh();
    } catch (err) {
      console.error('Toggle event approval error:', err);
      Alert.alert('שגיאה', 'לא ניתן לעדכן את סטטוס האישור כרגע. נסה שוב.');
    } finally {
      setApprovingEventId(null);
    }
  };

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
  const selectedDateLabel = filterDate
    ? new Date(filterDate).toLocaleDateString('he-IL', { day: '2-digit', month: 'long' })
    : null;
  const hasActiveFilter = Boolean(filterDate) || filterMonth !== '';
  const currentFilterLabel = selectedDateLabel
    ? `תאריך ${selectedDateLabel}`
    : selectedMonthLabel
      ? `חודש ${selectedMonthLabel}`
      : 'ללא סינון פעיל';
  const visibleEvents = useMemo(
    () =>
      filteredEvents.filter((event) =>
        eventTimeFilter === 'future'
          ? isFutureEventDate(event.date)
          : isPastEventDate(event.date)
      ),
    [filteredEvents, eventTimeFilter]
  );
  const trimmedQuery = query.trim();
  const emptyMessage = useMemo(() => {
    if (trimmedQuery) {
      return `לא נמצאו תוצאות עבור "${trimmedQuery}"`;
    }
    return eventTimeFilter === 'future' ? 'אין אירועים עתידיים' : 'אין אירועים שהושלמו';
  }, [eventTimeFilter, trimmedQuery]);

  useEffect(() => {
    setSortOrder(eventTimeFilter === 'future' ? 'asc' : 'desc');
  }, [eventTimeFilter, setSortOrder]);

  const headerBackdropColor = scrollY.interpolate({
    inputRange: [0, 14],
    outputRange: ['rgba(255,255,255,0)', 'rgba(255,255,255,0.98)'],
    extrapolate: 'clamp',
  });
  const headerBorderColor = scrollY.interpolate({
    inputRange: [0, 14],
    outputRange: ['rgba(6,23,62,0)', 'rgba(6,23,62,0.05)'],
    extrapolate: 'clamp',
  });
  const headerShadowOpacity = scrollY.interpolate({
    inputRange: [0, 14],
    outputRange: [0, 0.08],
    extrapolate: 'clamp',
  });
  const baseHeaderSpacerHeight = insets.top + 10 + headerContentHeight;

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={['#F7FAFF', '#E8F1FF', '#F2E0BA']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bg}
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.68)', 'rgba(255,255,255,0)']}
        start={{ x: 0.05, y: 0 }}
        end={{ x: 0.75, y: 0.55 }}
        style={styles.bgHighlight}
      />
      <LinearGradient
        colors={['rgba(232,196,122,0.58)', 'rgba(244,224,186,0.22)', 'rgba(244,224,186,0)']}
        start={{ x: 1, y: 0.95 }}
        end={{ x: 0.18, y: 0.22 }}
        style={styles.bgWarmGlow}
      />

      <Animated.View
        style={[
          styles.floatingHeaderWrap,
          styles.stickyControlsWrap,
          {
            backgroundColor: headerBackdropColor,
            borderBottomColor: headerBorderColor,
            shadowOpacity: headerShadowOpacity,
            elevation: isStickyHeaderActive ? 4 : 0,
            paddingTop: insets.top + (isStickyHeaderActive ? 14 : 10),
            paddingBottom: isStickyHeaderActive ? 14 : 0,
          },
        ]}
      >
        <View
          onLayout={(event) => {
            const nextHeight = Math.round(event.nativeEvent.layout.height);
            setHeaderContentHeight((prev) => (prev === nextHeight ? prev : nextHeight));
          }}
        >
          <View style={styles.headerHeroRow}>
            <View style={styles.headerActionSlot}>
              <TouchableOpacity
                style={[styles.heroIconBtn, hasActiveFilter && styles.heroIconBtnActive]}
                onPress={() => setShowFilterDialog(true)}
                activeOpacity={0.88}
              >
                <Ionicons
                  name="options-outline"
                  size={18}
                  color={hasActiveFilter ? colors.white : colors.primary}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.headerTitleWrap}>
              <Image
                source={require('../../assets/images/logoMoon.png')}
                style={styles.headerLogo}
                resizeMode="contain"
              />
            </View>

            <View style={styles.headerActionSlot}>
              <TouchableOpacity
                style={[styles.heroPrimaryBtn, isEmployeeAppUser && styles.heroPrimaryBtnDisabled]}
                onPress={() => {
                  if (isEmployeeAppUser) return;
                  router.push('/(admin)/admin-events-create');
                }}
                disabled={isEmployeeAppUser}
                activeOpacity={0.88}
              >
                <Ionicons
                  name="add"
                  size={22}
                  color={isEmployeeAppUser ? colors.gray[600] : colors.white}
                />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.eventTimeToggleWrap}>
            <View style={styles.eventTimeToggle}>
              <TouchableOpacity
                style={[
                  styles.eventTimeToggleBtn,
                  eventTimeFilter === 'future' && styles.eventTimeToggleBtnActive,
                ]}
                onPress={() => setEventTimeFilter('future')}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityState={{ selected: eventTimeFilter === 'future' }}
              >
                <Ionicons
                  name="calendar-outline"
                  size={16}
                  color={eventTimeFilter === 'future' ? colors.white : colors.primary}
                />
                <Text
                  style={[
                    styles.eventTimeToggleText,
                    eventTimeFilter === 'future' && styles.eventTimeToggleTextActive,
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >
                  עתידיים
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.eventTimeToggleBtn,
                  eventTimeFilter === 'completed' && styles.eventTimeToggleBtnActive,
                ]}
                onPress={() => setEventTimeFilter('completed')}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityState={{ selected: eventTimeFilter === 'completed' }}
              >
                <Ionicons
                  name="checkmark-done-outline"
                  size={16}
                  color={eventTimeFilter === 'completed' ? colors.white : colors.primary}
                />
                <Text
                  style={[
                    styles.eventTimeToggleText,
                    eventTimeFilter === 'completed' && styles.eventTimeToggleTextActive,
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >
                  הושלמו
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.searchRowWrap}>
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={18} color={colors.gray[500]} style={styles.searchIcon} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="חיפוש לפי שם, לקוח, אולם, עיר או תאריך..."
                placeholderTextColor={colors.gray[500]}
                style={styles.searchInput}
                textAlign={IS_RTL ? 'right' : 'left'}
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
              />
              {trimmedQuery ? (
                <TouchableOpacity
                  style={styles.searchClearBtn}
                  onPress={() => setQuery('')}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="נקה חיפוש"
                >
                  <Ionicons name="close" size={14} color={colors.gray[600]} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
      </Animated.View>

      <AppKeyboardAwareScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        scrollEventThrottle={16}
        onScroll={(event: any) => {
          const offsetY = Number(event?.nativeEvent?.contentOffset?.y ?? 0);
          const clampedOffsetY = Math.max(offsetY, 0);
          scrollY.setValue(clampedOffsetY);

          if (clampedOffsetY <= 24) {
            lastScrollYRef.current = 0;
            setIsStickyHeaderActive(false);
            return;
          }

          const deltaY = clampedOffsetY - lastScrollYRef.current;
          if (Math.abs(deltaY) < 2) {
            lastScrollYRef.current = clampedOffsetY;
            return;
          }

          if (deltaY > 3 && !isStickyHeaderActive) {
            setIsStickyHeaderActive(true);
          } else if (deltaY < -3 && isStickyHeaderActive) {
            setIsStickyHeaderActive(false);
          }

          lastScrollYRef.current = clampedOffsetY;
        }}
      >
        <View style={{ height: baseHeaderSpacerHeight }} />

        {/* Events */}
        <View style={styles.timelineWrap}>
          {loading ? (
            <View style={{ paddingTop: 30 }}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : visibleEvents.length === 0 ? (
            <View style={styles.emptyStateCard}>
              <Ionicons name="calendar-outline" size={44} color={colors.gray[500]} />
              <Text style={styles.emptyStateText}>{emptyMessage}</Text>
              {trimmedQuery || eventTimeFilter === 'completed' ? (
                <Text style={styles.emptyStateSubtext}>
                  {trimmedQuery
                    ? 'נסה מילות חיפוש אחרות, או נקה את החיפוש כדי לראות את כל האירועים.'
                    : 'נסה לעבור לטאב "עתידיים" כדי לראות אירועים קרובים.'}
                </Text>
              ) : null}
            </View>
          ) : (
            visibleEvents.map((event, index) => (
              <EventListCard
                key={event.id}
                event={event}
                index={index}
                onPress={() =>
                  router.push({ pathname: '/(admin)/admin-event-details', params: { id: event.id } })
                }
                onToggleApproval={handleToggleApproval}
                approvingEventId={approvingEventId}
              />
            ))
          )}
        </View>
      </AppKeyboardAwareScrollView>

      <Modal
        visible={showFilterDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFilterDialog(false)}
      >
        <View style={styles.filterDialogOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowFilterDialog(false)}
          />

          <View style={styles.filterDialogCard}>
            <LinearGradient
              colors={['rgba(255,255,255,0.98)', 'rgba(246, 243, 237, 0.98)']}
              style={styles.filterDialogGradient}
            />

            <View style={styles.filterDialogHeader}>
              <View style={styles.filterDialogTitleWrap}>
                <Text style={[styles.filterDialogTitle, filterSheetTextDir]}>בחר סוג סינון</Text>
                <Text style={[styles.filterDialogSubtitle, filterSheetTextDir]}>
                  {rtlText(currentFilterLabel)}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.filterDialogCloseBtn}
                onPress={() => setShowFilterDialog(false)}
                activeOpacity={0.85}
              >
                <Ionicons name="close" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.filterOptionsList}>
              <TouchableOpacity
                style={styles.filterOptionCard}
                onPress={() => {
                  setShowFilterDialog(false);
                  setShowDatePicker(true);
                }}
                activeOpacity={0.9}
              >
                <View style={styles.filterOptionTextWrap}>
                  <Text style={[styles.filterOptionTitle, filterSheetTextDir]}>בחירת תאריך מדויק</Text>
                  <Text style={[styles.filterOptionText, filterSheetTextDir]}>
                    לבחור יום מסוים להצגת האירועים
                  </Text>
                </View>
                <View style={styles.filterOptionIconWrap}>
                  <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.filterOptionCard}
                onPress={() => {
                  setShowFilterDialog(false);
                  setShowMonthPicker(true);
                }}
                activeOpacity={0.9}
              >
                <View style={styles.filterOptionTextWrap}>
                  <Text style={[styles.filterOptionTitle, filterSheetTextDir]}>בחירת חודש</Text>
                  <Text style={[styles.filterOptionText, filterSheetTextDir]}>
                    לסנן את הרשימה לפי חודש של האירוע
                  </Text>
                </View>
                <View style={styles.filterOptionIconWrap}>
                  <Ionicons name="calendar-number-outline" size={18} color={colors.primary} />
                </View>
              </TouchableOpacity>
            </View>

            {hasActiveFilter ? (
              <TouchableOpacity
                style={styles.clearFilterBtn}
                onPress={() => {
                  setFilterDate(null);
                  setFilterMonth('');
                  setShowFilterDialog(false);
                }}
                activeOpacity={0.88}
              >
                <Text style={[styles.clearFilterBtnText, filterSheetTextDir]}>נקה סינון</Text>
                <Ionicons name="refresh-outline" size={16} color={colors.primary} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </Modal>

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

    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#E8F1FF',
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
  },
  bgHighlight: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.95,
  },
  bgWarmGlow: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.78,
  },

  scrollContent: {
    paddingBottom: 140,
  },
  floatingHeaderWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 40,
  },
  stickyControlsWrap: {
    backgroundColor: 'transparent',
    paddingBottom: 0,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(6,23,62,0)',
    shadowColor: colors.black,
    shadowOpacity: 0,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 0,
  },
  stickyControlsWrapActive: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(6,23,62,0.05)',
    shadowOpacity: 0.08,
    elevation: 4,
  },
  headerHeroRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 18,
  },
  headerActionSlot: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  headerLogo: {
    width: 275,
    height: 66,
  },
  heroIconBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.black,
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  heroIconBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  heroPrimaryBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  heroPrimaryBtnDisabled: {
    backgroundColor: 'rgba(201, 207, 218, 0.95)',
    shadowColor: colors.black,
    shadowOpacity: 0.06,
  },
  eventTimeToggleWrap: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 2,
  },
  eventTimeToggle: {
    flexDirection: ROW_DIR,
    padding: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    gap: 4,
  },
  eventTimeToggleBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 16,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  eventTimeToggleBtnActive: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  eventTimeToggleText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.gray[700],
    textAlign: 'center',
  },
  eventTimeToggleTextActive: {
    color: colors.white,
    fontWeight: '900',
  },
  searchRowWrap: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 12,
  },
  searchWrap: {
    minHeight: 46,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
    justifyContent: 'center',
    shadowColor: colors.black,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  searchIcon: {
    position: 'absolute',
    end: 14,
    top: 14,
    zIndex: 1,
  },
  searchInput: {
    minHeight: 46,
    paddingEnd: 42,
    paddingStart: 42,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    writingDirection: 'rtl',
  },
  searchClearBtn: {
    position: 'absolute',
    start: 10,
    top: 9,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(6,23,62,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterDialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(7, 14, 34, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  filterDialogCard: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    padding: 18,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    shadowColor: colors.black,
    shadowOpacity: 0.15,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
    gap: 14,
  },
  filterDialogGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  filterDialogHeader: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  filterDialogCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.74)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterDialogTitleWrap: {
    flex: 1,
    alignItems: ALIGN_RIGHT,
    gap: 4,
  },
  filterDialogTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
  },
  filterDialogSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
  },
  filterOptionsList: {
    gap: 10,
  },
  filterOptionCard: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
  },
  filterOptionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(6,23,62,0.07)',
  },
  filterOptionTextWrap: {
    flex: 1,
    alignItems: ALIGN_RIGHT,
    gap: 4,
  },
  filterOptionTitle: {
    width: '100%',
    fontSize: 15,
    fontWeight: '900',
    color: colors.text,
  },
  filterOptionText: {
    width: '100%',
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    lineHeight: 18,
  },
  clearFilterBtn: {
    alignSelf: 'stretch',
    height: 48,
    borderRadius: 18,
    backgroundColor: 'rgba(6,23,62,0.06)',
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  clearFilterBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.primary,
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
    paddingTop: 0,
    gap: 18,
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
  emptyStateSubtext: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'center',
  },

}); 