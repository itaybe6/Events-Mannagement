import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Event, Guest, Table, Task, Message, Gift } from '@/types';
import { eventService } from '@/lib/services/eventService';
import { guestService } from '@/lib/services/guestService';
import { tableService } from '@/lib/services/tableService';
import { messageService } from '@/lib/services/messageService';
import { giftService } from '@/lib/services/giftService';

interface EventState {
  currentEvent: Event | null;
  events: Event[];
  guests: Guest[];
  tables: Table[];
  messages: Message[];
  gifts: Gift[];
  loading: boolean;
  
  // Event actions
  loadEvents: () => Promise<void>;
  setCurrentEvent: (event: Event | null) => void;
  setCurrentEventWithData: (event: Event, guests: Guest[], tables: Table[], messages: Message[], gifts: Gift[]) => void;
  createEvent: (eventData: Omit<Event, 'id' | 'tasks'>) => Promise<Event>;
  updateEvent: (eventId: string, eventData: Partial<Omit<Event, 'id' | 'tasks'>>) => Promise<void>;
  deleteEvent: (eventId: string) => Promise<void>;
  
  // Task actions
  addTask: (eventId: string, task: Omit<Task, 'id'>) => Promise<void>;
  updateTask: (taskId: string, updates: Partial<Omit<Task, 'id'>>) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  
  // Guest actions
  loadGuests: (eventId: string) => Promise<void>;
  addGuest: (eventId: string, guest: Omit<Guest, 'id'>) => Promise<void>;
  updateGuest: (guestId: string, updates: Partial<Omit<Guest, 'id'>>) => Promise<void>;
  deleteGuest: (guestId: string) => Promise<void>;
  updateGuestStatus: (guestId: string, status: Guest['status']) => Promise<void>;
  assignGuestToTable: (guestId: string, tableId: string | null) => Promise<void>;
  
  // Table actions
  loadTables: (eventId: string) => Promise<void>;
  addTable: (eventId: string, table: Omit<Table, 'id' | 'guests'>) => Promise<void>;
  updateTable: (tableId: string, updates: Partial<Omit<Table, 'id' | 'guests'>>) => Promise<void>;
  deleteTable: (tableId: string) => Promise<void>;
  
