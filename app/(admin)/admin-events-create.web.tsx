import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePickerModal from 'react-native-modal-datetime-picker';

import { colors } from '@/constants/colors';
import { userService } from '@/lib/services/userService';
import { eventService } from '@/lib/services/eventService';

const EVENT_TYPES = [
  { label: 'חתונה', value: 'חתונה', icon: 'heart' as const, hint: 'יום מיוחד לזוג' },
  { label: 'בר מצווה', value: 'בר מצווה', icon: 'ribbon' as const, hint: 'אירוע משפחתי' },
  { label: 'בת מצווה', value: 'בת מצווה', icon: 'sparkles' as const, hint: 'חגיגה מרגשת' },
  { label: 'ברית', value: 'ברית', icon: 'star' as const, hint: 'מסורת וחיבור' },
  { label: 'אירוע חברה', value: 'אירוע חברה', icon: 'briefcase' as const, hint: 'עסקים ונטוורקינג' },
] as const;

type CoupleOption = { id: string; name: string; email: string };

export default function AdminEventsCreateWebScreen() {
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId?: string }>();
  const { width } = useWindowDimensions();
  const isLg = width >= 1024;
  const isDesktop = width >= 1200;

  const [coupleOptions, setCoupleOptions] = useState<CoupleOption[]>([]);
  const [loadingCouples, setLoadingCouples] = useState(false);

  const [form, setForm] = useState({
    user_id: '',
    eventType: '',
    eventName: '',
    date: '',
    location: '',
    city: '',
    groomName: '',
    brideName: '',
  });
  const [saving, setSaving] = useState(false);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [webCalendarOpen, setWebCalendarOpen] = useState(false);
  const [webCalendarMonth, setWebCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [focusedField, setFocusedField] = useState<
    null | 'eventName' | 'groomName' | 'brideName' | 'location' | 'city' | 'search'
  >(null);

  useEffect(() => {
    if (typeof userId === 'string' && userId) {
      setForm((f) => (f.user_id ? f : { ...f, user_id: userId }));
    }
  }, [userId]);

  const selectedUser = useMemo(() => coupleOptions.find((c) => c.id === form.user_id) || null, [coupleOptions, form.user_id]);

  const filteredCouples = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return coupleOptions;
    return coupleOptions.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
  }, [coupleOptions, userSearch]);

  const loadAvailableCouples = async () => {
    setLoadingCouples(true);
    try {
      const allCouples = await userService.getClients();
      setCoupleOptions(
        allCouples
          .filter((u) => (u.events_count || 0) === 0)
          .map((u) => ({ id: u.id, name: u.name, email: u.email }))
      );
    } finally {
      setLoadingCouples(false);
    }
  };

  useEffect(() => {
    void loadAvailableCouples();
  }, []);

  const formatDate = (dateString: string) =>
    dateString ? new Date(dateString).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';

  const isWedding = form.eventType === 'חתונה';
  const isFormValid = Boolean(form.user_id && form.eventType && form.eventName.trim() && form.date);

  const completion = useMemo(() => {
    const parts = [
      Boolean(form.eventType),
      Boolean(form.date && form.eventName.trim()),
      Boolean(form.user_id),
    ];
    const done = parts.filter(Boolean).length;
    return Math.round((done / parts.length) * 100);
  }, [form.date, form.eventName, form.eventType, form.user_id]);

  const currentStep = useMemo(() => {
    if (!form.eventType) return 1;
    if (!(form.date && form.eventName.trim())) return 2;
    return 3;
  }, [form.date, form.eventName, form.eventType]);

  const handleAddEvent = async () => {
    if (!isFormValid) return;
    setSaving(true);
    try {
      const cleanEventName = form.eventName.trim();
      const cleanType = form.eventType.trim();
      const titleToSave = cleanEventName ? `${cleanType} — ${cleanEventName}` : cleanType;
      await eventService.createEventForUser(form.user_id, {
        title: titleToSave,
        date: new Date(form.date),
        location: form.location.trim(),
        city: form.city.trim(),
        story: '',
        guests: 0,
        budget: 0,
        groomName: isWedding ? form.groomName.trim() || undefined : undefined,
        brideName: isWedding ? form.brideName.trim() || undefined : undefined,
      });
      router.replace('/(admin)/admin-events');
    } catch (e) {
      console.error('Create event error:', e);
    } finally {
      setSaving(false);
    }
  };

  const shellStyle = useMemo(() => [styles.shell, width >= 1600 ? styles.shellXl : null], [width]);

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const toISODate = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const monthTitle = useMemo(() => {
    try {
      return webCalendarMonth.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
    } catch {
      return `${webCalendarMonth.getMonth() + 1}/${webCalendarMonth.getFullYear()}`;
    }
  }, [webCalendarMonth]);

  const calendarDays = useMemo(() => {
    // Week starts Sunday (Israel). Build 6 weeks grid (42 days).
    const firstOfMonth = new Date(webCalendarMonth.getFullYear(), webCalendarMonth.getMonth(), 1);
    const startOffset = firstOfMonth.getDay(); // 0..6 (Sun..Sat)
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(firstOfMonth.getDate() - startOffset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      return d;
    });
  }, [webCalendarMonth]);

  const openDatePicker = () => {
    if (Platform.OS === 'web') {
      const base = form.date ? new Date(form.date) : new Date();
      setWebCalendarMonth(new Date(base.getFullYear(), base.getMonth(), 1));
      setWebCalendarOpen(true);
      return;
    }
    setShowDatePicker(true);
  };

  return (
    <View style={styles.page}>
      <View style={shellStyle}>
        <View style={[styles.columns, !isLg ? styles.columnsMobile : null]}>
          <ScrollView
            style={styles.main}
            contentContainerStyle={[styles.mainContent, !isLg ? styles.mainContentMobile : null]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.hero}>
              <View style={styles.progressWrap}>
                <View style={styles.progressRow}>
                  <Text style={styles.progressMeta}>{`שלב ${currentStep} מתוך 3`}</Text>
                  <Text style={styles.progressMeta}>{`${completion}%`}</Text>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${completion}%` } as any]} />
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>1</Text>
                </View>
                <Text style={styles.sectionTitle}>סוג האירוע</Text>
              </View>

              <View style={[styles.typeGrid, isDesktop ? styles.typeGridDesktop : null]}>
                {EVENT_TYPES.map((t) => {
                  const active = form.eventType === t.value;
                  return (
                    <Pressable
                      key={t.value}
                      accessibilityRole="button"
                      accessibilityLabel={`בחירת סוג ${t.label}`}
                      onPress={() =>
                        setForm((f) => ({
                          ...f,
                          eventType: t.value,
                          // clear wedding-only fields when switching away
                          groomName: t.value === 'חתונה' ? f.groomName : '',
                          brideName: t.value === 'חתונה' ? f.brideName : '',
                        }))
                      }
                      style={({ hovered, pressed }: any) => [
                        styles.typeCard,
                        isDesktop ? styles.typeCardDesktop : null,
                        active ? styles.typeCardActive : null,
                        Platform.OS === 'web' && hovered ? styles.typeCardHover : null,
                        pressed ? { opacity: 0.92 } : null,
                      ]}
                    >
                      <View style={[styles.typeIcon, active ? styles.typeIconActive : null]}>
                        <Ionicons name={t.icon} size={18} color={active ? stylesTokens.primary : stylesTokens.text} />
                      </View>

                      <View style={styles.typeText}>
                        <Text style={styles.typeTitle}>{t.label}</Text>
                        <Text style={styles.typeHint} numberOfLines={2}>
                          {t.hint}
                        </Text>
                      </View>

                      {active ? (
                        <View style={styles.typeCheck}>
                          <Ionicons name="checkmark-circle" size={20} color={stylesTokens.primary} />
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>2</Text>
                </View>
                <Text style={styles.sectionTitle}>פרטי האירוע</Text>
              </View>

              <View style={styles.card}>
                <Text style={styles.fieldLabel}>תאריך</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="בחירת תאריך"
                  onPress={openDatePicker}
                  style={({ hovered, pressed }: any) => [
                    styles.dateRow,
                    Platform.OS === 'web' && hovered ? styles.inputHover : null,
                    pressed ? { opacity: 0.92 } : null,
                  ]}
                >
                  <View style={styles.inputIcon}>
                    <Ionicons name="calendar-outline" size={18} color={stylesTokens.textMuted} />
                  </View>
                  <Text style={[styles.dateText, !form.date ? styles.dateTextPlaceholder : null]} numberOfLines={1}>
                    {form.date ? formatDate(form.date) : 'בחר תאריך לאירוע'}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={stylesTokens.textMuted} />
                </Pressable>

                <View style={styles.formGrid}>
                  <View style={styles.formColFull}>
                    <Text style={styles.fieldLabel}>שם האירוע</Text>
                    <TextInput
                      value={form.eventName}
                      onChangeText={(v) => setForm((f) => ({ ...f, eventName: v }))}
                      placeholder="לדוגמה: החתונה של דני ומאיה"
                      placeholderTextColor={stylesTokens.placeholder}
                      style={[styles.input, focusedField === 'eventName' ? styles.inputFocused : null]}
                      textAlign="right"
                      onFocus={() => setFocusedField('eventName')}
                      onBlur={() => setFocusedField(null)}
                    />
                  </View>

                  {isWedding ? (
                    <>
                      <View style={styles.formColHalf}>
                        <Text style={styles.fieldLabel}>שם החתן (אופציונלי)</Text>
                        <TextInput
                          value={form.groomName}
                          onChangeText={(v) => setForm((f) => ({ ...f, groomName: v }))}
                          placeholder="דני"
                          placeholderTextColor={stylesTokens.placeholder}
                          style={[styles.input, focusedField === 'groomName' ? styles.inputFocused : null]}
                          textAlign="right"
                          onFocus={() => setFocusedField('groomName')}
                          onBlur={() => setFocusedField(null)}
                        />
                      </View>
                      <View style={styles.formColHalf}>
                        <Text style={styles.fieldLabel}>שם הכלה (אופציונלי)</Text>
                        <TextInput
                          value={form.brideName}
                          onChangeText={(v) => setForm((f) => ({ ...f, brideName: v }))}
                          placeholder="מאיה"
                          placeholderTextColor={stylesTokens.placeholder}
                          style={[styles.input, focusedField === 'brideName' ? styles.inputFocused : null]}
                          textAlign="right"
                          onFocus={() => setFocusedField('brideName')}
                          onBlur={() => setFocusedField(null)}
                        />
                      </View>
                    </>
                  ) : null}

                  <View style={styles.formColFull}>
                    <Text style={styles.fieldLabel}>מיקום האירוע (אופציונלי)</Text>
                    <View style={styles.inputWrap}>
                      <Ionicons name="location-outline" size={18} color={stylesTokens.textMuted} style={styles.inputLeadingIcon} />
                      <TextInput
                        value={form.location}
                        onChangeText={(v) => setForm((f) => ({ ...f, location: v }))}
                        placeholder="חפש אולם או כתובת..."
                        placeholderTextColor={stylesTokens.placeholder}
                        style={[styles.input, focusedField === 'location' ? styles.inputFocused : null]}
                        textAlign="right"
                        onFocus={() => setFocusedField('location')}
                        onBlur={() => setFocusedField(null)}
                      />
                    </View>
                  </View>

                  <View style={styles.formColHalf}>
                    <Text style={styles.fieldLabel}>עיר (אופציונלי)</Text>
                    <TextInput
                      value={form.city}
                      onChangeText={(v) => setForm((f) => ({ ...f, city: v }))}
                      placeholder="לדוגמה: תל אביב"
                      placeholderTextColor={stylesTokens.placeholder}
                      style={[styles.input, focusedField === 'city' ? styles.inputFocused : null]}
                      textAlign="right"
                      onFocus={() => setFocusedField('city')}
                      onBlur={() => setFocusedField(null)}
                    />
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>3</Text>
                </View>
                <Text style={styles.sectionTitle}>בחירת לקוח</Text>
              </View>

              <View style={styles.card}>
                <Text style={styles.fieldLabel}>שיוך משתמש לאירוע</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="בחירת משתמש"
                  onPress={() => setUserModalOpen(true)}
                  style={({ hovered, pressed }: any) => [
                    styles.selector,
                    Platform.OS === 'web' && hovered ? styles.inputHover : null,
                    pressed ? { opacity: 0.92 } : null,
                  ]}
                >
                  <View style={styles.selectorIcon}>
                    <Ionicons name="person-outline" size={18} color={stylesTokens.primary} />
                  </View>
                  <View style={styles.selectorText}>
                    <Text style={styles.selectorTitle} numberOfLines={1}>
                      {selectedUser ? selectedUser.name : 'בחר משתמש'}
                    </Text>
                    <Text style={styles.selectorSubtitle} numberOfLines={1}>
                      {selectedUser ? selectedUser.email : 'הקצאת משתמש לאירוע'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-down" size={18} color={stylesTokens.textMuted} />
                </Pressable>

                <Text style={styles.miniHint}>
                  בחרו משתמש עם 0 אירועים פעילים. אם לא מופיעים משתמשים, נסו לרענן.
                </Text>
              </View>
            </View>
          </ScrollView>

          {isLg ? (
            <View style={styles.side}>
              <View style={styles.sideSticky}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryTitle}>סיכום אירוע</Text>

                  <View style={styles.summaryList}>
                    <View style={styles.summaryItem}>
                      <View style={styles.summaryIconCircle}>
                        <Ionicons name="pricetag-outline" size={18} color={stylesTokens.white} />
                      </View>
                      <View style={styles.summaryText}>
                        <Text style={styles.summaryLabel}>סוג אירוע</Text>
                        <Text style={styles.summaryValue}>{form.eventType || 'טרם נבחר'}</Text>
                      </View>
                    </View>

                    <View style={styles.summaryItem}>
                      <View style={styles.summaryIconCircle}>
                        <Ionicons name="text-outline" size={18} color={stylesTokens.white} />
                      </View>
                      <View style={styles.summaryText}>
                        <Text style={styles.summaryLabel}>שם האירוע</Text>
                        <Text style={styles.summaryValue}>{form.eventName.trim() ? form.eventName.trim() : 'טרם נבחר'}</Text>
                      </View>
                    </View>

                    <View style={styles.summaryItem}>
                      <View style={styles.summaryIconCircle}>
                        <Ionicons name="calendar-outline" size={18} color={stylesTokens.white} />
                      </View>
                      <View style={styles.summaryText}>
                        <Text style={styles.summaryLabel}>תאריך</Text>
                        <Text style={styles.summaryValue}>{form.date ? formatDate(form.date) : 'טרם נבחר'}</Text>
                      </View>
                    </View>

                    <View style={styles.summaryItem}>
                      <View style={styles.summaryIconCircle}>
                        <Ionicons name="pin-outline" size={18} color={stylesTokens.white} />
                      </View>
                      <View style={styles.summaryText}>
                        <Text style={styles.summaryLabel}>מיקום</Text>
                        <Text style={[styles.summaryValue, !form.location.trim() ? styles.summaryValueMuted : null]} numberOfLines={2}>
                          {form.location.trim() ? `${form.location.trim()}${form.city.trim() ? `, ${form.city.trim()}` : ''}` : 'לא צוין מיקום'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.summaryItem}>
                      <View style={[styles.summaryIconCircle, styles.summaryIconCircleMuted]}>
                        <Ionicons name="person-outline" size={18} color={'rgba(255,255,255,0.86)'} />
                      </View>
                      <View style={styles.summaryText}>
                        <Text style={styles.summaryLabel}>לקוח</Text>
                        <Text style={styles.summaryValue}>{selectedUser ? selectedUser.name : '—'}</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.summaryFooter}>
                    <View style={styles.statusRow}>
                      <Text style={styles.statusLabel}>סטטוס</Text>
                      <View style={[styles.statusChip, isFormValid ? styles.statusChipReady : null]}>
                        <Text style={[styles.statusChipText, isFormValid ? styles.statusChipTextReady : null]}>
                          {isFormValid ? 'מוכן לשמירה' : 'טיוטה חדשה'}
                        </Text>
                      </View>
                    </View>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="צור אירוע"
                      disabled={!isFormValid || saving}
                      onPress={() => void handleAddEvent()}
                      style={({ hovered, pressed }: any) => [
                        styles.summaryCTA,
                        (!isFormValid || saving) ? { opacity: 0.55 } : null,
                        Platform.OS === 'web' && hovered ? styles.primaryCTAHover : null,
                        pressed ? { opacity: 0.92 } : null,
                      ]}
                    >
                      {saving ? <ActivityIndicator color={stylesTokens.white} /> : <Ionicons name="add" size={18} color={stylesTokens.white} />}
                      <Text style={styles.primaryCTAText}>{saving ? 'שומר...' : 'צור אירוע'}</Text>
                      <Ionicons name="arrow-forward" size={18} color={stylesTokens.white} />
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>
          ) : null}

        </View>
      </View>

      {!isLg ? (
        <View style={styles.mobileBottomBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="צור אירוע"
            disabled={!isFormValid || saving}
            onPress={() => void handleAddEvent()}
            style={({ hovered, pressed }: any) => [
              styles.primaryCTAMobile,
              (!isFormValid || saving) ? { opacity: 0.55 } : null,
              Platform.OS === 'web' && hovered ? styles.primaryCTAHover : null,
              pressed ? { opacity: 0.92 } : null,
            ]}
          >
            {saving ? <ActivityIndicator color={stylesTokens.white} /> : <Ionicons name="add" size={18} color={stylesTokens.white} />}
            <Text style={styles.primaryCTAText}>{saving ? 'שומר...' : 'צור אירוע'}</Text>
            <Ionicons name="arrow-forward" size={18} color={stylesTokens.white} />
          </Pressable>
        </View>
      ) : null}

      <Modal transparent visible={Platform.OS === 'web' && webCalendarOpen} animationType="fade" onRequestClose={() => setWebCalendarOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setWebCalendarOpen(false)}>
          <Pressable style={styles.dateModalCard} onPress={() => null}>
            <View style={styles.dateModalHeader}>
              <View style={styles.dateHeaderSide}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="חודש קודם"
                  onPress={() =>
                    setWebCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
                  }
                  style={({ hovered, pressed }: any) => [
                    styles.iconCircle,
                    Platform.OS === 'web' && hovered ? styles.iconCircleHover : null,
                    pressed ? { opacity: 0.9 } : null,
                  ]}
                >
                  <Ionicons name="chevron-forward" size={18} color={stylesTokens.textMuted} />
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="חודש הבא"
                  onPress={() =>
                    setWebCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
                  }
                  style={({ hovered, pressed }: any) => [
                    styles.iconCircle,
                    Platform.OS === 'web' && hovered ? styles.iconCircleHover : null,
                    pressed ? { opacity: 0.9 } : null,
                  ]}
                >
                  <Ionicons name="chevron-back" size={18} color={stylesTokens.textMuted} />
                </Pressable>
              </View>

              <Text style={styles.dateModalTitle}>{monthTitle}</Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="סגירה"
                onPress={() => setWebCalendarOpen(false)}
                style={({ hovered, pressed }: any) => [
                  styles.iconCircle,
                  Platform.OS === 'web' && hovered ? styles.iconCircleHover : null,
                  pressed ? { opacity: 0.9 } : null,
                ]}
              >
                <Ionicons name="close" size={18} color={stylesTokens.textMuted} />
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'].map((d) => (
                <Text key={d} style={styles.weekDay}>
                  {d}
                </Text>
              ))}
            </View>

            <View style={styles.calendarGrid}>
              {calendarDays.map((d) => {
                const today = startOfDay(new Date());
                const day = startOfDay(d);
                const disabled = day < today;
                const isOutside = d.getMonth() !== webCalendarMonth.getMonth();
                const selected = form.date ? toISODate(d) === form.date : false;
                const isToday = toISODate(d) === toISODate(new Date());

                return (
                  <Pressable
                    key={toISODate(d)}
                    accessibilityRole="button"
                    accessibilityLabel={`בחירת תאריך ${d.toLocaleDateString('he-IL')}`}
                    disabled={disabled}
                    onPress={() => {
                      setForm((f) => ({ ...f, date: toISODate(d) }));
                      setWebCalendarOpen(false);
                    }}
                    style={({ hovered, pressed }: any) => [
                      styles.dayCell,
                      isOutside ? styles.dayCellOutside : null,
                      disabled ? styles.dayCellDisabled : null,
                      isToday ? styles.dayCellToday : null,
                      selected ? styles.dayCellSelected : null,
                      Platform.OS === 'web' && hovered && !disabled ? styles.dayCellHover : null,
                      pressed ? { opacity: 0.92 } : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        isOutside ? styles.dayTextOutside : null,
                        disabled ? styles.dayTextDisabled : null,
                        selected ? styles.dayTextSelected : null,
                      ]}
                    >
                      {d.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.dateModalFooter}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="בחירת היום"
                onPress={() => {
                  const d = new Date();
                  setWebCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                  setForm((f) => ({ ...f, date: toISODate(d) }));
                  setWebCalendarOpen(false);
                }}
                style={({ hovered, pressed }: any) => [
                  styles.todayBtn,
                  Platform.OS === 'web' && hovered ? styles.todayBtnHover : null,
                  pressed ? { opacity: 0.92 } : null,
                ]}
              >
                <Ionicons name="today-outline" size={16} color={stylesTokens.primary} />
                <Text style={styles.todayBtnText}>היום</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="נקה תאריך"
                onPress={() => {
                  setForm((f) => ({ ...f, date: '' }));
                  setWebCalendarOpen(false);
                }}
                style={({ hovered, pressed }: any) => [
                  styles.clearBtn,
                  Platform.OS === 'web' && hovered ? styles.clearBtnHover : null,
                  pressed ? { opacity: 0.92 } : null,
                ]}
              >
                <Text style={styles.clearBtnText}>נקה</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <DateTimePickerModal
        isVisible={showDatePicker}
        mode="date"
        onConfirm={(date) => {
          setShowDatePicker(false);
          if (date) setForm((f) => ({ ...f, date: date.toISOString().split('T')[0] }));
        }}
        onCancel={() => setShowDatePicker(false)}
        minimumDate={new Date()}
        locale="he-IL"
        date={form.date ? new Date(form.date) : new Date()}
      />

      <Modal transparent visible={userModalOpen} animationType="fade" onRequestClose={() => setUserModalOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setUserModalOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => null}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>בחירת משתמש</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="סגירה"
                onPress={() => setUserModalOpen(false)}
                style={styles.iconCircle}
              >
                <Ionicons name="close" size={18} color={colors.gray[700]} />
              </Pressable>
            </View>

            <View style={styles.searchWrap}>
              <Ionicons name="search" size={18} color={colors.gray[500]} style={styles.searchIcon} />
              <TextInput
                value={userSearch}
                onChangeText={setUserSearch}
                placeholder="חיפוש משתמש..."
                placeholderTextColor={stylesTokens.placeholder}
                style={[styles.searchInput, focusedField === 'search' ? styles.inputFocused : null]}
                textAlign="right"
                onFocus={() => setFocusedField('search')}
                onBlur={() => setFocusedField(null)}
              />
            </View>

            {loadingCouples ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 10 }}>
                {filteredCouples.map((c) => {
                  const active = form.user_id === c.id;
                  return (
                    <Pressable
                      key={c.id}
                      accessibilityRole="button"
                      accessibilityLabel={`בחירת ${c.name}`}
                      onPress={() => {
                        setForm((f) => ({ ...f, user_id: c.id }));
                        setUserModalOpen(false);
                      }}
                      style={({ hovered, pressed }: any) => [
                        styles.userRow,
                        active ? styles.userRowActive : null,
                        Platform.OS === 'web' && hovered ? styles.userRowHover : null,
                        pressed ? { opacity: 0.92 } : null,
                      ]}
                    >
                      <View style={styles.userRowText}>
                        <Text style={styles.userName} numberOfLines={1}>
                          {c.name}
                        </Text>
                        <Text style={styles.userEmail} numberOfLines={1}>
                          {c.email}
                        </Text>
                      </View>
                      {active ? <Ionicons name="checkmark-circle" size={18} color={colors.primary} /> : null}
                    </Pressable>
                  );
                })}

                {filteredCouples.length === 0 ? (
                  <View style={styles.modalEmpty}>
                    <Text style={styles.emptyText}>לא נמצאו משתמשים</Text>
                  </View>
                ) : null}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const stylesTokens = {
  primary: '#162d9c',
  primaryHover: '#112275',
  bgLight: '#F9F9FB',
  surface: '#FFFFFF',
  border: '#E5E7EB',
  text: '#111217',
  textMuted: '#6B7280',
  placeholder: '#9CA3AF',
  white: '#FFFFFF',
};

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: stylesTokens.bgLight,
  },

  // Top header removed per request.

  shell: {
    flex: 1,
    width: '100%',
    maxWidth: 1400,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 24,
  },
  shellXl: {
    maxWidth: 1560,
    paddingHorizontal: 28,
  },
  columns: { flex: 1, flexDirection: 'row', gap: 12, alignItems: 'stretch', minHeight: 0 },
  columnsMobile: { flexDirection: 'column' },

  main: { flex: 1, minWidth: 0, minHeight: 0 },
  mainContent: { gap: 18, paddingBottom: 40 },
  mainContentMobile: { paddingBottom: 130 },

  hero: { gap: 8 },

  progressWrap: { marginTop: 10, gap: 10 },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
  progressMeta: { fontSize: 12, fontWeight: '700', color: '#4B5563', textAlign: 'right' },
  progressTrack: { height: 8, borderRadius: 999, backgroundColor: '#E5E7EB', overflow: 'hidden' },
  progressFill: {
    height: '100%',
    backgroundColor: stylesTokens.primary,
    borderRadius: 999,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 0 10px rgba(22,45,156,0.35)' } as any) : null),
  },

  section: { gap: 12 },
  // Section header row: step badge + title.
  sectionTitleRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
  },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: 'rgba(22,45,156,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 13, fontWeight: '900', color: stylesTokens.primary },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: stylesTokens.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    flexShrink: 1,
  },

  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  typeGridDesktop: { flexWrap: 'nowrap' },
  typeCard: {
    position: 'relative',
    flexGrow: 1,
    flexBasis: 240,
    minWidth: 220,
    padding: 16,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: stylesTokens.surface,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)', cursor: 'pointer' } as any)
      : null),
  },
  typeCardDesktop: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  typeCardHover: {
    borderColor: '#E5E7EB',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 10px 30px -6px rgba(17,24,39,0.10)' } as any) : null),
  },
  typeCardActive: {
    borderColor: stylesTokens.primary,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 0 0 2px rgba(22,45,156,0.10), 0 10px 30px -10px rgba(22,45,156,0.15)' } as any) : null),
  },
  typeIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(22,45,156,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeIconActive: { backgroundColor: 'rgba(22,45,156,0.12)' },
  typeText: { marginTop: 12, gap: 4 },
  typeTitle: { fontSize: 16, fontWeight: '900', color: stylesTokens.text, textAlign: 'right' },
  typeHint: { fontSize: 12, fontWeight: '600', color: stylesTokens.textMuted, textAlign: 'right', lineHeight: 17 },
  typeCheck: { position: 'absolute', top: 14, left: 14 },

  divider: { height: 1, backgroundColor: stylesTokens.border, marginVertical: 8 },

  card: {
    backgroundColor: stylesTokens.surface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(17, 24, 39, 0.06)',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)' } as any) : null),
  },

  fieldLabel: { fontSize: 12, fontWeight: '800', color: '#374151', textAlign: 'right' },
  dateRow: {
    marginTop: 10,
    height: 48,
    borderRadius: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  inputIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(17, 24, 39, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateText: { flex: 1, fontSize: 14, fontWeight: '800', color: stylesTokens.text, textAlign: 'right' },
  dateTextPlaceholder: { color: stylesTokens.placeholder },

  formGrid: { marginTop: 14, flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 14 },
  formColFull: { width: '100%' },
  formColHalf: { flexGrow: 1, flexBasis: 260, minWidth: 220 },

  inputWrap: { position: 'relative', justifyContent: 'center' },
  inputLeadingIcon: { position: 'absolute', right: 12, zIndex: 2 },
  input: {
    marginTop: 10,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingRight: 40,
    fontSize: 14,
    fontWeight: '800',
    color: stylesTokens.text,
  },
  inputHover: { backgroundColor: '#F3F4F6' },
  inputFocused: {
    backgroundColor: stylesTokens.surface,
    borderColor: stylesTokens.primary,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 0 0 2px rgba(22,45,156,0.12)' } as any) : null),
  },

  selector: {
    marginTop: 10,
    height: 56,
    borderRadius: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  selectorIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: 'rgba(22,45,156,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectorText: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  selectorTitle: { fontSize: 14, fontWeight: '900', color: stylesTokens.text, textAlign: 'right' },
  selectorSubtitle: { marginTop: 2, fontSize: 12, fontWeight: '700', color: stylesTokens.textMuted, textAlign: 'right' },
  miniHint: { marginTop: 10, fontSize: 12, fontWeight: '600', color: stylesTokens.textMuted, textAlign: 'right', lineHeight: 17 },

  side: { width: 380, minWidth: 340, flexShrink: 0 },
  sideSticky: {
    gap: 14,
    ...(Platform.OS === 'web' ? ({ position: 'sticky', top: 120 } as any) : null),
  },

  summaryCard: {
    backgroundColor: '#0f1f6d',
    borderRadius: 18,
    padding: 18,
    borderWidth: 0,
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage: 'linear-gradient(135deg, #162d9c, #0f1f6d)',
          boxShadow: '0 20px 60px rgba(17,24,39,0.18)',
        } as any)
      : null),
  },
  summaryTitle: { width: '100%', fontSize: 16, fontWeight: '900', color: stylesTokens.white, textAlign: 'right', marginBottom: 12 },
  summaryList: { gap: 14 },
  summaryItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, verticalAlign: 'bottom' as any },
  summaryIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryIconCircleMuted: { backgroundColor: 'rgba(255,255,255,0.12)' },
  summaryText: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  summaryLabel: { fontSize: 10, fontWeight: '900', color: 'rgba(255,255,255,0.75)', textAlign: 'right' },
  summaryValue: { marginTop: 2, fontSize: 14, fontWeight: '800', color: stylesTokens.white, textAlign: 'right' },
  summaryValueMuted: { color: 'rgba(255,255,255,0.62)', fontStyle: 'italic' },

  summaryFooter: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.14)', gap: 12 },
  statusRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
  statusLabel: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.75)', textAlign: 'right' },
  statusChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.16)' },
  statusChipReady: { backgroundColor: 'rgba(16, 185, 129, 0.22)' },
  statusChipText: { fontSize: 11, fontWeight: '900', color: 'rgba(255,255,255,0.90)', textAlign: 'right' },
  statusChipTextReady: { color: '#A7F3D0' },

  summaryCTA: {
    height: 52,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },

  primaryCTA: {
    height: 52,
    borderRadius: 18,
    backgroundColor: stylesTokens.primary,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', boxShadow: '0 12px 24px rgba(22,45,156,0.20)' } as any) : null),
  },
  primaryCTAMobile: {
    height: 52,
    borderRadius: 16,
    backgroundColor: stylesTokens.primary,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  primaryCTAHover: { backgroundColor: stylesTokens.primaryHover },
  primaryCTAText: { fontSize: 16, fontWeight: '900', color: stylesTokens.white, textAlign: 'right' },

  mobileBottomBar: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: stylesTokens.border,
    backgroundColor: stylesTokens.surface,
    ...(Platform.OS === 'web'
      ? ({
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 60,
        } as any)
      : null),
  },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 18 },
  modalCard: {
    width: '100%',
    maxWidth: 680,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    overflow: 'hidden',
    padding: 16,
    maxHeight: '86%',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 20px 60px rgba(0,0,0,0.18)' } as any) : null),
  },
  modalHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  modalTitle: { width: '100%', fontSize: 16, fontWeight: '900', color: stylesTokens.text, textAlign: 'right' },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: 'rgba(17, 24, 39, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(17, 24, 39, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  iconCircleHover: { backgroundColor: 'rgba(17, 24, 39, 0.07)' },
  searchWrap: {
    marginTop: 12,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
  },
  searchIcon: { position: 'absolute', left: 12 },
  searchInput: { width: '100%', paddingLeft: 40, paddingRight: 12, fontSize: 14, fontWeight: '800', color: stylesTokens.text, textAlign: 'right' },
  modalLoading: { paddingVertical: 24, alignItems: 'center' },
  userRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(17, 24, 39, 0.06)',
    backgroundColor: 'rgba(17, 24, 39, 0.03)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 10,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  userRowHover: { backgroundColor: 'rgba(17, 24, 39, 0.05)' },
  userRowActive: { backgroundColor: 'rgba(22,45,156,0.06)', borderColor: 'rgba(22,45,156,0.18)' },
  userRowText: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  userName: { width: '100%', fontSize: 13, fontWeight: '900', color: stylesTokens.text, textAlign: 'right' },
  userEmail: { width: '100%', marginTop: 2, fontSize: 12, fontWeight: '700', color: stylesTokens.textMuted, textAlign: 'right' },
  modalEmpty: { paddingVertical: 20, alignItems: 'center' },
  emptyText: { fontSize: 13, fontWeight: '800', color: stylesTokens.textMuted, textAlign: 'center' },

  dateModalCard: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    padding: 16,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 20px 60px rgba(0,0,0,0.18)' } as any) : null),
  },
  dateModalHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  dateHeaderSide: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  dateModalTitle: { width: '100%', flex: 1, fontSize: 16, fontWeight: '900', color: stylesTokens.text, textAlign: 'center' },

  weekRow: {
    marginTop: 14,
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  weekDay: { width: '14.2857%', textAlign: 'center', fontSize: 11, fontWeight: '900', color: stylesTokens.textMuted },

  calendarGrid: {
    marginTop: 10,
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.2857%',
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  dayCellHover: { backgroundColor: 'rgba(17, 24, 39, 0.04)' },
  dayCellOutside: { opacity: 0.55 },
  dayCellDisabled: { opacity: 0.35 },
  dayCellToday: { borderWidth: 1, borderColor: 'rgba(22,45,156,0.35)' },
  dayCellSelected: { backgroundColor: stylesTokens.primary, borderWidth: 1, borderColor: stylesTokens.primary },
  dayText: { fontSize: 13, fontWeight: '900', color: stylesTokens.text, textAlign: 'center' },
  dayTextOutside: { color: stylesTokens.textMuted },
  dayTextDisabled: { color: stylesTokens.textMuted },
  dayTextSelected: { color: stylesTokens.white },

  dateModalFooter: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(17, 24, 39, 0.06)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  todayBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(22,45,156,0.06)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  todayBtnHover: { backgroundColor: 'rgba(22,45,156,0.10)' },
  todayBtnText: { fontSize: 12, fontWeight: '900', color: stylesTokens.primary, textAlign: 'right' },

  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(17, 24, 39, 0.04)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  clearBtnHover: { backgroundColor: 'rgba(17, 24, 39, 0.07)' },
  clearBtnText: { fontSize: 12, fontWeight: '900', color: stylesTokens.textMuted, textAlign: 'right' },
});

