import { Guest, Table, Message, Event } from '@/types';

export const mockEvents: Event[] = [
  {
    id: '1',
    title: 'החתונה של דני ורותי',
    date: new Date(2025, 7, 15, 19, 0),
    location: 'אולמי הגן הקסום, תל אביב',
    city: 'תל אביב',
    story: 'הכרנו לפני 5 שנים במסיבה של חברים משותפים. אחרי שיחה ארוכה וכמה כוסות יין, ידענו שמצאנו משהו מיוחד. לאחר 3 שנים של מערכת יחסים, דני הציע נישואין בטיול ברומא, ליד מזרקת טרווי.',
    guests: 250,
    budget: 120000,
    tasks: [
      { id: '1', title: 'סגירת אולם', completed: true, dueDate: new Date(2025, 3, 10) },
      { id: '2', title: 'הזמנת DJ', completed: true, dueDate: new Date(2025, 4, 15) },
      { id: '3', title: 'בחירת תפריט', completed: false, dueDate: new Date(2025, 5, 20) },
      { id: '4', title: 'הזמנת צלם', completed: false, dueDate: new Date(2025, 5, 25) },
      { id: '5', title: 'בחירת שמלת כלה', completed: false, dueDate: new Date(2025, 6, 1) },
    ]
  }
];

export const mockGuests: Guest[] = [
  { id: '1', name: 'משה כהן', phone: '0501234567', status: 'מגיע', tableId: '1', gift: 500, message: 'מזל טוב! מאחל לכם חיים מאושרים יחד.', category_id: 'default', numberOfPeople: 1 },
  { id: '2', name: 'רחל לוי', phone: '0507654321', status: 'מגיע', tableId: '1', gift: 400, message: 'מזל טוב לבעלי האירוע המקסימים! אוהבת אתכם.', category_id: 'default', numberOfPeople: 1 },
  { id: '3', name: 'דוד ישראלי', phone: '0521234567', status: 'לא מגיע', tableId: null, gift: 0, message: '', category_id: 'default', numberOfPeople: 1 },
  { id: '4', name: 'שרה גולדברג', phone: '0541234567', status: 'ממתין', tableId: null, gift: 0, message: '', category_id: 'default', numberOfPeople: 1 },
  { id: '5', name: 'יעקב אברהם', phone: '0551234567', status: 'מגיע', tableId: '2', gift: 600, message: 'מזל טוב! שמח להיות חלק מהשמחה שלכם.', category_id: 'default', numberOfPeople: 1 },
  { id: '6', name: 'חנה פרץ', phone: '0561234567', status: 'מגיע', tableId: '2', gift: 450, message: 'מזל טוב ענקי! אוהבת אתכם המון.', category_id: 'default', numberOfPeople: 1 },
  { id: '7', name: 'יוסי מזרחי', phone: '0571234567', status: 'ממתין', tableId: null, gift: 0, message: '', category_id: 'default', numberOfPeople: 1 },
  { id: '8', name: 'מיכל אדלר', phone: '0581234567', status: 'מגיע', tableId: '3', gift: 350, message: 'מזל טוב! מאחלת לכם אושר ועושר.', category_id: 'default', numberOfPeople: 1 },
  { id: '9', name: 'אבי שמעוני', phone: '0591234567', status: 'לא מגיע', tableId: null, gift: 200, message: 'מצטער שלא אוכל להגיע, אבל שולח אהבה ומתנה קטנה.', category_id: 'default', numberOfPeople: 1 },
  { id: '10', name: 'נועה ברקוביץ', phone: '0501234568', status: 'מגיע', tableId: '3', gift: 500, message: 'מזל טוב! מאחלת לכם חיים מלאי אהבה.', category_id: 'default', numberOfPeople: 1 },
  { id: '11', name: 'אלון גולן', phone: '0501234569', status: 'מגיע', tableId: '4', gift: 450, message: 'מזל טוב! מאחל לכם חיים מאושרים.', category_id: 'default', numberOfPeople: 1 },
  { id: '12', name: 'מירי כהן', phone: '0501234570', status: 'מגיע', tableId: '4', gift: 300, message: 'מזל טוב! שמחה להשתתף בשמחתכם.', category_id: 'default', numberOfPeople: 1 },
  { id: '13', name: 'יובל לוי', phone: '0501234571', status: 'מגיע', tableId: '5', gift: 400, message: 'מזל טוב! מאחל לכם אושר ועושר.', category_id: 'default', numberOfPeople: 1 },
  { id: '14', name: 'שירה אברמוב', phone: '0501234572', status: 'מגיע', tableId: '5', gift: 350, message: 'מזל טוב! אוהבת אתכם המון.', category_id: 'default', numberOfPeople: 1 },
  { id: '15', name: 'עידן שרעבי', phone: '0501234573', status: 'ממתין', tableId: null, gift: 0, message: '', category_id: 'default', numberOfPeople: 1 },
];