  // Message actions
  loadMessages: (eventId: string) => Promise<void>;
  addMessage: (eventId: string, message: Omit<Message, 'id' | 'sentDate'>) => Promise<void>;
  updateMessageStatus: (messageId: string, status: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  
  // Gift actions
  loadGifts: (eventId: string) => Promise<void>;
  addGift: (eventId: string, gift: Omit<Gift, 'id' | 'date'>) => Promise<void>;
  updateGift: (giftId: string, updates: Partial<Omit<Gift, 'id' | 'date'>>) => Promise<void>;
  updateGiftStatus: (giftId: string, status: Gift['status']) => Promise<void>;
  deleteGift: (giftId: string) => Promise<void>;
  
  // Clear all data
  clearData: () => void;
}

export const useEventStore = create<EventState>()(
  persist(
    (set, get) => ({
      currentEvent: null,
      events: [],
      guests: [],
      tables: [],
      messages: [],
      gifts: [],
      loading: false,
      
      // Event actions
      loadEvents: async () => {
        try {
          set({ loading: true });
          const events = await eventService.getEvents();
          set({ events, loading: false });
        } catch (error) {
          console.error('Load events error:', error);
          set({ loading: false });
          throw error;
        }
      },
      
      setCurrentEvent: (event) => set({ currentEvent: event }),
      
      setCurrentEventWithData: (event, guests, tables, messages, gifts) => set({
        currentEvent: event,
        guests,
        tables,
        messages,
        gifts,
      }),
      
      createEvent: async (eventData) => {
        try {
          set({ loading: true });
          const newEvent = await eventService.createEvent(eventData);
          set((state) => ({
            events: [...state.events, newEvent],
            currentEvent: newEvent,
            loading: false,
          }));
          return newEvent;
        } catch (error) {
          console.error('Create event error:', error);
          set({ loading: false });
          throw error;
        }
      },
      
      updateEvent: async (eventId, eventData) => {
        try {
          const updatedEvent = await eventService.updateEvent(eventId, eventData);
          set((state) => ({
            events: state.events.map(event => 
              event.id === eventId ? updatedEvent : event
            ),
            currentEvent: state.currentEvent?.id === eventId ? updatedEvent : state.currentEvent,
          }));
        } catch (error) {
          console.error('Update event error:', error);
          throw error;
        }
      },
      
      deleteEvent: async (eventId) => {
        try {
          await eventService.deleteEvent(eventId);
          set((state) => ({
            events: state.events.filter(event => event.id !== eventId),
            currentEvent: state.currentEvent?.id === eventId ? null : state.currentEvent,
          }));
        } catch (error) {
          console.error('Delete event error:', error);
          throw error;
        }
      },
      
      // Task actions
      addTask: async (eventId, task) => {
        try {
          const newTask = await eventService.addTask(eventId, task);
          set((state) => ({
            events: state.events.map(event => 
              event.id === eventId 
                ? { ...event, tasks: [...event.tasks, newTask] }
                : event
            ),
            currentEvent: state.currentEvent?.id === eventId 
              ? { ...state.currentEvent, tasks: [...state.currentEvent.tasks, newTask] }
              : state.currentEvent,
          }));
        } catch (error) {
          console.error('Add task error:', error);
          throw error;
        }
      },
      
      updateTask: async (taskId, updates) => {
        try {
          const updatedTask = await eventService.updateTask(taskId, updates);
          set((state) => ({
            events: state.events.map(event => ({
              ...event,
              tasks: event.tasks.map(task => 
                task.id === taskId ? updatedTask : task
              )
            })),
            currentEvent: state.currentEvent ? {
              ...state.currentEvent,
              tasks: state.currentEvent.tasks.map(task => 
                task.id === taskId ? updatedTask : task
              )
            } : null,
          }));
        } catch (error) {
          console.error('Update task error:', error);
          throw error;
        }
      },
      
      deleteTask: async (taskId) => {
        try {
          await eventService.deleteTask(taskId);
          set((state) => ({
            events: state.events.map(event => ({
              ...event,
              tasks: event.tasks.filter(task => task.id !== taskId)
            })),
            currentEvent: state.currentEvent ? {
              ...state.currentEvent,
              tasks: state.currentEvent.tasks.filter(task => task.id !== taskId)
            } : null,
          }));
        } catch (error) {
          console.error('Delete task error:', error);
          throw error;
        }
      },
      
      // Guest actions
      loadGuests: async (eventId) => {
        try {
          const guests = await guestService.getGuests(eventId);
          set({ guests });
        } catch (error) {
          console.error('Load guests error:', error);
          throw error;
        }
      },
      
      addGuest: async (eventId, guest) => {
        try {
          const newGuest = await guestService.addGuest(eventId, guest);
          set((state) => ({
            guests: [...state.guests, newGuest]
          }));
        } catch (error) {
          console.error('Add guest error:', error);
          throw error;
        }
      },
      
      updateGuest: async (guestId, updates) => {
        try {
          const updatedGuest = await guestService.updateGuest(guestId, updates);
          set((state) => ({
            guests: state.guests.map(guest => 
              guest.id === guestId ? updatedGuest : guest
            )
          }));
        } catch (error) {
          console.error('Update guest error:', error);
          throw error;
        }
      },
      
      deleteGuest: async (guestId) => {
        try {
          await guestService.deleteGuest(guestId);
          set((state) => ({
            guests: state.guests.filter(guest => guest.id !== guestId)
          }));
        } catch (error) {
          console.error('Delete guest error:', error);
          throw error;
        }
      },
      
      updateGuestStatus: async (guestId, status) => {
        try {
          const updatedGuest = await guestService.updateGuestStatus(guestId, status);
          set((state) => ({
            guests: state.guests.map(guest => 
              guest.id === guestId ? updatedGuest : guest
            )
          }));
        } catch (error) {
          console.error('Update guest status error:', error);
          throw error;
        }
      },
      
      assignGuestToTable: async (guestId, tableId) => {
        try {
          const updatedGuest = await guestService.assignGuestToTable(guestId, tableId);
          set((state) => ({
            guests: state.guests.map(guest => 
              guest.id === guestId ? updatedGuest : guest
            ),
            tables: state.tables.map(table => ({
              ...table,
              guests: table.guests.includes(guestId) 
                ? table.guests.filter(id => id !== guestId)
                : table.guests,
            })).map(table => ({
              ...table,
              guests: table.id === tableId 
                ? [...table.guests.filter(id => id !== guestId), guestId]
                : table.guests,
            }))
          }));
        } catch (error) {
          console.error('Assign guest to table error:', error);
          throw error;
        }
      },
      
      // Table actions
      loadTables: async (eventId) => {
        try {
          const tables = await tableService.getTables(eventId);
          set({ tables });
        } catch (error) {
          console.error('Load tables error:', error);
          throw error;
        }
      },
      
      addTable: async (eventId, table) => {
        try {
          const newTable = await tableService.addTable(eventId, table);
          set((state) => ({
            tables: [...state.tables, newTable]
          }));
        } catch (error) {
          console.error('Add table error:', error);
          throw error;
        }
      },
      
      updateTable: async (tableId, updates) => {
        try {
          const updatedTable = await tableService.updateTable(tableId, updates);
          set((state) => ({
            tables: state.tables.map(table => 
              table.id === tableId ? updatedTable : table
            )
          }));
        } catch (error) {
          console.error('Update table error:', error);
          throw error;
        }
      },
      
      deleteTable: async (tableId) => {
        try {
          await tableService.deleteTable(tableId);
          set((state) => ({
            tables: state.tables.filter(table => table.id !== tableId),
            guests: state.guests.map(guest => 
              guest.tableId === tableId ? { ...guest, tableId: null } : guest
            )
          }));
        } catch (error) {
          console.error('Delete table error:', error);
          throw error;
        }
      },
      
      // Message actions
      loadMessages: async (eventId) => {
        try {
          const messages = await messageService.getMessages(eventId);
          set({ messages });
        } catch (error) {
          console.error('Load messages error:', error);
          throw error;
        }
      },
      
      addMessage: async (eventId, message) => {
        try {
          const newMessage = await messageService.addMessage(eventId, message);
          set((state) => ({
            messages: [newMessage, ...state.messages]
          }));
        } catch (error) {
          console.error('Add message error:', error);
          throw error;
        }
      },
      
      updateMessageStatus: async (messageId, status) => {
        try {
          const updatedMessage = await messageService.updateMessageStatus(messageId, status);
          set((state) => ({
            messages: state.messages.map(message => 
              message.id === messageId ? updatedMessage : message
            )
          }));
        } catch (error) {
          console.error('Update message status error:', error);
          throw error;
        }
      },
      
      deleteMessage: async (messageId) => {
        try {
          await messageService.deleteMessage(messageId);
          set((state) => ({
            messages: state.messages.filter(message => message.id !== messageId)
          }));
        } catch (error) {
          console.error('Delete message error:', error);
          throw error;
        }
      },
      
      // Gift actions
      loadGifts: async (eventId) => {
        try {
          const gifts = await giftService.getGifts(eventId);
          set({ gifts });
        } catch (error) {
          console.error('Load gifts error:', error);
          throw error;
        }
      },
      
      addGift: async (eventId, gift) => {
        try {
          const newGift = await giftService.addGift(eventId, gift);
          set((state) => ({
            gifts: [newGift, ...state.gifts]
          }));
        } catch (error) {
          console.error('Add gift error:', error);
          throw error;
        }
      },
      
      updateGift: async (giftId, updates) => {
        try {
          const updatedGift = await giftService.updateGift(giftId, updates);
          set((state) => ({
            gifts: state.gifts.map(gift => 
              gift.id === giftId ? updatedGift : gift
            )
          }));
        } catch (error) {
          console.error('Update gift error:', error);
          throw error;
        }
      },
      
      updateGiftStatus: async (giftId, status) => {
        try {
          const updatedGift = await giftService.updateGiftStatus(giftId, status);
          set((state) => ({
            gifts: state.gifts.map(gift => 
              gift.id === giftId ? updatedGift : gift
            )
          }));
        } catch (error) {
          console.error('Update gift status error:', error);
          throw error;
        }
      },
      
      deleteGift: async (giftId) => {
        try {
          await giftService.deleteGift(giftId);
          set((state) => ({
            gifts: state.gifts.filter(gift => gift.id !== giftId)
          }));
        } catch (error) {
          console.error('Delete gift error:', error);
          throw error;
        }
      },
      
      // Clear all data
      clearData: () => set({
        currentEvent: null,
        events: [],
        guests: [],
        tables: [],
        messages: [],
        gifts: [],
      }),
    }),
    {
      name: 'event-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        currentEvent: state.currentEvent,
      }),
    }
  )
);