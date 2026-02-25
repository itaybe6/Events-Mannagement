## שליחת SMS להזמנות (Pulseem + Supabase Edge Function)

הפרויקט שולח SMS למוזמנים דרך **Pulseem** באמצעות **Supabase Edge Function** בשם `send-invitation-sms`.

### מה צריך להכין ב־Pulseem
- **API Key**: זה הערך שנשלח בכותרת `X-Api-Key`.
  - ב־Pulseem Direct Send API (Swagger): `api.pulseem.com` → `Authorize` / API Key.
  - הערה: בחלק מהמימושים Pulseem מצפים לכותרת בשם `APIKey` (כמו שמוגדר ב‑Swagger). בקוד אנחנו שולחים את שתיהן.
- **From number / Sender (אופציונלי)**:
  - אם יש לך Sender מוגדר/מאושר (מספר או שם שולח), אפשר להעביר אותו כ־`fromNumber`.
  - אם אין לך ערך כזה או שאתה לא מוצא אותו — אפשר **להשמיט** והוא ישתמש בברירת־מחדל של החשבון (אם מוגדרת אצלך בפולסים).
  - בדרך כלל זה מופיע במסכים כמו “Sender”, “SMS Settings”, “Virtual Number”, “Header/From”.
  - אם לא קיים אצלך במסך, הכי מהיר: לשלוח לפולסים הודעה לתמיכה ולבקש “approved sender / fromNumber for API”.

### Secrets שיש להגדיר ב־Supabase
ב־Supabase Dashboard → **Edge Functions → Secrets** (או דרך CLI):

- `PULSEEM_API_KEY`: ה־API Key שלך (ל־`X-Api-Key`)
- `PULSEEM_FROM_NUMBER` (אופציונלי): הערך לשולח (`fromNumber`)
- `SITE_BASE_URL` (אופציונלי): הדומיין שממנו יוצרים לינק, למשל `https://your-site.com`
  - אם לא מגדירים, הלקוח (web) שולח `baseUrl` אוטומטית.

### פריסה של ה־Edge Function
יש 2 אפשרויות:

#### אפשרות A: Supabase CLI
1) ודא שיש לך Supabase CLI מחובר לפרויקט.
2) פרוס:

```bash
supabase functions deploy send-invitation-sms --no-verify-jwt
```

3) הגדר secrets:

```bash
supabase secrets set PULSEEM_API_KEY="..." SITE_BASE_URL="https://your-site.com"
```

#### אפשרות B: דרך Supabase Dashboard
1) Edge Functions → Create new function בשם `send-invitation-sms`.\n
2) הדבק את הקוד מהקובץ `supabase/functions/send-invitation-sms/index.ts`.\n
3) Settings של הפונקציה: כבה **Verify JWT**.\n
   - זה קריטי כדי ש־CORS preflight (OPTIONS) לא ייחסם בדפדפן.\n
   - אנחנו בודקים הרשאות בקוד עבור POST, אז זה עדיין בטוח.\n
4) הוסף Secrets לפי הרשימה למעלה.\n

### איך זה עובד באפליקציה
במסך `לינק להזמנה` (`app/(admin)/admin-invitation-links.tsx`) יש:\n
- בחירה יחידה/מרובה למוזמנים (כולל בחר-הכל לפי הסינון)\n
- שדה הודעה חופשית עם משתנים:\n
  - `{name}` – שם המוזמן\n
  - `{link}` – קישור אישי למוזמן (`/i/<code>`)\n
- כפתור “שלח SMS” שמזמן את `send-invitation-sms`.\n

### תיעוד שליחות
כל שליחה נרשמת בטבלת `messages` עם `type='SMS'` וסטטוס `נשלח/נכשל`.

