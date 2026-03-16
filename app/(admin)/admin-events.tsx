import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform, Alert, Image, Modal, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { eventService } from '@/lib/services/eventService';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { Event } from '@/types';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { inferEventType, MONTHS, type EventType } from '@/features/events/eventsConstants';
import { useEventsListModel } from '@/features/events/useEventsListModel';
import { AppKeyboardAwareScrollView } from '@/components/AppKeyboardAware';
import { ALIGN_RIGHT, ROW_DIR, rtlText } from '@/lib/rtl';
import { useUserStore } from '@/store/userStore';

const EVENT_IMAGE_BY_TYPE: Record<EventType, number> = {
  חתונה: require('../../assets/images/wedding.jpg'),
  'בר מצווה': require('../../assets/images/Bar Mitzvah.jpg'),
  'בת מצווה': require('../../assets/images/Bar Mitzvah.jpg'),
  ברית: require('../../assets/images/baby.jpg'),
  'אירוע חברה': require('../../assets/images/wedding.jpg'),
};
const EVENT_TYPE_PILL_META: Record<EventType, { background: string; border: string; text: string }> = {
  חתונה: {
    background: 'rgba(239, 221, 184, 0.96)',
    border: 'rgba(204, 160, 0, 0.30)',
    text: '#5E4600',
  },
  'בר מצווה': {
    background: 'rgba(229, 238, 255, 0.96)',
    border: 'rgba(0, 53, 102, 0.16)',
    text: colors.primary,
  },
  'בת מצווה': {
    background: 'rgba(239, 233, 255, 0.96)',
    border: 'rgba(98, 90, 150, 0.18)',
    text: '#53457E',
  },
  ברית: {
    background: 'rgba(231, 243, 236, 0.96)',
    border: 'rgba(67, 122, 92, 0.18)',
    text: '#2F6046',
  },
  'אירוע חברה': {
    background: 'rgba(228, 238, 247, 0.96)',
    border: 'rgba(6, 23, 62, 0.14)',
    text: colors.yaleBlue,
  },
};

const HEADER_EVENT_TYPES = ['all', 'חתונה', 'בר מצווה', 'בת מצווה', 'אירוע חברה'] as const;
type HeaderEventType = (typeof HEADER_EVENT_TYPES)[number];
const HEADER_CHIPS_TOP_GAP = 16;
const HEADER_CHIPS_ROW_HEIGHT = 42;
const HEADER_CHIPS_INNER_BOTTOM_GAP = 8;
const HEADER_CHIPS_BOTTOM_GAP = 12;

