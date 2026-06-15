# Moon — Events Management

אפליקציה מקיפה לניהול אירועים (חתונות, בר/בת מצווה ועוד), עם מערכת תפקידים, ניהול אורחים, הושבה, הזמנות דיגיטליות, התראות SMS/WhatsApp וממשקי Web ו-Mobile.

**גרסה:** 1.0.5  
**שם האפליקציה:** Moon  
**Bundle ID (iOS):** `com.itaybenyair.moonapp`  
**Package (Android):** `com.moonevents.app`

---

## תוכן עניינים

1. [סקירה כללית](#סקירה-כללית)
2. [תפקידי משתמש ויכולות](#תפקידי-משתמש-ויכולות)
3. [מודולים עיקריים](#מודולים-עיקריים)
4. [טכנולוגיות](#טכנולוגיות)
5. [מבנה הפרויקט](#מבנה-הפרויקט)
6. [התקנה והרצה](#התקנה-והרצה)
7. [משתני סביבה](#משתני-סביבה)
8. [מסד נתונים (Supabase)](#מסד-נתונים-supabase)
9. [Edge Functions](#edge-functions)
10. [סקריפטים חיצוניים](#סקריפטים-חיצוניים)
11. [פריסה (Deployment)](#פריסה-deployment)
12. [פתרון בעיות נפוצות](#פתרון-בעיות-נפוצות)

---

## סקירה כללית

Moon היא פלטפורמה לניהול אירועים מקצה לקצה. המערכת תומכת בשלושה סוגי משתמשים, ממשק RTL מלא בעברית, ופועלת על:

- **iOS** (כולל iPad)
- **Android**
- **Web** (ממשק Desktop מותאם לכל תפקיד)

לאחר התחברות, המשתמש מופנה אוטומטית לפי סוג התפקיד:

| תפקיד | `user_type` | נתיב ברירת מחדל |
|--------|-------------|-----------------|
| מנהל מערכת | `admin` | `/(admin)/admin-events` |
| עובד/צוות | `employee` | `/(employee)/employee-events` |
| בעל/י אירוע (זוג) | `event_owner` | `/(couple)` |

משתמשים שלא מחוברים מופנים ל-`/onboarding`.

---

## תפקידי משתמש ויכולות

### בעל/י אירוע (`event_owner`)

- דשבורד בית עם סטטיסטיקות RSVP (מגיעים, ממתינים, לא מגיעים, אולי מגיע)
- ניהול רשימת אורחים וקטגוריות (צד חתן/כלה)
- ייבוא אורחים מאנשי קשר במכשיר
- עריכת פרופיל זוג, פרטי אירוע והזמנה דיגיטלית
- מפת הושבה אינטראקטивית (גרירה, שולחנות, הקצאת אורחים)
- עורך התראות אוטומטיות (SMS / WhatsApp)
- קישורי הזמנה אישיים לכל אורח (`/i/[token]`, `/w/[token]`)
- דף RSVP ציבורי ללא התחברות (`/invitation/[token]`)

### מנהל מערכת (`admin`)

- ניהול כל האירועים במערכת (יצירה, עריכה, אישור)
- ניהול משתמשים (הוספה, עריכה, מחיקה)
- גישה לאורחים, הושבה והודעות בכל האירועים
- Check-in אורחים ביום האירוע
- אישור RSVP ממתינים
- תבניות הושבה, קישורי הזמנה, עורך התראות
- חיפוש גלובלי באירועים ומשתמשים

### עובד/צוות (`employee`)

- צפייה באירועים שהוקצו לו
- Check-in אורחים
- צפייה במפת הושבה (readonly / operational)
- אישור RSVP
- פרופיל עובד

---

## מודולים עיקריים

| מודול | תיאור |
|--------|--------|
| **אירועים** | CRUD לאירועים, משימות, תקציב, פרטי חתן/כלה, אישור אירוע (`is_approved`) |
| **אורחים** | סטטוס RSVP, מספר מלווים, קטגוריות, ייצוא Excel |
| **הושבה** | שולחנות, מיקומים XY, מפת הושבה JSON, תבניות |
| **הזמנות** | קוד/טוקן ייחודי לכל אורח, דף הזמנה ציבורי, נעילת RSVP |
| **הודעות** | SMS ו-WhatsApp, היסטוריית שליחות, התראות מתוזמנות |
| **התראות** | הגדרות offset מתאריך האירוע, תזמון אוטומטי, inbox באפליקציה |
| **Check-in** | סימון הגעה, ספירת מגיעים בפועל |
| **אווטרים** | העלאת תמונות פרופיל ל-Supabase Storage |
| **מיקומים** | אינטגרציה עם Google Places (חיפוש כתובות) |

---

## טכנולוגיות

### Frontend

- **React Native** 0.81 + **Expo** 54
- **Expo Router** 6 (file-based routing)
- **TypeScript**
- **Zustand** — state management (משתמש, בחירת אירוע)
- **Tailwind CSS** — Web בלבד (`global.css`)
- **React Native Reanimated**, **Skia**, **Lottie** — אנימציות
- **Victory / react-native-chart-kit** — גרפים
- **@dnd-kit** — drag & drop במפת הושבה (Web)
- **xlsx** — ייצוא אקסל

### Backend

- **Supabase** — PostgreSQL, Auth, Storage, RLS, Edge Functions
- **Row Level Security (RLS)** — הרשאות לפי תפקיד ואירוע

### אינטגרציות

- Google Maps / Places API
- WhatsApp Business API (Edge Functions + סקריפטים Python)
- SMS (דרך Edge Functions)

---

## מבנה הפרויקט

```
Events-Mannagement/
├── expo/                          # קוד האפליקציה הראשי
│   ├── app/                       # Expo Router — מסכים וניווט
│   │   ├── (admin)/               # מסכי מנהל
│   │   ├── (couple)/              # מסכי בעל/י אירוע
│   │   ├── (employee)/            # מסכי עובד
│   │   ├── seating/               # מודול הושבה
│   │   ├── invitation/            # דף הזמנה ציבורי
│   │   ├── i/ , w/                # קישורי הזמנה קצרים
│   │   ├── login.tsx, signup.tsx, onboarding.tsx
│   │   └── _layout.tsx            # Root layout + auth guard
│   ├── components/                # קומפוננטות UI
│   │   ├── couple/                # דשבורד, הושבה, גרפים
│   │   ├── desktop/               # Shell ל-Web
│   │   └── animations/            # Tab bars מותאמים
│   ├── lib/
│   │   ├── services/              # שכבת API (Supabase)
│   │   └── supabase.ts            # Supabase client
│   ├── store/                     # Zustand stores
│   ├── types/                     # TypeScript types
│   ├── constants/                 # צבעים, mock data
│   ├── features/seating/          # לוגיקת מפת הושבה
│   ├── supabase/
│   │   ├── schema.sql             # סכמת DB ראשית
│   │   ├── migrations/            # מיגרציות SQL
│   │   └── functions/             # Edge Functions
│   ├── assets/                    # תמונות, אייקונים
│   ├── plugins/withForceRTL.js    # RTL ב-native
│   ├── app.config.js              # Expo config
│   ├── package.json
│   └── README.md                  # README קצר (Supabase setup)
├── scripts/                       # סקריפטים Python (WhatsApp)
├── dist/                          # Build output (legacy)
├── vercel.json                    # הגדרות פריסת Web
└── PROJECT.md                     # מסמך זה
```

### שירותים (`expo/lib/services/`)

| קובץ | תפקיד |
|------|--------|
| `authService.ts` | התחברות, הרשמה, session |
| `userService.ts` | CRUD משתמשים (Admin) |
| `eventService.ts` | CRUD אירועים ומשימות |
| `guestService.ts` | CRUD אורחים, RSVP |
| `tableService.ts` | שולחנות והושבה |
| `invitationService.ts` | קישורי הזמנה ציבוריים |
| `messageService.ts` | הודעות SMS/WhatsApp |
| `avatarService.ts` | העלאת אווטרים |
| `googlePlacesService.ts` | חיפוש מיקומים |
| `creditTerminalService.ts` | טרמינל אשראי |
| `invitationAssetService.ts` | נכסי הזמנה (תמונות) |

---

## התקנה והרצה

### דרישות מקדימות

- Node.js 18+
- npm
- חשבון Supabase עם פרויקט מוגדר
- (אופציונלי) Expo Go / Dev Client לבדיקה במובייל

### שלבים

```bash
cd expo
npm install
```

צור קובץ `expo/.env` (ראה [משתני סביבה](#משתני-סביבה)).

```bash
# פיתוח — Mobile (tunnel)
npm start

# פיתוח — Web
npm run start-web

# Build Web
npm run build

# Native builds
npm run android
npm run ios
```

### הגדרת Supabase

1. צור פרויקט ב-[Supabase Dashboard](https://supabase.com/dashboard)
2. הרץ את `expo/supabase/schema.sql` ב-SQL Editor
3. הרץ מיגרציות מתיקיית `expo/supabase/migrations/` לפי הסדר
4. ודא ש-Buckets קיימים: `avatars`, `event-images`
5. הפעל Email Authentication ב-Auth settings
6. הגדר RLS policies (כלולות ב-schema ובמיגרציות)

---

## משתני סביבה

קובץ: `expo/.env`

```env
# Supabase (חובה)
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_SUPABASE_SERVICE_KEY=your-service-role-key

# כתובת האתר (לקישורי הזמנה)
EXPO_PUBLIC_SITE_BASE_URL=https://your-domain.com

# Google Maps (חיפוש מיקומים)
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-key
```

**מיקום המפתחות ב-Supabase:** Settings → API

| משתנה | שימוש |
|--------|--------|
| `EXPO_PUBLIC_SUPABASE_URL` | כתובת הפרויקט |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Client-side (RLS) |
| `EXPO_PUBLIC_SUPABASE_SERVICE_KEY` | פעולות Admin (ניהול משתמשים) |
| `EXPO_PUBLIC_SITE_BASE_URL` | בסיס URL לקישורי RSVP/הזמנה |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | Places Autocomplete |

> **אזהרה:** אל תעלה קובץ `.env` ל-Git. המפתחות מוגדרים ב-`.gitignore`.

משתנים נוספים ל-Edge Functions (ב-Supabase Secrets):

- `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`
- `GOOGLE_MAPS_API_KEY`
- `SITE_BASE_URL`

---

## מסד נתונים (Supabase)

### טבלאות עיקריות

| טבלה | תיאור |
|------|--------|
| `users` | פרופיל משתמש, `user_type`, `event_id`, `avatar_url` |
| `events` | פרטי אירוע, חתן/כלה, הזמנה, `is_approved` |
| `guests` | אורחים, RSVP, שולחן, קטגוריה, check-in |
| `guest_categories` | קטגוריות לפי צד (groom/bride) |
| `tables` | שולחנות — קיבולת, צורה, מיקום |
| `seating_maps` | מפת הושבה (JSONB) |
| `tasks` | משימות לאירוע |
| `messages` | היסטוריית SMS/WhatsApp |
| `notification_settings` | הגדרות התראות מתוזמנות |
| `notifications` | Inbox באפליקציה |
| `scheduled_sms_*` | תזמון וריצות SMS (מיגרציות) |

### סטטוסי RSVP (אורח)

- `מגיע` — מאושר
- `לא מגיע` — דחה
- `ממתין` — טרם ענה
- `אולי מגיע` — תשובה חלקית

### Storage Buckets

- `avatars` — תמונות פרופיל (public read)
- `event-images` — תמונות הזמנה/אירוע

---

## Edge Functions

| Function | תיאור |
|----------|--------|
| `delete-event` | מחיקת אירוע וכל הנתונים הקשורים |
| `google-places` | Proxy ל-Google Places API |
| `send-invitation-sms` | שליחת SMS הזמנה |
| `send-checkin-table-sms` | SMS עם מספר שולחן ב-check-in |
| `process-scheduled-notification-sms` | Cron — שליחת התראות מתוזמנות |
| `register-credit-terminal` | רישום טרמינל אשראי |

---

## סקריפטים חיצוניים

תיקיית `scripts/` — כלי Python לשליחת WhatsApp (מחוץ לאפליקציה):

| סקריפט | תיאור |
|--------|--------|
| `send-whatsapp-template.py` | שליחת תבנית WhatsApp |
| `send_pending_whatsapp.py` | שליחה לאורחים ממתינים |
| `send_event_day_whatsapp.py` | הודעות יום האירוע |
| `prefix_invitation_codes.py` | עדכון קודי הזמנה |
| `prefix_pending_guests.py` | עדכון אורחים ממתינים |

```bash
pip install -r scripts/whatsapp-template-requirements.txt
cp scripts/.env.example scripts/.env
# ערוך .env והרץ את הסקריפט הרצוי
```

---

## פריסה (Deployment)

### Web (Vercel)

הפרויקט מוגדר ל-Vercel דרך `vercel.json`:

- **Install:** `cd expo && npm install`
- **Build:** `cd expo && npx expo export --platform web`
- **Output:** `expo/dist`
- **SPA rewrites** — כל הנתיבים מופנים ל-`index.html`

### Mobile (EAS)

- **Project ID:** `292e2bf1-e784-4c87-9375-36040694dec9`
- **Updates URL:** Expo OTA updates
- **Runtime version:** 1.0.5

---

## פתרון בעיות נפוצות

### "Network request failed" / אין חיבור ל-Supabase

1. ודא ש-`EXPO_PUBLIC_SUPABASE_URL` ו-`EXPO_PUBLIC_SUPABASE_ANON_KEY` נכונים ב-`.env`
2. הרץ מחדש עם ניקוי cache: `npx expo start --clear`
3. בדוק שטבלת `users` קיימת ו-RLS מוגדר

### אין גישה לניהול משתמשים (Admin)

1. ודא ש-`EXPO_PUBLIC_SUPABASE_SERVICE_KEY` מוגדר
2. בדוק שמשתמש Admin קיים בטבלת `users` עם `user_type = 'admin'`

### קישורי הזמנה לא עובדים

1. הגדר `EXPO_PUBLIC_SITE_BASE_URL` לדומיין הפרודקשן
2. ודא ש-RPC ציבורי להזמנות הופעל (מיגרציות `public_invitation_*`)

### RTL לא מוצג נכון ב-native

- RTL נאכף דרך `plugins/withForceRTL.js` ו-`I18nManager.forceRTL(true)` ב-`_layout.tsx`

---

## משתמשי דמו (פיתוח)

```
Admin:   admin / admin123
זוג:     couple / couple123
```

---

## רישיון

פרויקט פרטי (`"private": true` ב-package.json).
