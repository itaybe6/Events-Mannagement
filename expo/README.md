# Events Management App

אפליקציה מקיפה לניהול אירועים עם מערכת משתמשים ותפקידים.

## הגדרת Supabase

### 1. יצירת פרויקט Supabase
1. היכנס ל-[Supabase Dashboard](https://supabase.com/dashboard)
2. צור פרויקט חדש
3. המתן לאתחול הפרויקט

### 2. הגדרת טבלת המשתמשים
בעורך ה-SQL ב-Supabase, הרץ את הקוד מהקובץ `supabase/schema.sql`

### 2.1 העלאת תמונות משתמשים (אוואטרים)
הקובץ `supabase/schema.sql` מנסה ליצור Bucket ציבורי בשם `avatars` עבור תמונות משתמשים. אם זה לא נוצר אוטומטית, צור ידנית ב-Supabase Dashboard:
- **Storage → Buckets → New bucket**
- **Name**: `avatars`
- **Public bucket**: Enabled

### 3. הגדרת משתני סביבה
צור קובץ `.env` בשורש הפרויקט עם הנתונים הבאים:

```env
# Supabase Configuration
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_SUPABASE_SERVICE_KEY=your-service-role-key
```

**איפה למצוא את המפתחות:**
1. **URL ו-Anon Key**: Settings > API > Project URL & anon public key
2. **Service Role Key**: Settings > API > service_role secret key

### 4. הגדרת הרשאות (RLS)
ודא שב-Supabase Dashboard:
1. טבלת `users` מוגדרת עם Row Level Security
2. Policy מוגדר למשתמש Admin לגישה מלאה
3. Auth מופעל עם Email Authentication

## התקנה והרצה

```bash
# התקנת dependencies
npm install

# הרצת האפליקציה
npx expo start
```

## פתרון בעיות

### שגיאת "Network request failed"
1. בדוק שמשתני הסביבה מוגדרים נכון ב-`.env`
2. ודא שה-Service Role Key נכון (נדרש לניהול משתמשים)
3. בדוק שטבלת `users` קיימת בדאטאבייס
4. ודא שהרשאות RLS מוגדרות נכון

### אין גישה למשתמשים
1. ודא שמשתמש Admin מוגדר בטבלת `users`
2. בדוק שה-Service Role Key נכון
3. ודא שה-Auth API מופעל

### בדיקת חיבור
השתמש בכפתור "בדוק חיבור" בעמוד ניהול המשתמשים לאבחון בעיות.

## משתמשי דמו

```
Admin: admin / admin123
בעל אירוע: couple / couple123
```
