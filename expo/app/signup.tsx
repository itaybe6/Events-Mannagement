import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  StatusBar,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { colors } from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useUserStore } from '@/store/userStore';
import { LavaLampBackground } from '@/components/LavaLampBackground';
import { supabase } from '@/lib/supabase';
import { userService } from '@/lib/services/userService';
import { eventService } from '@/lib/services/eventService';
import { authService } from '@/lib/services/authService';
import { googlePlacesService, type GooglePlacePrediction } from '@/lib/services/googlePlacesService';
import { ALIGN_LEFT, ALIGN_RIGHT, ROW_DIR, ROW_REVERSE_DIR } from '@/lib/rtl';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppKeyboardAwareScrollView } from '@/components/AppKeyboardAware';

const { height } = Dimensions.get('window');

const NAVY_DEEP = '#010c21';
const HERO_HEIGHT = Math.max(220, height * 0.32);

const EVENT_TYPES: { label: string; value: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: 'חתונה', value: 'חתונה', icon: 'heart' },
  { label: 'בר מצווה', value: 'בר מצווה', icon: 'ribbon' },
  { label: 'בת מצווה', value: 'בת מצווה', icon: 'sparkles' },
  { label: 'ברית', value: 'ברית', icon: 'star' },
  { label: 'אירוע חברה', value: 'אירוע חברה', icon: 'briefcase' },
];

type Step = 1 | 2;

