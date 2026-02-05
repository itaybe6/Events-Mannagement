// Supabase types for all tables in the project
// Generated from schema.sql

// ========== USERS ==========
export type User = {
  id: string;
  email: string;
  name: string;
  user_type: 'event_owner' | 'admin' | 'employee';
  phone?: string;
  avatar_url?: string;
  event_id?: string;
  created_at: string;
  updated_at: string;
};

// ========== EVENTS ==========
export type Event = {
  id: string;
  user_id: string;
  title: string;
  date: string;
  location: string;
  city?: string;
  image?: string;
  story?: string;
  guests_count: number;
  budget: number;
  created_at: string;
  updated_at: string;
};

// ========== TASKS ==========
export type Task = {
  id: string;
  event_id: string;
  title: string;
  completed: boolean;
  due_date?: string;
  created_at: string;
  updated_at: string;
};

// ========== GUESTS ==========
export type Guest = {
  id: string;
  event_id: string;
  name: string;
  phone?: string;
  status: 'מגיע' | 'לא מגיע' | 'ממתין';
  table_id?: string;
  gift_amount: number;
  message?: string;
  created_at: string;
  updated_at: string;
};

// ========== TABLES ==========
export type Table = {
  id: string;
  event_id: string;
  number: number;
  capacity: number;
  area?: string;
  shape: 'square' | 'rectangle';
  x?: number; // מיקום אופקי על המפה
  y?: number; // מיקום אנכי על המפה
  created_at: string;
  updated_at: string;
};

// ========== MESSAGES ==========
export type Message = {
  id: string;
  event_id: string;
  type: 'SMS' | 'וואטסאפ';
  recipient: string;
  phone: string;
  sent_date: string;
  status: string;
  created_at: string;
};

// ========== GIFTS ==========
export type Gift = {
  id: string;
  event_id: string;
  guest_name: string;
  amount: number;
  message?: string;
  date: string;
  status: 'התקבל' | 'בתהליך';
  created_at: string;
};

// ========== SEATING MAPS ==========
export type SeatingMap = {
  id: string;
  event_id: string;
  num_tables: number;
  tables: any; // jsonb: list of table IDs or objects {table_id, name}
  annotations: Array<{ text: string; x: number; y: number }>;
  created_at: string;
  updated_at: string;
};

// ========== NOTIFICATION SETTINGS ==========
export type NotificationSetting = {
  id: string;
  event_id: string;
  notification_type: string;
  title: string;
  notification_date: string; // השתמש בעמודה החדשה
  enabled: boolean;
  message_content?: string;
  created_at: string;
  updated_at: string;
}; 