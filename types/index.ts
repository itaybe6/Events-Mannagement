export type Guest = {
  id: string;
  name: string;
  phone: string;
  status: 'מגיע' | 'לא מגיע' | 'ממתין';
  tableId: string | null;
  gift: number;
  message: string;
  category_id: string; // קטגוריה חובה
  numberOfPeople: number;
  // Check-in (arrival to the venue). Optional for backward compatibility.
  checkedIn?: boolean;
  checkedInAt?: Date | null;
};

export type GuestCategory = {
  id: string;
  name: string;
  event_id: string;
  side: 'groom' | 'bride';
};

export type Table = {
  id: string;
  name: string | null;
  capacity: number;
  area: string;
  guests: string[];
  shape?: 'square' | 'rectangle' | 'reserve';
  number?: number; // מספר שולחן
  x?: number; // מיקום X
  y?: number; // מיקום Y
  seated_guests?: number; // מספר יושבים
};

export type Task = {
  id: string;
  title: string;
  completed: boolean;
  dueDate: Date;
};

export type Event = {
  id: string;
  title: string;
  date: Date;
  location: string;
  city: string;
  story: string;
  guests: number;
  budget: number;
  groomName?: string;
  brideName?: string;
  rsvpLink?: string;
  tasks: Task[];
  user_id?: string; // מזהה המשתמש שהאירוע שלו
  userName?: string; // שם המשתמש שהאירוע שלו (לתצוגת אדמין)
};

export type Message = {
  id: string;
  type: 'SMS' | 'וואטסאפ';
  recipient: string;
  phone: string;
  sentDate: Date;
  status: string;
};

export type Gift = {
  id: string;
  guestName: string;
  amount: number;
  message: string;
  date: Date;
  status: 'התקבל' | 'בתהליך';
};

export type Notification = {
  id: string;
  recipientUserId: string;
  eventOwnerId: string;
  eventId: string | null;
  type: string;
  title: string;
  body: string;
  metadata: any;
  createdAt: Date;
  readAt: Date | null;
};