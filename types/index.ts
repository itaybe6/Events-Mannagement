export type Guest = {
  id: string;
  name: string;
  phone: string;
  status: 'מגיע' | 'לא מגיע' | 'ממתין';
  tableId: string | null;
  gift: number;
  message: string;
  category_id?: string; // קטגוריה אופציונלית
};

export type Table = {
  id: string;
  name: string;
  capacity: number;
  area: string;
  guests: string[];
  shape?: 'square' | 'rectangle';
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
  image: string;
  story: string;
  guests: number;
  budget: number;
  tasks: Task[];
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