export default function AdminEventsScreen() {
  const router = useRouter();
  const typeChipsScrollRef = useRef<ScrollView | null>(null);
  const insets = useSafeAreaInsets();
  const userType = useUserStore((state) => state.userType);
  const isEmployeeAppUser = userType === 'employee' && Platform.OS !== 'web';

  const [showFilterDialog, setShowFilterDialog] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [selectedEventType, setSelectedEventType] = useState<HeaderEventType>('all');
  const [isStickyHeaderActive, setIsStickyHeaderActive] = useState(false);
  const [headerContentHeight, setHeaderContentHeight] = useState(52);
  const lastScrollYRef = useRef(0);
  const scrollY = useRef(new Animated.Value(0)).current;
  const chipsVisualProgress = useRef(new Animated.Value(0)).current;
  const chipsLayoutProgress = useRef(new Animated.Value(0)).current;
  const loadEventsFn = useMemo(() => async () => {
    const data = await eventService.getEvents();
    return Array.isArray(data) ? (data as Event[]) : [];
  }, []);

  const {
    loading,
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
      filteredEvents.filter((event) => {
        if (selectedEventType === 'all') return true;
        return (inferEventType(event.title) || 'חתונה') === selectedEventType;
      }),
    [filteredEvents, selectedEventType]
  );
  const emptyMessage =
    selectedEventType === 'all'
      ? 'לא נמצאו אירועים'
      : `אין כרגע אירועים מסוג ${selectedEventType}`;

  useEffect(() => {
    const toValue = isStickyHeaderActive ? 1 : 0;

    Animated.parallel([
      Animated.timing(chipsVisualProgress, {
        toValue,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(chipsLayoutProgress, {
        toValue,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();
  }, [chipsLayoutProgress, chipsVisualProgress, isStickyHeaderActive]);

  const chipsOpacity = chipsVisualProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const chipsTranslateY = chipsVisualProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -14],
  });
  const chipsMaxHeight = chipsLayoutProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [HEADER_CHIPS_TOP_GAP + HEADER_CHIPS_ROW_HEIGHT + HEADER_CHIPS_INNER_BOTTOM_GAP, 0],
  });
  const chipsBottomGap = chipsLayoutProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [HEADER_CHIPS_BOTTOM_GAP, 0],
  });
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
  const chipsSpacerHeight = Animated.add(chipsMaxHeight, chipsBottomGap);

  // UI
  const today = new Date();
  const getDaysLeft = (date: Date | string) => {
    const d = new Date(date);
    const diff = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff >= 0 ? `עוד ${diff} ימים` : 'עבר';
  };

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
        </View>

        <Animated.View
          style={[
            styles.typeChipsAnimatedWrap,
            {
              height: chipsMaxHeight,
            },
          ]}
        >
          <View style={styles.typeChipsMeasureWrap}>
            <Animated.View
              style={[
                styles.typeChipsInnerWrap,
                {
                  opacity: chipsOpacity,
                  transform: [{ translateY: chipsTranslateY }],
                },
              ]}
            >
              <ScrollView
                ref={typeChipsScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.typeChipsScroll}
                contentContainerStyle={styles.typeChipsRow}
                onContentSizeChange={() => typeChipsScrollRef.current?.scrollToEnd({ animated: false })}
              >
                {HEADER_EVENT_TYPES.map((eventTypeKey) => {
                  const active = selectedEventType === eventTypeKey;
                  const label = eventTypeKey === 'all' ? 'הכל' : eventTypeKey;
                  return (
                    <TouchableOpacity
                      key={eventTypeKey}
                      style={[styles.typeChipHeader, active && styles.typeChipHeaderActive]}
                      onPress={() => setSelectedEventType(eventTypeKey)}
                      activeOpacity={0.88}
                    >
                      <Text style={[styles.typeChipHeaderText, active && styles.typeChipHeaderTextActive]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </Animated.View>
          </View>
        </Animated.View>
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
        <Animated.View style={{ height: chipsSpacerHeight }} />

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
                <TouchableOpacity
                  style={styles.filterDialogCloseBtn}
                  onPress={() => setShowFilterDialog(false)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="close" size={18} color={colors.text} />
                </TouchableOpacity>

                <View style={styles.filterDialogTitleWrap}>
                  <Text style={styles.filterDialogTitle}>בחר סוג סינון</Text>
                  <Text style={styles.filterDialogSubtitle}>{currentFilterLabel}</Text>
                </View>
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
                  <View style={styles.filterOptionIconWrap}>
                    <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                  </View>
                  <View style={styles.filterOptionTextWrap}>
                    <Text style={styles.filterOptionTitle}>בחירת תאריך מדויק</Text>
                    <Text style={styles.filterOptionText}>לבחור יום מסוים להצגת האירועים</Text>
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
                  <View style={styles.filterOptionIconWrap}>
                    <Ionicons name="calendar-number-outline" size={18} color={colors.primary} />
                  </View>
                  <View style={styles.filterOptionTextWrap}>
                    <Text style={styles.filterOptionTitle}>בחירת חודש</Text>
                    <Text style={styles.filterOptionText}>לסנן את הרשימה לפי חודש של האירוע</Text>
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
                  <Ionicons name="refresh-outline" size={16} color={colors.primary} />
                  <Text style={styles.clearFilterBtnText}>נקה סינון</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </Modal>

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
          ) : visibleEvents.length === 0 ? (
            <View style={styles.emptyStateCard}>
              <Ionicons name="calendar-outline" size={44} color={colors.gray[500]} />
              <Text style={styles.emptyStateText}>{emptyMessage}</Text>
              {selectedEventType !== 'all' ? (
                <Text style={styles.emptyStateSubtext}>נסה לבחור תגית אחרת או להוסיף אירוע חדש.</Text>
              ) : null}
            </View>
          ) : (
            visibleEvents.map(event => {
              const dateObj = new Date(event.date);
              const dayNum = dateObj.toLocaleDateString('he-IL', { day: '2-digit' });
              const monthName = MONTHS[dateObj.getMonth()];
              const fullDateLabel = rtlText(dateObj.toLocaleDateString('he-IL', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
              }));
              const eventType = inferEventType(event.title) || 'חתונה';
              const eventTypeLabel = rtlText(eventType);
              const eventTypePillMeta = EVENT_TYPE_PILL_META[eventType];
              const invitationImageUrl = String(event.invitationImageUrl ?? '').trim();
              const coverSource: any = invitationImageUrl ? { uri: invitationImageUrl } : EVENT_IMAGE_BY_TYPE[eventType];
              const locationLabel = rtlText([event.location, event.city].filter(Boolean).join(', '));
              const ownerNameLabel = rtlText(String(event.userName ?? '').trim());
              const eventTitleLabel = rtlText(String(event.title ?? '').trim());

              return (
                <View key={event.id} style={styles.eventBlock}>
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: '/(admin)/admin-event-details', params: { id: event.id } })}
                    style={styles.eventCard}
                    activeOpacity={0.92}
                  >
                    <View style={styles.cardImageWrap}>
                      <Image source={coverSource} style={styles.coverImg} resizeMode="cover" />
                      <LinearGradient
                        colors={['rgba(6,23,62,0.02)', 'rgba(6,23,62,0.45)']}
                        style={styles.coverGradient}
                      />

                      <View style={styles.dateBadgeCard}>
                        <Text style={styles.dateBadgeDay}>{dayNum}</Text>
                        <Text style={styles.dateBadgeMonth}>{monthName}</Text>
                      </View>

                      <View
                        style={[
                          styles.typePill,
                          {
                            backgroundColor: eventTypePillMeta.background,
                            borderColor: eventTypePillMeta.border,
                          },
                        ]}
                      >
                        <Text style={[styles.typePillText, { color: eventTypePillMeta.text }]}>{eventTypeLabel}</Text>
                      </View>

                      <LinearGradient
                        colors={['rgba(6,23,62,0.96)', 'rgba(0,53,102,0.92)']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.countdownPill}
                      >
                        <Text style={styles.countdownPillText}>{getDaysLeft(event.date)}</Text>
                      </LinearGradient>

                      {event.userName ? (
                        <View style={styles.ownerPillOnImage}>
                          <Ionicons name="person-outline" size={12} color={colors.white} />
                          <Text style={styles.ownerPillOnImageText} numberOfLines={1}>
                            {ownerNameLabel}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    <LinearGradient
                      colors={['rgba(255,255,255,0.98)', 'rgba(249,247,242,0.98)']}
                      style={styles.eventCardBody}
                    >
                      <View style={styles.eventCardHeader}>
                        <View style={styles.eventTypePillBody}>
                          <Text style={styles.eventTypePillBodyText} numberOfLines={1}>
                            {eventTitleLabel}
                          </Text>
                        </View>

                        <View style={styles.eventTitleWrap}>
                          {locationLabel ? (
                            <View style={styles.locationMetaCard}>
                              <View style={styles.locationMetaIconWrap}>
                                <Ionicons name="location" size={12} color={colors.white} />
                              </View>
                              <Text style={styles.locationMetaText} numberOfLines={1}>
                                {locationLabel}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>

                      <View style={styles.metaGrid}>
                        {typeof event.guests === 'number' && event.guests > 0 ? (
                          <View style={styles.metaCard}>
                            <Ionicons name="people-outline" size={15} color={colors.primary} />
                            <Text style={styles.metaCardText}>{event.guests} מוזמנים</Text>
                          </View>
                        ) : null}
                      </View>

                      <View style={styles.cardFooterRow}>
                        <View style={styles.openActionPill}>
                          <Text style={styles.openActionText}>לפרטי האירוע</Text>
                          <Ionicons name="chevron-back" size={15} color={colors.white} />
                        </View>
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>
      </AppKeyboardAwareScrollView>

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
  typeChipsAnimatedWrap: {
    overflow: 'hidden',
  },
  typeChipsMeasureWrap: {
    paddingTop: HEADER_CHIPS_TOP_GAP,
    paddingBottom: HEADER_CHIPS_INNER_BOTTOM_GAP,
  },
  typeChipsInnerWrap: {
    overflow: 'hidden',
  },
  typeChipsScroll: {
    marginTop: 0,
  },
  typeChipsRow: {
    flexDirection: ROW_DIR,
    justifyContent: 'flex-end',
    paddingHorizontal: 18,
    paddingBottom: 0,
    gap: 8,
  },
  typeChipHeader: {
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeChipHeaderActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typeChipHeaderText: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'center',
  },
  typeChipHeaderTextActive: {
    color: colors.white,
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
    alignItems: 'flex-end',
    gap: 4,
  },
  filterDialogTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  filterDialogSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
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
    alignItems: 'flex-end',
    gap: 4,
  },
  filterOptionTitle: {
    width: '100%',
    fontSize: 15,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  filterOptionText: {
    width: '100%',
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
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
    textAlign: 'right',
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
    gap: 14,
  },
  eventBlock: {
    paddingHorizontal: 4,
  },
  eventCard: {
    width: '100%',
    borderRadius: 30,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    shadowColor: colors.black,
    shadowOpacity: 0.10,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  cardImageWrap: {
    width: '100%',
    aspectRatio: 16 / 9.2,
    position: 'relative',
  },
  coverImg: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  coverGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  dateBadgeCard: {
    position: 'absolute',
    top: 14,
    end: 14,
    minWidth: 58,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.90)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateBadgeDay: {
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'center',
  },
  dateBadgeMonth: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'center',
  },
  typePill: {
    position: 'absolute',
    start: 14,
    top: 14,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 999,
    borderWidth: 1,
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  typePillText: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  countdownPill: {
    position: 'absolute',
    start: 14,
    bottom: 14,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    shadowColor: colors.richBlack,
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  countdownPillText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#F6E7BD',
    letterSpacing: 0.2,
  },
  eventCardBody: {
    padding: 16,
    gap: 14,
  },
  eventCardHeader: {
    gap: 10,
  },
  eventTitleWrap: {
    gap: 5,
    alignSelf: 'stretch',
  },
  eventTitleNew: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 26,
    alignSelf: 'stretch',
  },
  eventDateLine: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
  },
  ownerPillOnImage: {
    position: 'absolute',
    end: 14,
    bottom: 14,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(6,23,62,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    shadowColor: colors.black,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  ownerPillOnImageText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.white,
    maxWidth: 160,
  },
  eventTypePillBody: {
    alignSelf: ALIGN_RIGHT,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  eventTypePillBodyText: {
    fontSize: 20,
    fontWeight: '900',
  },
  ownerPillInline: {
    alignSelf: ALIGN_RIGHT,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(6,23,62,0.06)',
  },
  ownerPillPlaceholder: {
    alignSelf: ALIGN_RIGHT,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(6,23,62,0.04)',
  },
  ownerPillPlaceholderText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  ownerAvatarWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
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
    maxWidth: 180,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  metaGrid: {
    flexDirection: ROW_DIR,
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  metaCard: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
  },
  locationMetaCard: {
    alignSelf: ALIGN_RIGHT,
    marginTop: 4,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(232, 240, 255, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
    shadowColor: colors.primary,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  locationMetaIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  locationMetaText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    maxWidth: 210,
  },
  metaCardText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'right',
  },
  cardFooterRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  openActionPill: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    shadowColor: colors.primary,
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  openActionText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.white,
    textAlign: 'right',
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