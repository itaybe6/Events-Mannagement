import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import AdminWebPageHeader from '@/components/desktop/AdminWebPageHeader';

const EVENT_TYPES = [
  { label: 'חתונה', value: 'חתונה', icon: 'heart' as const, hint: 'יום מיוחד לזוג' },
  { label: 'חינה', value: 'חינה', icon: 'color-palette' as const, hint: 'חגיגה מסורתית' },
  { label: 'בר מצווה', value: 'בר מצווה', icon: 'ribbon' as const, hint: 'אירוע משפחתי' },
  { label: 'בת מצווה', value: 'בת מצווה', icon: 'sparkles' as const, hint: 'חגיגה מרגשת' },
  { label: 'ברית', value: 'ברית', icon: 'star' as const, hint: 'מסורת וחיבור' },
  { label: 'אירוע חברה', value: 'אירוע חברה', icon: 'briefcase' as const, hint: 'עסקים ונטוורקינג' },
] as const;

type CoupleOption = { id: string; name: string; email: string };
type LocationPrediction = {
  placeId: string;
  primaryText: string;
  secondaryText: string;
  description: string;
};

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

declare global {
  interface Window {
    google?: any;
    __googleMapsPlacesPromise?: Promise<any>;
  }
}

function extractCityFromAddressComponents(addressComponents?: any[], fallbackText = '') {
  const parts = Array.isArray(addressComponents) ? addressComponents : [];
  const locality =
    parts.find((part) => Array.isArray(part?.types) && part.types.includes('locality'))?.long_name ||
    parts.find((part) => Array.isArray(part?.types) && part.types.includes('administrative_area_level_2'))?.long_name ||
    parts.find((part) => Array.isArray(part?.types) && part.types.includes('administrative_area_level_1'))?.long_name ||
    '';
  if (locality) return String(locality).trim();
  const fallbackParts = String(fallbackText || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return fallbackParts.at(-2) || fallbackParts.at(-1) || '';
}

function loadGoogleMapsPlacesLibrary() {
  if (Platform.OS !== 'web') {
    return Promise.reject(new Error('Google Places autocomplete is available only on web.'));
  }
  if (!GOOGLE_MAPS_API_KEY) {
    return Promise.reject(new Error('Missing EXPO_PUBLIC_GOOGLE_MAPS_API_KEY environment variable.'));
  }
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Window is not available yet.'));
  }
  if (window.google?.maps?.places) {
    return Promise.resolve(window.google);
  }
  if (window.__googleMapsPlacesPromise) {
    return window.__googleMapsPlacesPromise;
  }

  window.__googleMapsPlacesPromise = new Promise((resolve, reject) => {
    const scriptId = 'google-maps-places-script';
    const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;

    const finishLoad = () => {
      if (window.google?.maps?.places) {
        resolve(window.google);
        return;
      }
      window.__googleMapsPlacesPromise = undefined;
      reject(new Error('Google Maps script loaded, but Places library is unavailable.'));
    };

    const failLoad = () => {
      window.__googleMapsPlacesPromise = undefined;
      reject(new Error('Failed to load Google Maps Places library.'));
    };

    if (existingScript) {
      existingScript.addEventListener('load', finishLoad, { once: true });
      existingScript.addEventListener('error', failLoad, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = scriptId;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      GOOGLE_MAPS_API_KEY
    )}&libraries=places&language=he&region=IL`;
    script.addEventListener('load', finishLoad, { once: true });
    script.addEventListener('error', failLoad, { once: true });
    document.head.appendChild(script);
  });

  return window.__googleMapsPlacesPromise;
}

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
  const [placesReady, setPlacesReady] = useState(Platform.OS !== 'web');
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesError, setPlacesError] = useState('');
  const [locationPredictions, setLocationPredictions] = useState<LocationPrediction[]>([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const autocompleteServiceRef = useRef<any>(null);
  const placesServiceRef = useRef<any>(null);
  const locationBlurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const predictionRequestRef = useRef(0);

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

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    let isCancelled = false;
    void loadGoogleMapsPlacesLibrary()
      .then((googleMaps) => {
        if (isCancelled) return;
        autocompleteServiceRef.current = new googleMaps.maps.places.AutocompleteService();
        placesServiceRef.current = new googleMaps.maps.places.PlacesService(document.createElement('div'));
        setPlacesReady(true);
        setPlacesError('');
      })
      .catch((error: any) => {
        if (isCancelled) return;
        console.error('Google Places load error:', error);
        setPlacesReady(false);
        setPlacesError('לא ניתן לטעון את חיפוש המיקומים כרגע.');
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    return () => {
      if (locationBlurTimeoutRef.current) {
        clearTimeout(locationBlurTimeoutRef.current);
      }
    };
  }, []);

  const formatDate = (dateString: string) =>
    dateString ? new Date(dateString).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';

  const isWedding = form.eventType === 'חתונה';
  const isFormValid = Boolean(form.user_id && form.eventType && form.eventName.trim() && form.date);

  const completion = useMemo(() => {
    const parts = [
      Boolean(form.user_id),
      Boolean(form.eventType),
      Boolean(form.date && form.eventName.trim()),
      Boolean(isFormValid),
    ];
    const done = parts.filter(Boolean).length;
    return Math.round((done / parts.length) * 100);
  }, [form.date, form.eventName, form.eventType, form.user_id, isFormValid]);

  const currentStep = useMemo(() => {
    if (!form.user_id) return 1;
    if (!form.eventType) return 2;
    if (!isFormValid) return 3;
    return 4;
  }, [form.eventType, form.user_id, isFormValid]);

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

  const selectedTypeMeta = EVENT_TYPES.find((item) => item.value === form.eventType) ?? null;
  const shouldShowLocationSuggestions =
    Platform.OS === 'web' && showLocationSuggestions && (placesLoading || locationPredictions.length > 0);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const query = form.location.trim();
    if (!query || query.length < 2) {
      setPlacesLoading(false);
      setLocationPredictions([]);
      return;
    }
    if (!placesReady || !autocompleteServiceRef.current || !window.google?.maps?.places) {
      return;
    }

    setPlacesLoading(true);
    const requestId = predictionRequestRef.current + 1;
    predictionRequestRef.current = requestId;

    const timeoutId = setTimeout(() => {
      autocompleteServiceRef.current.getPlacePredictions(
        {
          input: query,
          componentRestrictions: { country: 'il' },
        },
        (predictions: any[] | null, status: any) => {
          if (predictionRequestRef.current !== requestId) return;

          const placesStatus = window.google?.maps?.places?.PlacesServiceStatus;
          if (status === placesStatus?.OK && Array.isArray(predictions)) {
            setLocationPredictions(
              predictions.map((prediction) => ({
                placeId: String(prediction.place_id ?? ''),
                primaryText: String(prediction.structured_formatting?.main_text ?? prediction.description ?? '').trim(),
                secondaryText: String(prediction.structured_formatting?.secondary_text ?? '').trim(),
                description: String(prediction.description ?? '').trim(),
              }))
            );
          } else {
            setLocationPredictions([]);
          }
          setPlacesLoading(false);
        }
      );
    }, 320);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [form.location, placesReady]);

  const handleLocationFocus = () => {
    if (locationBlurTimeoutRef.current) {
      clearTimeout(locationBlurTimeoutRef.current);
      locationBlurTimeoutRef.current = null;
    }
    setFocusedField('location');
    setShowLocationSuggestions(true);
  };

  const handleLocationBlur = () => {
    setFocusedField(null);
    locationBlurTimeoutRef.current = setTimeout(() => {
      setShowLocationSuggestions(false);
    }, 180);
  };

  const handleLocationChange = (value: string) => {
    setForm((f) => ({ ...f, location: value }));
    setShowLocationSuggestions(true);
  };

  const handleLocationPredictionPress = (prediction: LocationPrediction) => {
    if (locationBlurTimeoutRef.current) {
      clearTimeout(locationBlurTimeoutRef.current);
      locationBlurTimeoutRef.current = null;
    }

    if (!placesServiceRef.current || !window.google?.maps?.places) {
      setForm((f) => ({ ...f, location: prediction.primaryText || prediction.description }));
      setShowLocationSuggestions(false);
      setLocationPredictions([]);
      return;
    }

    setPlacesLoading(true);
    placesServiceRef.current.getDetails(
      {
        placeId: prediction.placeId,
        fields: ['name', 'formatted_address', 'address_components'],
      },
      (place: any, status: any) => {
        const placesStatus = window.google?.maps?.places?.PlacesServiceStatus;
        const formattedAddress = String(place?.formatted_address ?? prediction.description ?? '').trim();
        const locationValue = String(place?.name ?? '').trim() || formattedAddress || prediction.primaryText || prediction.description;
        const nextCity = extractCityFromAddressComponents(place?.address_components, prediction.secondaryText || formattedAddress);

        if (status === placesStatus?.OK || !status) {
          setForm((f) => ({
            ...f,
            location: locationValue,
            city: nextCity || f.city,
          }));
        } else {
          setForm((f) => ({
            ...f,
            location: prediction.primaryText || prediction.description,
            city: f.city || extractCityFromAddressComponents(undefined, prediction.secondaryText),
          }));
        }

        setPlacesLoading(false);
        setShowLocationSuggestions(false);
        setLocationPredictions([]);
      }
    );
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
            <View style={styles.heroShell}>
              <AdminWebPageHeader
                eyebrow="ניהול אירועים"
                title="הוספת אירוע"
                subtitle="יצירת אירוע חדש במערכת בצורה מסודרת, מהירה ונקייה לפי שלבי העבודה."
                showNav={false}
                useDefaultActions={false}
                leading={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="חזרה לעמוד הקודם"
                    onPress={() => router.replace('/(admin)/admin-events-list')}
                    style={({ hovered, pressed }: any) => [
                      styles.backHeaderBtn,
                      Platform.OS === 'web' && hovered ? styles.backHeaderBtnHover : null,
                      pressed ? styles.backHeaderBtnPressed : null,
                    ]}
                  >
                    <Ionicons name="arrow-forward" size={16} color={stylesTokens.text} />
                    <Text style={styles.backHeaderBtnText}>חזרה</Text>
                  </Pressable>
                }
              />

              <View style={styles.heroCard}>
                <View style={styles.heroCardTopRow}>
                  <View style={styles.heroTitleWrap}>
                    <Text style={styles.heroEyebrow}>אירוע חדש במערכת</Text>
                    <Text style={styles.heroTitle}>בונים אירוע חדש ב-4 שלבים פשוטים</Text>
                    <Text style={styles.heroSubtitle}>בחירת לקוח, סוג אירוע ופרטים כלליים במעטפת אחת ברורה ונקייה.</Text>
                  </View>

                  <View style={styles.heroPill}>
                    <Text style={styles.heroPillValue}>{completion}%</Text>
                    <Text style={styles.heroPillLabel}>הושלם</Text>
                  </View>
                </View>

                <View style={styles.progressWrap}>
                  <View style={styles.progressRow}>
                    <Text style={styles.progressMeta}>{`שלב ${currentStep} מתוך 4`}</Text>
                    <Text style={styles.progressMeta}>{isFormValid ? 'מוכן ליצירה' : 'בטיוטה'}</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${completion}%` } as any]} />
                  </View>
                </View>

                <View style={styles.heroStatsRow}>
                  <View style={styles.heroStatCard}>
                    <Text style={styles.heroStatLabel}>לקוח</Text>
                    <Text style={styles.heroStatValue} numberOfLines={1}>
                      {selectedUser ? selectedUser.name : 'טרם נבחר'}
                    </Text>
                  </View>
                  <View style={styles.heroStatCard}>
                    <Text style={styles.heroStatLabel}>סוג אירוע</Text>
                    <Text style={styles.heroStatValue} numberOfLines={1}>
                      {selectedTypeMeta?.label ?? 'טרם נבחר'}
                    </Text>
                  </View>
                  <View style={styles.heroStatCard}>
                    <Text style={styles.heroStatLabel}>תאריך</Text>
                    <Text style={styles.heroStatValue} numberOfLines={1}>
                      {form.date ? formatDate(form.date) : 'טרם נבחר'}
                    </Text>
                  </View>
                </View>
              </View>

            </View>

            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>1</Text>
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

            <View style={styles.divider} />

            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>2</Text>
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
                  <Text style={styles.badgeText}>3</Text>
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
                  <Ionicons name="chevron-down" size={16} color={stylesTokens.textMuted} />
                  <Text style={[styles.dateText, !form.date ? styles.dateTextPlaceholder : null]} numberOfLines={1}>
                    {form.date ? formatDate(form.date) : 'בחר תאריך לאירוע'}
                  </Text>
                  <View style={styles.inputIcon}>
                    <Ionicons name="calendar-outline" size={18} color={stylesTokens.textMuted} />
                  </View>
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
                    <View style={[styles.inputWrap, shouldShowLocationSuggestions ? styles.inputWrapRaised : null]}>
                      <Ionicons name="location-outline" size={18} color={stylesTokens.textMuted} style={styles.inputLeadingIcon} />
                      <TextInput
                        value={form.location}
                        onChangeText={handleLocationChange}
                        placeholder="חפש אולם או כתובת..."
                        placeholderTextColor={stylesTokens.placeholder}
                        style={[styles.input, focusedField === 'location' ? styles.inputFocused : null]}
                        textAlign="right"
                        onFocus={handleLocationFocus}
                        onBlur={handleLocationBlur}
                        autoComplete="street-address"
                      />
                      {shouldShowLocationSuggestions ? (
                        <View style={styles.locationSuggestionsCard}>
                          {placesLoading ? (
                            <View style={styles.locationSuggestionsLoading}>
                              <ActivityIndicator size="small" color={stylesTokens.primary} />
                              <Text style={styles.locationSuggestionsHint}>מחפש מיקומים ב-Google...</Text>
                            </View>
                          ) : (
                            locationPredictions.map((prediction) => (
                              <Pressable
                                key={prediction.placeId}
                                accessibilityRole="button"
                                accessibilityLabel={`בחירת מיקום ${prediction.description}`}
                                onPress={() => handleLocationPredictionPress(prediction)}
                                style={({ hovered, pressed }: any) => [
                                  styles.locationSuggestionRow,
                                  Platform.OS === 'web' && hovered ? styles.locationSuggestionRowHover : null,
                                  pressed ? { opacity: 0.92 } : null,
                                ]}
                              >
                                <View style={styles.locationSuggestionText}>
                                  <Text style={styles.locationSuggestionTitle} numberOfLines={1}>
                                    {prediction.primaryText}
                                  </Text>
                                  <Text style={styles.locationSuggestionSubtitle} numberOfLines={2}>
                                    {prediction.secondaryText || prediction.description}
                                  </Text>
                                </View>
                                <View style={styles.locationSuggestionIcon}>
                                  <Ionicons name="business-outline" size={16} color={stylesTokens.primary} />
                                </View>
                              </Pressable>
                            ))
                          )}
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.miniHint}>
                      {placesError || 'הקלידו שם אולם, עסק או כתובת מלאה כדי לבחור מיקום מתוך Google.'}
                    </Text>
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
                  <Text style={styles.badgeText}>4</Text>
                </View>
                <Text style={styles.sectionTitle}>סיכום האירוע</Text>
              </View>

              <View style={styles.summaryInlineCard}>
                <View style={styles.summaryInlineHeader}>
                  <View style={styles.summaryInlineTitleWrap}>
                    <Text style={styles.summaryInlineEyebrow}>סיכום חכם</Text>
                    <Text style={styles.summaryInlineTitle}>סיכום האירוע</Text>
                    <Text style={styles.summaryInlineSubtitle}>כל הפרטים שבחרת מרוכזים כאן לפני היצירה.</Text>
                  </View>

                  <View style={[styles.statusChipInline, isFormValid ? styles.statusChipInlineReady : null]}>
                    <Text style={[styles.statusChipInlineText, isFormValid ? styles.statusChipInlineTextReady : null]}>
                      {isFormValid ? 'מוכן לשמירה' : 'טיוטה חדשה'}
                    </Text>
                  </View>
                </View>

                <View style={styles.summaryInlineGrid}>
                  <View style={styles.summaryInlineItem}>
                    <View style={styles.summaryInlineIconCircle}>
                      <Ionicons name="pricetag-outline" size={18} color={stylesTokens.primary} />
                    </View>
                    <View style={styles.summaryInlineText}>
                      <Text style={styles.summaryInlineLabel}>סוג אירוע</Text>
                      <Text style={styles.summaryInlineValue}>{form.eventType || 'טרם נבחר'}</Text>
                    </View>
                  </View>

                  <View style={styles.summaryInlineItem}>
                    <View style={styles.summaryInlineIconCircle}>
                      <Ionicons name="text-outline" size={18} color={stylesTokens.primary} />
                    </View>
                    <View style={styles.summaryInlineText}>
                      <Text style={styles.summaryInlineLabel}>שם האירוע</Text>
                      <Text style={styles.summaryInlineValue}>{form.eventName.trim() ? form.eventName.trim() : 'טרם נבחר'}</Text>
                    </View>
                  </View>

                  <View style={styles.summaryInlineItem}>
                    <View style={styles.summaryInlineIconCircle}>
                      <Ionicons name="calendar-outline" size={18} color={stylesTokens.primary} />
                    </View>
                    <View style={styles.summaryInlineText}>
                      <Text style={styles.summaryInlineLabel}>תאריך</Text>
                      <Text style={styles.summaryInlineValue}>{form.date ? formatDate(form.date) : 'טרם נבחר'}</Text>
                    </View>
                  </View>

                  <View style={styles.summaryInlineItem}>
                    <View style={styles.summaryInlineIconCircle}>
                      <Ionicons name="pin-outline" size={18} color={stylesTokens.primary} />
                    </View>
                    <View style={styles.summaryInlineText}>
                      <Text style={styles.summaryInlineLabel}>מיקום</Text>
                      <Text style={[styles.summaryInlineValue, !form.location.trim() ? styles.summaryInlineValueMuted : null]} numberOfLines={2}>
                        {form.location.trim() ? `${form.location.trim()}${form.city.trim() ? `, ${form.city.trim()}` : ''}` : 'לא צוין מיקום'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.summaryInlineItem}>
                    <View style={[styles.summaryInlineIconCircle, styles.summaryInlineIconCircleMuted]}>
                      <Ionicons name="person-outline" size={18} color={stylesTokens.primary} />
                    </View>
                    <View style={styles.summaryInlineText}>
                      <Text style={styles.summaryInlineLabel}>לקוח</Text>
                      <Text style={styles.summaryInlineValue}>{selectedUser ? selectedUser.name : '—'}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.summaryInlineFooter}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="צור אירוע"
                    disabled={!isFormValid || saving}
                    onPress={() => void handleAddEvent()}
                    style={({ hovered, pressed }: any) => [
                      styles.summaryInlineCTA,
                      !isFormValid || saving ? { opacity: 0.55 } : null,
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
          </ScrollView>

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

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="הוספת משתמש חדש"
              onPress={() => {
                setUserModalOpen(false);
                router.push({
                  pathname: '/(admin)/add-user-v2',
                  params: { returnTo: 'admin-events-create' },
                });
              }}
              style={({ hovered, pressed }: any) => [
                styles.addUserInlineBtn,
                Platform.OS === 'web' && hovered ? styles.addUserInlineBtnHover : null,
                pressed ? { opacity: 0.92 } : null,
              ]}
            >
              <Ionicons name="person-add-outline" size={18} color={stylesTokens.primary} />
              <Text style={styles.addUserInlineBtnText}>הוספת משתמש חדש למערכת</Text>
            </Pressable>

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
  bgLight: '#F4F7FB',
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
    backgroundColor: '#F7FAFF',
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage:
            'radial-gradient(circle at top right, rgba(25,93,230,0.14), rgba(25,93,230,0) 40%), radial-gradient(circle at top left, rgba(232,241,255,0.95), rgba(232,241,255,0) 34%), radial-gradient(circle at bottom left, rgba(242,224,186,0.34), rgba(242,224,186,0) 32%), radial-gradient(circle at bottom center, rgba(240,203,70,0.12), rgba(240,203,70,0) 26%)',
        } as any)
      : null),
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

  heroShell: { gap: 18 },
  backHeaderBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  backHeaderBtnHover: {
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 8px 18px rgba(11,28,65,0.06)' } as any) : null),
  },
  backHeaderBtnPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  backHeaderBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: stylesTokens.text,
    textAlign: 'right',
  },
  heroCard: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(25,93,230,0.08)',
    padding: 24,
    gap: 20,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 12px 30px rgba(11,28,65,0.05)',
          backgroundImage: 'linear-gradient(135deg, rgba(248,250,253,0.98), rgba(247,250,255,0.98) 55%, rgba(255,250,240,0.95))',
        } as any)
      : {
          shadowColor: '#0B1C41',
          shadowOpacity: 0.06,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 10 },
        }),
  },
  heroCardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
  },
  heroTitleWrap: {
    flex: 1,
    minWidth: 280,
    alignItems: 'stretch',
    gap: 6,
  },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: '#195DE6',
    textAlign: 'right',
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: stylesTokens.text,
    textAlign: 'right',
  },
  heroSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: stylesTokens.textMuted,
    textAlign: 'right',
    lineHeight: 20,
  },
  heroPill: {
    minWidth: 112,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: '#EEF4FF',
    borderWidth: 1,
    borderColor: 'rgba(25,93,230,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPillValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#195DE6',
    textAlign: 'center',
  },
  heroPillLabel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    color: stylesTokens.textMuted,
    textAlign: 'center',
  },

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
  heroStatsRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  heroStatCard: {
    flexGrow: 1,
    flexBasis: 220,
    minWidth: 200,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: '#F8FBFF',
    borderWidth: 1,
    borderColor: 'rgba(25,93,230,0.08)',
    gap: 6,
  },
  heroStatLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: stylesTokens.textMuted,
    textAlign: 'right',
  },
  heroStatValue: {
    fontSize: 15,
    fontWeight: '900',
    color: stylesTokens.text,
    textAlign: 'right',
  },
  summaryInlineCard: {
    backgroundColor: '#FCFDFF',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(25,93,230,0.08)',
    gap: 18,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 8px 24px rgba(11,28,65,0.05)',
          backgroundImage: 'linear-gradient(180deg, rgba(247,250,255,0.95), rgba(255,255,255,0.98))',
        } as any)
      : null),
  },
  summaryInlineHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
    flexWrap: 'wrap',
  },
  summaryInlineTitleWrap: {
    flex: 1,
    minWidth: 260,
    gap: 4,
    alignItems: 'stretch',
  },
  summaryInlineEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: stylesTokens.primary,
    textAlign: 'right',
  },
  summaryInlineTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: stylesTokens.text,
    textAlign: 'right',
  },
  summaryInlineSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: stylesTokens.textMuted,
    textAlign: 'right',
  },
  statusChipInline: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#F3F6FB',
    borderWidth: 1,
    borderColor: 'rgba(17, 24, 39, 0.08)',
  },
  statusChipInlineReady: {
    backgroundColor: '#EEF4FF',
    borderColor: 'rgba(22,45,156,0.16)',
  },
  statusChipInlineText: {
    fontSize: 11,
    fontWeight: '900',
    color: stylesTokens.textMuted,
    textAlign: 'center',
  },
  statusChipInlineTextReady: {
    color: stylesTokens.primary,
  },
  summaryInlineGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  summaryInlineItem: {
    flexGrow: 1,
    flexBasis: 220,
    minWidth: 220,
    borderRadius: 18,
    padding: 16,
    backgroundColor: '#F8FBFF',
    borderWidth: 1,
    borderColor: 'rgba(25,93,230,0.08)',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  summaryInlineIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#EAF1FF',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  summaryInlineIconCircleMuted: {
    backgroundColor: '#F3F6FB',
  },
  summaryInlineText: {
    flex: 1,
    minWidth: 0,
    alignItems: 'stretch',
  },
  summaryInlineLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: stylesTokens.textMuted,
    textAlign: 'right',
  },
  summaryInlineValue: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '900',
    color: stylesTokens.text,
    textAlign: 'right',
  },
  summaryInlineValueMuted: {
    color: stylesTokens.textMuted,
    fontWeight: '700',
  },
  summaryInlineFooter: {
    alignItems: 'flex-end',
  },
  summaryInlineCTA: {
    minWidth: 220,
    height: 52,
    borderRadius: 18,
    backgroundColor: stylesTokens.primary,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', boxShadow: '0 12px 24px rgba(22,45,156,0.20)' } as any) : null),
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
    backgroundColor: '#FFFFFF',
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
    borderColor: 'rgba(25,93,230,0.04)',
    backgroundColor: '#FCFDFF',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)', cursor: 'pointer' } as any)
      : null),
  },
  typeCardDesktop: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  typeCardHover: {
    borderColor: 'rgba(25,93,230,0.12)',
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
    backgroundColor: '#EAF1FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeIconActive: { backgroundColor: '#DCE8FF' },
  typeText: { marginTop: 12, gap: 4 },
  typeTitle: { fontSize: 16, fontWeight: '900', color: stylesTokens.text, textAlign: 'right' },
  typeHint: { fontSize: 12, fontWeight: '600', color: stylesTokens.textMuted, textAlign: 'right', lineHeight: 17 },
  typeCheck: { position: 'absolute', top: 14, left: 14 },

  divider: { height: 1, backgroundColor: stylesTokens.border, marginVertical: 8 },

  card: {
    backgroundColor: '#FCFDFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(25,93,230,0.08)',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)' } as any) : null),
  },

  fieldLabel: { fontSize: 12, fontWeight: '800', color: '#374151', textAlign: 'right' },
  dateRow: {
    marginTop: 10,
    height: 48,
    borderRadius: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(25,93,230,0.10)',
    backgroundColor: '#F7FAFF',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  inputIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#EEF4FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateText: { flex: 1, fontSize: 14, fontWeight: '800', color: stylesTokens.text, textAlign: 'right' },
  dateTextPlaceholder: { color: stylesTokens.placeholder },

  formGrid: { marginTop: 14, flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 14 },
  formColFull: { width: '100%' },
  formColHalf: { flexGrow: 1, flexBasis: 260, minWidth: 220 },

  inputWrap: { position: 'relative', justifyContent: 'center' },
  inputWrapRaised: {
    zIndex: 20,
  },
  inputLeadingIcon: { position: 'absolute', right: 12, zIndex: 2 },
  input: {
    marginTop: 10,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#F7FAFF',
    borderWidth: 1,
    borderColor: 'rgba(25,93,230,0.10)',
    paddingHorizontal: 12,
    paddingRight: 40,
    fontSize: 14,
    fontWeight: '800',
    color: stylesTokens.text,
  },
  inputHover: { backgroundColor: '#F0F6FF' },
  inputFocused: {
    backgroundColor: stylesTokens.surface,
    borderColor: stylesTokens.primary,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 0 0 2px rgba(22,45,156,0.12)' } as any) : null),
  },
  locationSuggestionsCard: {
    marginTop: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(22,45,156,0.12)',
    backgroundColor: 'rgba(255,255,255,0.98)',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 14px 34px rgba(17,24,39,0.12)' } as any) : null),
  },
  locationSuggestionsLoading: {
    minHeight: 58,
    paddingHorizontal: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  locationSuggestionsHint: {
    fontSize: 12,
    fontWeight: '700',
    color: stylesTokens.textMuted,
    textAlign: 'right',
  },
  locationSuggestionRow: {
    minHeight: 62,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(17,24,39,0.06)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  locationSuggestionRowHover: {
    backgroundColor: 'rgba(22,45,156,0.04)',
  },
  locationSuggestionIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(22,45,156,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationSuggestionText: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
  },
  locationSuggestionTitle: {
    width: '100%',
    fontSize: 13,
    fontWeight: '900',
    color: stylesTokens.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  locationSuggestionSubtitle: {
    width: '100%',
    marginTop: 3,
    fontSize: 12,
    fontWeight: '600',
    color: stylesTokens.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 17,
  },

  selector: {
    marginTop: 10,
    height: 56,
    borderRadius: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(25,93,230,0.10)',
    backgroundColor: '#F7FAFF',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  selectorIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: '#EAF1FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectorText: { flex: 1, minWidth: 0, alignItems: 'stretch' },
  selectorTitle: {
    width: '100%',
    fontSize: 14,
    fontWeight: '900',
    color: stylesTokens.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  selectorSubtitle: {
    width: '100%',
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: stylesTokens.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  miniHint: { marginTop: 10, fontSize: 12, fontWeight: '600', color: stylesTokens.textMuted, textAlign: 'right', lineHeight: 17 },

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
  addUserInlineBtn: {
    marginTop: 12,
    height: 46,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(22,45,156,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(22,45,156,0.14)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  addUserInlineBtnHover: {
    backgroundColor: 'rgba(22,45,156,0.10)',
  },
  addUserInlineBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: stylesTokens.primary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
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

