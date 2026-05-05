import { Alert, Linking, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Contacts from 'expo-contacts';

/**
 * עוזרי הרשאות שמציגים למשתמש הסבר ברור על מטרת הגישה
 * לפני שמערכת ההפעלה מציגה את הדיאלוג הרשמי, ובכך עומדים בדרישות App Store
 * (Apple Guideline 5.1.1) להסבר מפורט וספציפי על שימוש בנתונים.
 */

type EnsureResult = { granted: boolean; canAskAgain: boolean };

/**
 * Displays a "rationale" dialog explaining why we are about to ask for an OS
 * permission. As required by Apple App Store Guideline 5.1.1(iv), this dialog
 * only offers a single "Continue" action - it must NOT include a cancel
 * button. The user can still decline access via the official iOS / Android
 * system permission dialog that is shown immediately afterwards.
 */
const showRationale = (title: string, message: string): Promise<void> =>
  new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [{ text: 'המשך', style: 'default', onPress: () => resolve() }],
      { cancelable: false }
    );
  });

const showSettingsPrompt = (title: string, message: string) => {
  Alert.alert(
    title,
    message,
    [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'פתח הגדרות',
        style: 'default',
        onPress: () => {
          void Linking.openSettings();
        },
      },
    ],
    { cancelable: true }
  );
};

/**
 * מבקש הרשאת גישה לגלריה לאחר הצגת הסבר ברור על השימוש (תמונת פרופיל / הזמנה).
 * מחזיר granted=true רק אם המשתמש אישר גם את ההסבר וגם את הרשאת המערכת.
 */
export async function ensurePhotoLibraryPermission(options?: {
  purpose?: 'profile' | 'invitation' | 'generic';
}): Promise<EnsureResult> {
  if (Platform.OS === 'web') return { granted: true, canAskAgain: true };

  const purpose = options?.purpose ?? 'generic';
  const rationaleMessage =
    purpose === 'profile'
      ? 'לבחירת תמונת פרופיל אישית מהגלריה שלכם, נבקש הרשאת גישה לתמונות שלכם.\n\nהתמונה שתבחרו תועלה לחשבון שלכם באפליקציה ותוצג בעמוד הפרופיל בלבד. לא נסרוק ולא נעלה תמונות אחרות מהגלריה.'
      : purpose === 'invitation'
        ? 'לעריכת תמונת ההזמנה לאירוע, נבקש הרשאת גישה לתמונות שבמכשיר.\n\nהתמונה שתבחרו תוצמד לאירוע ותוצג למוזמנים שלכם בעמוד ההזמנה. לא ניגש לשאר התמונות בגלריה.'
        : 'נבקש הרשאת גישה לתמונות כדי שתוכלו לבחור תמונה מהגלריה שלכם.\n\nרק התמונה שתבחרו ידנית תועלה לאפליקציה לצורך שימוש בעמודי האפליקציה. לא ניגש לשאר התמונות בגלריה.';

  const existing = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (existing.granted) return { granted: true, canAskAgain: existing.canAskAgain };

  if (!existing.canAskAgain) {
    showSettingsPrompt(
      'נדרשת הרשאת גישה לתמונות',
      'כדי לבחור תמונה לפרופיל או להזמנה, יש לאשר באופן ידני גישה לתמונות בהגדרות האפליקציה.'
    );
    return { granted: false, canAskAgain: false };
  }

  // Show our explanatory dialog, then immediately trigger the iOS/Android
  // system permission prompt. The user makes the actual decision in the
  // system dialog (Don't Allow / Allow), so we don't expose a cancel option
  // on the rationale itself - that would violate Apple Guideline 5.1.1(iv).
  await showRationale('הרשאת גישה לתמונות', rationaleMessage);

  const result = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!result.granted && !result.canAskAgain) {
    showSettingsPrompt(
      'נדרשת הרשאת גישה לתמונות',
      'כדי להמשיך, יש לאשר ידנית גישה לתמונות בהגדרות האפליקציה.'
    );
  }
  return { granted: !!result.granted, canAskAgain: !!result.canAskAgain };
}

/**
 * מבקש הרשאת גישה לאנשי הקשר לאחר הצגת הסבר ברור על מטרת השימוש
 * (ייבוא מוזמנים לרשימת האורחים של האירוע).
 */
export async function ensureContactsPermission(): Promise<EnsureResult> {
  if (Platform.OS === 'web') return { granted: true, canAskAgain: true };

  const existing = await Contacts.getPermissionsAsync();
  if (existing.status === 'granted') return { granted: true, canAskAgain: existing.canAskAgain };

  if (!existing.canAskAgain) {
    showSettingsPrompt(
      'נדרשת הרשאת גישה לאנשי קשר',
      'כדי לייבא מוזמנים מאנשי הקשר במכשיר, יש לאשר ידנית גישה בהגדרות האפליקציה.'
    );
    return { granted: false, canAskAgain: false };
  }

  // Show explanatory dialog and immediately trigger the system permission
  // prompt. No cancel option on the rationale - per Apple Guideline 5.1.1(iv)
  // the user must always reach the official system dialog where they can
  // tap "Don't Allow".
  await showRationale(
    'הרשאת גישה לאנשי קשר',
    'נבקש הרשאת גישה לאנשי הקשר במכשיר כדי שתוכלו לייבא בקלות מוזמנים לרשימת האורחים של האירוע.\n\nנשתמש בשם ובמספר הטלפון של אנשי הקשר שתבחרו ידנית בלבד. לא נשמור ולא נעלה לשרת אנשי קשר שלא תבחרו במפורש.'
  );

  const result = await Contacts.requestPermissionsAsync();
  const granted = result.status === 'granted';
  if (!granted && !result.canAskAgain) {
    showSettingsPrompt(
      'נדרשת הרשאת גישה לאנשי קשר',
      'כדי להמשיך, יש לאשר ידנית גישה לאנשי הקשר בהגדרות האפליקציה.'
    );
  }
  return { granted, canAskAgain: !!result.canAskAgain };
}
