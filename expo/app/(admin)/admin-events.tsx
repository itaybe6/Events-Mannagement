import React, { useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform, Alert, Image, Modal, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { eventService } from '@/lib/services/eventService';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { Event } from '@/types';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EVENT_BLUE, isFutureEventDate, isPastEventDate, MONTHS, type EventTimeFilter } from '@/features/events/eventsConstants';
import { EventListCard } from '@/features/events/EventListCard';
import { useEventsListModel } from '@/features/events/useEventsListModel';
import { AppKeyboardAwareScrollView } from '@/components/AppKeyboardAware';
import { ALIGN_RIGHT, ROW_DIR, TEXT_RIGHT, rtlText } from '@/lib/rtl';
import { getFloatingTabBarContentPadding } from '@/lib/floatingTabBarInset';

const filterSheetTextDir = {
  textAlign: TEXT_RIGHT,
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

  // רענון בכניסה למסך (הפוקוס מכסה גם את הטעינה הראשונית, כך שאין fetch כפול)
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

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={['#F8FAFF', '#EDF3FF', '#DDE8FF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bg}
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.9)', 'rgba(255,255,255,0)']}
        start={{ x: 0.05, y: 0 }}
        end={{ x: 0.75, y: 0.55 }}
        style={styles.bgHighlight}
      />
      <LinearGradient
        colors={['rgba(59,130,246,0.16)', 'rgba(59,130,246,0.04)', 'rgba(59,130,246,0)']}
        start={{ x: 1, y: 0.95 }}
        end={{ x: 0.18, y: 0.22 }}
        style={styles.bgCoolGlow}
      />

      <AppKeyboardAwareScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: getFloatingTabBarContentPadding(insets.bottom) },
        ]}
      >
        <View style={[styles.headerBlock, { paddingTop: insets.top + 10 }]}>
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
                  color={hasActiveFilter ? colors.white : EVENT_BLUE.deep}
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
                accessibilityRole="button"
                accessibilityLabel="אירוע חדש"
              >
                <LinearGradient
                  colors={
                    isEmployeeAppUser
                      ? ['#C9CFDA', '#B4BDCC']
                      : [EVENT_BLUE.bright, EVENT_BLUE.mid, EVENT_BLUE.deep]
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.heroPrimaryBtnFill}
                />
                <Ionicons name="add" size={24} color={colors.white} />
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
                {eventTimeFilter === 'future' ? (
                  <LinearGradient
                    colors={[EVENT_BLUE.bright, EVENT_BLUE.mid, EVENT_BLUE.deep]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.eventTimeToggleFill}
                  />
                ) : null}
                <Ionicons
                  name="calendar-outline"
                  size={16}
                  color={eventTimeFilter === 'future' ? colors.white : EVENT_BLUE.muted}
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
                {eventTimeFilter === 'completed' ? (
                  <LinearGradient
                    colors={[EVENT_BLUE.bright, EVENT_BLUE.mid, EVENT_BLUE.deep]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.eventTimeToggleFill}
                  />
                ) : null}
                <Ionicons
                  name="checkmark-done-outline"
                  size={16}
                  color={eventTimeFilter === 'completed' ? colors.white : EVENT_BLUE.muted}
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
              <Ionicons name="search" size={18} color={EVENT_BLUE.mid} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="חיפוש לפי שם, לקוח, אולם, עיר או תאריך..."
                placeholderTextColor={colors.gray[500]}
                style={styles.searchInput}
                textAlign={TEXT_RIGHT}
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
                  <Ionicons name="close" size={14} color={EVENT_BLUE.deep} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.timelineWrap}>
          {loading ? (
            <View style={{ paddingTop: 30 }}>
              <ActivityIndicator size="large" color={EVENT_BLUE.mid} />
            </View>
          ) : visibleEvents.length === 0 ? (
            <View style={styles.emptyStateCard}>
              <View style={styles.emptyStateIconWrap}>
                <Ionicons name="calendar-outline" size={30} color={EVENT_BLUE.mid} />
              </View>
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
            <>
              <View style={styles.listMetaRow}>
                <Text style={styles.listMetaText}>
                  {visibleEvents.length} {visibleEvents.length === 1 ? 'אירוע' : 'אירועים'}
                </Text>
                <View style={styles.listMetaLine} />
              </View>

              {visibleEvents.map((event, index) => (
                <EventListCard
                  key={event.id}
                  event={event}
                  index={index}
                  isLast={index === visibleEvents.length - 1}
                  onPress={() =>
                    router.push({
                      pathname: '/(admin)/admin-event-details',
                      params: { id: event.id },
                    })
                  }
                  onToggleApproval={handleToggleApproval}
                  approvingEventId={approvingEventId}
                />
              ))}
            </>
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
  bgCoolGlow: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.9,
  },

  scrollContent: {
    paddingBottom: 0,
  },
  headerBlock: {
    paddingBottom: 4,
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
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: EVENT_BLUE.line,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: EVENT_BLUE.deep,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  heroIconBtnActive: {
    backgroundColor: EVENT_BLUE.mid,
    borderColor: EVENT_BLUE.mid,
  },
  heroPrimaryBtn: {
    width: 48,
    height: 48,
    borderRadius: 18,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: EVENT_BLUE.mid,
    shadowOpacity: 0.34,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  heroPrimaryBtnFill: {
    ...StyleSheet.absoluteFillObject,
  },
  heroPrimaryBtnDisabled: {
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    elevation: 1,
  },
  eventTimeToggleWrap: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 2,
  },
  eventTimeToggle: {
    flexDirection: ROW_DIR,
    padding: 4,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: EVENT_BLUE.line,
    shadowColor: EVENT_BLUE.deep,
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
    gap: 4,
  },
  eventTimeToggleBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 14,
    overflow: 'hidden',
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  eventTimeToggleFill: {
    ...StyleSheet.absoluteFillObject,
  },
  eventTimeToggleBtnActive: {
    shadowColor: EVENT_BLUE.mid,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  eventTimeToggleText: {
    fontSize: 13,
    fontWeight: '800',
    color: EVENT_BLUE.muted,
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
  // Laid out as a flex row (rather than absolutely positioned side icons) so the
  // magnifier stays on the visual right in both LTR dev and forced-RTL builds.
  searchWrap: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: EVENT_BLUE.line,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    shadowColor: EVENT_BLUE.deep,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 0,
    fontSize: 14,
    fontWeight: '700',
    color: EVENT_BLUE.ink,
    writingDirection: 'rtl',
  },
  searchClearBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: EVENT_BLUE.tint,
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
    backgroundColor: EVENT_BLUE.tint,
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
    borderRadius: 16,
    backgroundColor: EVENT_BLUE.tint,
    borderWidth: 1,
    borderColor: EVENT_BLUE.tintStrong,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  clearFilterBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: EVENT_BLUE.mid,
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
    backgroundColor: EVENT_BLUE.mid,
    borderColor: EVENT_BLUE.mid,
    shadowColor: EVENT_BLUE.mid,
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
    paddingHorizontal: 16,
    paddingTop: 0,
    gap: 0,
  },
  listMetaRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
    paddingBottom: 2,
    marginBottom: 12,
  },
  listMetaText: {
    fontSize: 12,
    fontWeight: '900',
    color: EVENT_BLUE.muted,
    letterSpacing: 0.2,
  },
  listMetaLine: {
    flex: 1,
    height: 1,
    borderRadius: 999,
    backgroundColor: EVENT_BLUE.line,
  },

  emptyStateCard: {
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: EVENT_BLUE.line,
    padding: 28,
    alignItems: 'center',
    marginTop: 32,
    shadowColor: EVENT_BLUE.deep,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  emptyStateIconWrap: {
    width: 62,
    height: 62,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: EVENT_BLUE.tint,
  },
  emptyStateText: {
    fontSize: 17,
    fontWeight: '900',
    color: EVENT_BLUE.ink,
    marginTop: 14,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '700',
    color: EVENT_BLUE.muted,
    textAlign: 'center',
    lineHeight: 19,
  },

});