export const mockTables: Table[] = [
  { id: '1', name: 'שולחן 1', capacity: 10, area: 'אזור מרכזי', guests: ['1', '2'], shape: 'square' },
  { id: '2', name: 'שולחן 2', capacity: 10, area: 'אזור מרכזי', guests: ['5', '6'], shape: 'square' },
  { id: '3', name: 'שולחן 3', capacity: 10, area: 'אזור משפחה', guests: ['8', '10'], shape: 'square' },
  { id: '4', name: 'שולחן 4', capacity: 10, area: 'אזור משפחה', guests: ['11', '12'], shape: 'square' },
  { id: '5', name: 'שולחן 5', capacity: 10, area: 'אזור חברים', guests: ['13', '14'], shape: 'square' },
  { id: '6', name: 'שולחן 6', capacity: 10, area: 'אזור חברים', guests: [], shape: 'square' },
  { id: '7', name: 'שולחן 7', capacity: 10, area: 'אזור מרכזי', guests: [], shape: 'square' },
  { id: '8', name: 'שולחן 8', capacity: 10, area: 'אזור מרכזי', guests: [], shape: 'square' },
  { id: '9', name: 'שולחן 9', capacity: 10, area: 'אזור משפחה', guests: [], shape: 'square' },
  { id: '10', name: 'שולחן 10', capacity: 10, area: 'אזור משפחה', guests: [], shape: 'square' },
  { id: '11', name: 'שולחן 11', capacity: 10, area: 'אזור חברים', guests: [], shape: 'square' },
  { id: '12', name: 'שולחן 12', capacity: 10, area: 'אזור חברים', guests: [], shape: 'square' },
  { id: '13', name: 'שולחן 13', capacity: 10, area: 'אזור מרכזי', guests: [], shape: 'square' },
  { id: '14', name: 'שולחן 14', capacity: 12, area: 'אזור VIP', guests: [], shape: 'rectangle' },
  { id: '15', name: 'שולחן 15', capacity: 12, area: 'אזור VIP', guests: [], shape: 'rectangle' },
];

export const mockMessages: Message[] = [
  { id: '1', type: 'SMS', recipient: 'משה כהן', phone: '0501234567', sentDate: new Date(2025, 6, 1), status: 'נשלח' },
  { id: '2', type: 'וואטסאפ', recipient: 'רחל לוי', phone: '0507654321', sentDate: new Date(2025, 6, 1), status: 'נשלח' },
  { id: '3', type: 'SMS', recipient: 'דוד ישראלי', phone: '0521234567', sentDate: new Date(2025, 6, 1), status: 'נשלח' },
  { id: '4', type: 'וואטסאפ', recipient: 'שרה גולדברג', phone: '0541234567', sentDate: new Date(2025, 6, 2), status: 'נשלח' },
  { id: '5', type: 'SMS', recipient: 'יעקב אברהם', phone: '0551234567', sentDate: new Date(2025, 6, 2), status: 'נשלח' },
];
