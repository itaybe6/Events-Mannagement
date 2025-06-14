import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Event, Guest, Table, Task, Message, Gift } from '@/types';
import { mockEvents, mockGuests, mockTables, mockMessages, mockGifts } from '@/constants/mockData';

interface EventState {
  currentEvent: Event | null;
  guests: Guest[];
  tables: Table[];
  messages: Message[];
  gifts: Gift[];
  
  // Event actions
  setCurrentEvent: (event: Event) => void;
  updateEvent: (eventData: Partial<Event>) => void;
  addTask: (task: Task) => void;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  deleteTask: (taskId: string) => void;
  
  // Guest actions
  addGuest: (guest: Guest) => void;
  updateGuest: (guestId: string, updates: Partial<Guest>) => void;
  deleteGuest: (guestId: string) => void;
  updateGuestStatus: (guestId: string, status: Guest['status']) => void;
  
  // Table actions
  addTable: (table: Table) => void;
  updateTable: (tableId: string, updates: Partial<Table>) => void;
  deleteTable: (tableId: string) => void;
  assignGuestToTable: (guestId: string, tableId: string) => void;
  removeGuestFromTable: (guestId: string) => void;
  
  // Message actions
  addMessage: (message: Message) => void;
  
  // Gift actions
  addGift: (gift: Gift) => void;
  updateGiftStatus: (giftId: string, status: Gift['status']) => void;
}

// Type guard to ensure mockGuests conform to Guest type
const typedMockGuests: Guest[] = mockGuests.map(guest => ({
  ...guest,
  status: guest.status as Guest['status']
}));

// Type guard to ensure mockMessages conform to Message type
const typedMockMessages: Message[] = mockMessages.map(message => ({
  ...message,
  type: message.type as Message['type']
}));

// Type guard to ensure mockGifts conform to Gift type
const typedMockGifts: Gift[] = mockGifts.map(gift => ({
  ...gift,
  status: gift.status as Gift['status']
}));

export const useEventStore = create<EventState>()(
  persist(
    (set) => ({
      currentEvent: mockEvents[0],
      guests: typedMockGuests,
      tables: mockTables,
      messages: typedMockMessages,
      gifts: typedMockGifts,
      
      // Event actions
      setCurrentEvent: (event) => set({ currentEvent: event }),
      updateEvent: (eventData) => set((state) => ({
        currentEvent: state.currentEvent ? { ...state.currentEvent, ...eventData } : null
      })),
      addTask: (task) => set((state) => ({
        currentEvent: state.currentEvent 
          ? { ...state.currentEvent, tasks: [...state.currentEvent.tasks, task] } 
          : null
      })),
      updateTask: (taskId, updates) => set((state) => ({
        currentEvent: state.currentEvent 
          ? {
              ...state.currentEvent,
              tasks: state.currentEvent.tasks.map(task => 
                task.id === taskId ? { ...task, ...updates } : task
              )
            } 
          : null
      })),
      deleteTask: (taskId) => set((state) => ({
        currentEvent: state.currentEvent 
          ? {
              ...state.currentEvent,
              tasks: state.currentEvent.tasks.filter(task => task.id !== taskId)
            } 
          : null
      })),
      
      // Guest actions
      addGuest: (guest) => set((state) => ({
        guests: [...state.guests, guest]
      })),
      updateGuest: (guestId, updates) => set((state) => ({
        guests: state.guests.map(guest => 
          guest.id === guestId ? { ...guest, ...updates } : guest
        )
      })),
      deleteGuest: (guestId) => set((state) => ({
        guests: state.guests.filter(guest => guest.id !== guestId)
      })),
      updateGuestStatus: (guestId, status) => set((state) => ({
        guests: state.guests.map(guest => 
          guest.id === guestId ? { ...guest, status } : guest
        )
      })),
      
      // Table actions
      addTable: (table) => set((state) => ({
        tables: [...state.tables, table]
      })),
      updateTable: (tableId, updates) => set((state) => ({
        tables: state.tables.map(table => 
          table.id === tableId ? { ...table, ...updates } : table
        )
      })),
      deleteTable: (tableId) => set((state) => ({
        tables: state.tables.filter(table => table.id !== tableId)
      })),
      assignGuestToTable: (guestId, tableId) => set((state) => {
        // First remove guest from any existing table
        const updatedTables = state.tables.map(table => ({
          ...table,
          guests: table.guests.filter(id => id !== guestId)
        }));
        
        // Then add guest to the new table
        return {
          tables: updatedTables.map(table => 
            table.id === tableId 
              ? { ...table, guests: [...table.guests, guestId] } 
              : table
          ),
          guests: state.guests.map(guest => 
            guest.id === guestId ? { ...guest, tableId } : guest
          )
        };
      }),
      removeGuestFromTable: (guestId) => set((state) => ({
        tables: state.tables.map(table => ({
          ...table,
          guests: table.guests.filter(id => id !== guestId)
        })),
        guests: state.guests.map(guest => 
          guest.id === guestId ? { ...guest, tableId: null } : guest
        )
      })),
      
      // Message actions
      addMessage: (message) => set((state) => ({
        messages: [...state.messages, message]
      })),
      
      // Gift actions
      addGift: (gift) => set((state) => ({
        gifts: [...state.gifts, gift]
      })),
      updateGiftStatus: (giftId, status) => set((state) => ({
        gifts: state.gifts.map(gift => 
          gift.id === giftId ? { ...gift, status } : gift
        )
      })),
    }),
    {
      name: 'event-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);