export default function SignupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { login } = useUserStore();

  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Step 1: user details
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Step 2: event details
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState<string>('');
  const [location, setLocation] = useState('');
  const [city, setCity] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Google Places autocomplete for location
  const [locationSuggestions, setLocationSuggestions] = useState<GooglePlacePrediction[]>([]);
  const [locationSuggestionsVisible, setLocationSuggestionsVisible] = useState(false);
  const [locationSearchLoading, setLocationSearchLoading] = useState(false);
  const locationSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locationRequestIdRef = useRef(0);

  useEffect(() => {
    return () => {
      if (locationSearchTimeoutRef.current) clearTimeout(locationSearchTimeoutRef.current);
    };
  }, []);

  const goBackToLogin = () => router.replace('/login');

  const validateStep1 = (): string | null => {
    if (!name.trim()) return 'נא להזין שם מלא';
    if (!email.trim()) return 'נא להזין כתובת אימייל';
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    if (!emailOk) return 'כתובת האימייל לא תקינה';
    if (!password) return 'נא להזין סיסמה';
    if (password.length < 6) return 'הסיסמה חייבת להכיל לפחות 6 תווים';
    if (password !== confirmPassword) return 'הסיסמאות אינן תואמות';
    return null;
  };

  const validateStep2 = (): string | null => {
    if (!eventTitle.trim()) return 'נא לבחור סוג אירוע';
    if (!eventDate) return 'נא לבחור תאריך אירוע';
    if (!location.trim()) return 'נא להזין מיקום';
    if (!city.trim()) return 'נא להזין עיר';
    return null;
  };

  const handleNextFromStep1 = () => {
    const err = validateStep1();
    if (err) {
      setErrorMessage(err);
      return;
    }
    setErrorMessage(null);
    setStep(2);
  };

  const handleSubmit = async () => {
    const err = validateStep2();
    if (err) {
      setErrorMessage(err);
      return;
    }
    setErrorMessage(null);
    setLoading(true);
    try {
      // 1. Create user via admin API (email pre-confirmed so session works immediately).
      const createdUser = await userService.createUser(
        email.trim(),
        password,
        name.trim(),
        'event_owner',
        phone.trim() || undefined
      );

      // 2. Sign in with the same credentials to establish a session for RLS.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        throw new Error(signInError.message || 'כניסה למערכת נכשלה לאחר ההרשמה');
      }

      // 3. Create the event (unapproved by default) and link it to the new user.
      //    The INSERT can commit even when the RLS read-back (`.select().single()`)
      //    momentarily fails right after sign-in, which would otherwise surface as
      //    a false "registration failed" while the row actually exists. If event
      //    creation throws, recover by resolving the event the user now owns.
      let eventId: string | undefined;
      try {
        const createdEvent = await eventService.createEventForCurrentUser({
          title: eventTitle.trim(),
          date: new Date(eventDate),
          location: location.trim(),
          city: city.trim(),
          story: '',
          guests: 0,
          budget: 0,
        });
        eventId = createdEvent.id;
      } catch (eventError) {
        console.warn('Signup: event creation read-back failed, attempting recovery', eventError);
        eventId = (await authService.getPrimaryEventId(createdUser.id)) ?? undefined;
        // Only treat as a real failure if no event was actually created.
        if (!eventId) throw eventError;
      }

      // 4. Hydrate the user store so the couple tabs have the right context.
      login('event_owner', {
        id: createdUser.id,
        email: createdUser.email,
        name: createdUser.name,
        phone: createdUser.phone || undefined,
        avatar_url: createdUser.avatar_url || undefined,
        event_id: eventId,
        userType: 'event_owner',
      });

      router.replace('/(couple)');
    } catch (e: any) {
      console.error('Signup error:', e);
      const msg: string = (e?.message ?? '').toLowerCase();
      const code: string = String(e?.code ?? '').toLowerCase();
      const status = e?.status;
      const isDuplicate =
        code === 'email_exists' ||
        status === 422 ||
        (msg.includes('already') && msg.includes('registered')) ||
        msg.includes('already exists') ||
        msg.includes('duplicate') ||
        msg.includes('user already');
      if (isDuplicate) {
        setErrorMessage('כתובת האימייל כבר רשומה במערכת. נסה להתחבר במקום.');
      } else if (msg.includes('network request failed') || msg.includes('failed to fetch')) {
        setErrorMessage('אין תקשורת לשרת. בדוק את החיבור לאינטרנט ונסה שוב.');
      } else {
        setErrorMessage('אירעה שגיאה במהלך ההרשמה. נסה שוב.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (date?: Date) => {
    setShowDatePicker(false);
    if (date) setEventDate(date.toISOString().split('T')[0]);
  };

  const handleLocationChange = (value: string) => {
    setLocation(value);
    const query = value.trim();
    if (locationSearchTimeoutRef.current) clearTimeout(locationSearchTimeoutRef.current);
    if (query.length < 2) {
      setLocationSearchLoading(false);
      setLocationSuggestions([]);
      setLocationSuggestionsVisible(false);
      return;
    }
    setLocationSuggestionsVisible(true);
    setLocationSearchLoading(true);
    const nextRequestId = locationRequestIdRef.current + 1;
    locationRequestIdRef.current = nextRequestId;
    locationSearchTimeoutRef.current = setTimeout(async () => {
      try {
        const suggestions = await googlePlacesService.autocomplete(query);
        if (locationRequestIdRef.current !== nextRequestId) return;
        setLocationSuggestions(suggestions);
      } catch {
        if (locationRequestIdRef.current !== nextRequestId) return;
        setLocationSuggestions([]);
      } finally {
        if (locationRequestIdRef.current === nextRequestId) setLocationSearchLoading(false);
      }
    }, 350);
  };

  const handleLocationSuggestionPress = async (suggestion: GooglePlacePrediction) => {
    if (locationSearchTimeoutRef.current) clearTimeout(locationSearchTimeoutRef.current);
    locationRequestIdRef.current += 1;
    setLocationSuggestionsVisible(false);
    setLocationSuggestions([]);
    setLocation(suggestion.title || suggestion.description);
    Keyboard.dismiss();
    setLocationSearchLoading(true);
    try {
      const place = await googlePlacesService.getPlaceDetails(suggestion.placeId);
      const nextLocation = place.name || place.formattedAddress || suggestion.title || suggestion.description;
      setLocation(nextLocation);
      if (place.city) setCity(place.city);
    } catch {
      // swallow; user can type manually
    } finally {
      setLocationSearchLoading(false);
    }
  };

  const formatDate = (iso: string) =>
    iso ? new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

  const renderStep1 = () => (
    <View style={styles.form}>
      <View style={styles.field}>
        <View style={styles.fieldIconRight} pointerEvents="none">
          <Ionicons name="person-outline" size={20} color={colors.gray[500]} />
        </View>
        <TextInput
          style={styles.fieldInput}
          placeholder="שם מלא"
          placeholderTextColor={colors.gray[500]}
          value={name}
          onChangeText={(t) => {
            setName(t);
            if (errorMessage) setErrorMessage(null);
          }}
          autoCapitalize="words"
          textAlign="right"
        />
      </View>

      <View style={styles.field}>
        <View style={styles.fieldIconRight} pointerEvents="none">
          <Ionicons name="mail-outline" size={20} color={colors.gray[500]} />
        </View>
        <TextInput
          style={styles.fieldInput}
          placeholder="אימייל"
          placeholderTextColor={colors.gray[500]}
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            if (errorMessage) setErrorMessage(null);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textAlign="right"
        />
      </View>

      <View style={styles.field}>
        <View style={styles.fieldIconRight} pointerEvents="none">
          <Ionicons name="call-outline" size={20} color={colors.gray[500]} />
        </View>
        <TextInput
          style={styles.fieldInput}
          placeholder="טלפון (לא חובה)"
          placeholderTextColor={colors.gray[500]}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          textAlign="right"
        />
      </View>

      <View style={styles.field}>
        <View style={styles.fieldIconRight} pointerEvents="none">
          <Ionicons name="lock-closed-outline" size={20} color={colors.gray[500]} />
        </View>
        <TextInput
          style={[styles.fieldInput, { paddingLeft: 46 }]}
          placeholder="סיסמה (לפחות 6 תווים)"
          placeholderTextColor={colors.gray[500]}
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            if (errorMessage) setErrorMessage(null);
          }}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          textAlign="right"
        />
        <TouchableOpacity
          style={styles.fieldIconLeftButton}
          onPress={() => setShowPassword((v) => !v)}
          accessibilityLabel={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
        >
          <Ionicons
            name={showPassword ? 'eye-off-outline' : 'eye-outline'}
            size={20}
            color={colors.gray[500]}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.field}>
        <View style={styles.fieldIconRight} pointerEvents="none">
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.gray[500]} />
        </View>
        <TextInput
          style={[styles.fieldInput, { paddingLeft: 46 }]}
          placeholder="אימות סיסמה"
          placeholderTextColor={colors.gray[500]}
          value={confirmPassword}
          onChangeText={(t) => {
            setConfirmPassword(t);
            if (errorMessage) setErrorMessage(null);
          }}
          secureTextEntry={!showConfirmPassword}
          autoCapitalize="none"
          autoCorrect={false}
          textAlign="right"
        />
        <TouchableOpacity
          style={styles.fieldIconLeftButton}
          onPress={() => setShowConfirmPassword((v) => !v)}
          accessibilityLabel={showConfirmPassword ? 'הסתר אימות סיסמה' : 'הצג אימות סיסמה'}
        >
          <Ionicons
            name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
            size={20}
            color={colors.gray[500]}
          />
        </TouchableOpacity>
      </View>

      {errorMessage ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={handleNextFromStep1}
        activeOpacity={0.92}
      >
        <Text style={styles.primaryButtonText}>המשך לפרטי האירוע</Text>
        <Ionicons name="arrow-back" size={18} color={colors.white} style={{ marginLeft: 8 }} />
      </TouchableOpacity>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.form}>
      <Text style={styles.fieldGroupLabel}>סוג האירוע</Text>
      <View style={styles.eventTypesRow}>
        {EVENT_TYPES.map((t) => {
          const active = eventTitle === t.value;
          return (
            <TouchableOpacity
              key={t.value}
              style={[styles.typeChip, active && styles.typeChipActive]}
              onPress={() => {
                setEventTitle(t.value);
                if (errorMessage) setErrorMessage(null);
              }}
              activeOpacity={0.88}
            >
              <Ionicons
                name={t.icon}
                size={14}
                color={active ? colors.white : colors.primary}
                style={{ marginLeft: 6 }}
              />
              <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={styles.field}
        onPress={() => setShowDatePicker(true)}
        activeOpacity={0.88}
      >
        <View style={styles.fieldIconRight} pointerEvents="none">
          <Ionicons name="calendar-outline" size={20} color={colors.gray[500]} />
        </View>
        <View style={[styles.fieldInput, styles.fieldInputAsButton]}>
          <Text
            style={[
              styles.fieldInputText,
              { color: eventDate ? colors.text : colors.gray[500] },
            ]}
          >
            {eventDate ? formatDate(eventDate) : 'תאריך האירוע'}
          </Text>
        </View>
      </TouchableOpacity>

      <View style={styles.field}>
        <View style={styles.fieldIconRight} pointerEvents="none">
          <Ionicons name="business-outline" size={20} color={colors.gray[500]} />
        </View>
        <TextInput
          style={styles.fieldInput}
          placeholder="אולם / מיקום האירוע"
          placeholderTextColor={colors.gray[500]}
          value={location}
          onChangeText={handleLocationChange}
          textAlign="right"
          onFocus={() => {
            if (locationSuggestions.length > 0) setLocationSuggestionsVisible(true);
          }}
        />
        {locationSearchLoading ? (
          <View style={styles.fieldIconLeftButton} pointerEvents="none">
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : null}
      </View>

      {locationSuggestionsVisible && locationSuggestions.length > 0 ? (
        <View style={styles.suggestionsBox}>
          {locationSuggestions.slice(0, 5).map((s) => (
            <TouchableOpacity
              key={s.placeId}
              style={styles.suggestionItem}
              onPress={() => handleLocationSuggestionPress(s)}
              activeOpacity={0.82}
            >
              <Ionicons name="location-outline" size={16} color={colors.primary} style={{ marginLeft: 8 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.suggestionTitle} numberOfLines={1}>
                  {s.title || s.description}
                </Text>
                {s.subtitle ? (
                  <Text style={styles.suggestionSubtitle} numberOfLines={1}>
                    {s.subtitle}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <View style={styles.field}>
        <View style={styles.fieldIconRight} pointerEvents="none">
          <Ionicons name="map-outline" size={20} color={colors.gray[500]} />
        </View>
        <TextInput
          style={styles.fieldInput}
          placeholder="עיר"
          placeholderTextColor={colors.gray[500]}
          value={city}
          onChangeText={(t) => {
            setCity(t);
            if (errorMessage) setErrorMessage(null);
          }}
          textAlign="right"
        />
      </View>

      {errorMessage ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      <View style={styles.stepActionsRow}>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => {
            setErrorMessage(null);
            setStep(1);
          }}
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-forward" size={18} color={colors.primary} style={{ marginLeft: 6 }} />
          <Text style={styles.secondaryButtonText}>חזרה</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.primaryButton, styles.primaryButtonHalf, loading && styles.primaryButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.92}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Text style={styles.primaryButtonText}>סיים הרשמה</Text>
              <Ionicons name="checkmark" size={18} color={colors.white} style={{ marginLeft: 8 }} />
            </>
          )}
        </TouchableOpacity>
      </View>

      <DateTimePickerModal
        isVisible={showDatePicker}
        mode="date"
        display={Platform.OS === 'ios' ? 'inline' : 'default'}
        onConfirm={handleDateChange}
        onCancel={() => setShowDatePicker(false)}
        locale="he-IL"
        minimumDate={new Date()}
      />
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY_DEEP} />

      <AppKeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 18) },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
        enableResetScrollToCoords={false}
        extraHeight={120}
        extraScrollHeight={Platform.OS === 'ios' ? 140 : 160}
        keyboardOpeningTime={Platform.OS === 'ios' ? 0 : 100}
      >
        <View style={styles.hero}>
          <LavaLampBackground height={HERO_HEIGHT} />

          <View style={[styles.heroTopBar, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity
              onPress={goBackToLogin}
              accessibilityLabel="חזרה למסך התחברות"
              style={styles.backChip}
              activeOpacity={0.85}
            >
              <Ionicons name="arrow-forward" size={18} color={colors.white} />
              <Text style={styles.backChipText}>התחברות</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.heroCenter}>
            <Image
              source={require('../assets/images/logo-moon.png')}
              style={styles.heroLogo}
              resizeMode="contain"
              accessibilityLabel="לוגו"
            />
            <Text style={styles.heroTitle}>פתיחת חשבון חדש</Text>
            <Text style={styles.heroSubtitle}>
              {step === 1
                ? 'שלב 1 מתוך 2 — נעים להכיר, ספרו קצת על עצמכם'
                : 'שלב 2 מתוך 2 — פרטי האירוע שלכם'}
            </Text>

            <View style={styles.progressRow}>
              <View style={[styles.progressDot, styles.progressDotActive]} />
              <View style={[styles.progressDot, step === 2 && styles.progressDotActive]} />
            </View>
          </View>
        </View>

        <View style={styles.cardArea}>
          <View style={styles.card}>
            <View style={styles.stepHeader}>
              <Text style={styles.stepTitle}>
                {step === 1 ? 'פרטים אישיים' : 'פרטי האירוע'}
              </Text>
              <Text style={styles.stepHint}>
                {step === 1
                  ? 'פרטים אלה ישמשו אתכם להתחברות למערכת'
                  : 'האירוע יועבר לצוות MOON לאישור והם יחזרו אליכם בהקדם'}
              </Text>
            </View>

            {step === 1 ? renderStep1() : renderStep2()}
          </View>
        </View>
      </AppKeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  scrollView: {
    flex: 1,
    backgroundColor: colors.white,
  },
  scrollContent: {
    flexGrow: 1,
    minHeight: height,
    backgroundColor: colors.white,
  },
  hero: {
    height: HERO_HEIGHT,
    backgroundColor: NAVY_DEEP,
    overflow: 'hidden',
  },
  heroTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 18,
    zIndex: 5,
  },
  backChip: {
    alignSelf: ALIGN_LEFT,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    gap: 6,
  },
  backChipText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  heroCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 20,
    paddingHorizontal: 24,
  },
  heroLogo: {
    width: 160,
    height: 50,
    marginBottom: 10,
  },
  heroTitle: {
    color: colors.white,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 2,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
    maxWidth: 320,
  },
  progressRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    gap: 8,
  },
  progressDot: {
    width: 28,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  progressDotActive: {
    backgroundColor: colors.white,
  },

  cardArea: {
    backgroundColor: colors.white,
  },
  card: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: -28,
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 28,
  },
  stepHeader: {
    marginBottom: 14,
    alignItems: ALIGN_RIGHT,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: NAVY_DEEP,
    textAlign: 'right',
  },
  stepHint: {
    fontSize: 13,
    color: colors.gray[600],
    textAlign: 'right',
    marginTop: 4,
    lineHeight: 20,
  },

  form: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  field: {
    position: 'relative',
    backgroundColor: colors.gray[50],
    borderRadius: 18,
    marginBottom: 12,
    paddingRight: 46,
    paddingLeft: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  fieldIconRight: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldIconLeftButton: {
    position: 'absolute',
    left: 12,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  fieldInput: {
    height: 54,
    fontSize: 15,
    color: colors.text,
    paddingVertical: 14,
  },
  fieldInputAsButton: {
    justifyContent: 'center',
  },
  fieldInputText: {
    fontSize: 15,
    textAlign: 'right',
  },
  fieldGroupLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.gray[700] ?? '#374151',
    textAlign: 'right',
    marginBottom: 10,
    marginTop: 2,
  },
  eventTypesRow: {
    flexDirection: ROW_DIR,
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  typeChip: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.15)',
    backgroundColor: colors.white,
  },
  typeChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typeChipText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  typeChipTextActive: {
    color: colors.white,
  },

  suggestionsBox: {
    marginTop: -6,
    marginBottom: 12,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  suggestionItem: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  suggestionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  suggestionSubtitle: {
    fontSize: 12,
    color: colors.gray[600],
    textAlign: 'right',
    marginTop: 2,
  },

  errorBox: {
    backgroundColor: 'rgba(185, 28, 28, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(185, 28, 28, 0.20)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 2,
    marginBottom: 12,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
    lineHeight: 18,
  },

  stepActionsRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  primaryButton: {
    marginTop: 6,
    backgroundColor: colors.primary,
    borderRadius: 9999,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: ROW_REVERSE_DIR,
    paddingHorizontal: 18,
    shadowColor: colors.primary,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  primaryButtonHalf: {
    flex: 1,
    marginTop: 0,
  },
  primaryButtonDisabled: {
    backgroundColor: 'rgba(6,23,62,0.55)',
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    height: 54,
    paddingHorizontal: 18,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: ROW_REVERSE_DIR,
    backgroundColor: 'rgba(6,23,62,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.10)',
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
});
