import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type EventSelectionState = {
  activeUserId: string | null;
  activeEventId: string | null;
  setActiveEvent: (userId: string, eventId: string | null) => void;
  clear: () => void;
};

export const useEventSelectionStore = create<EventSelectionState>()(
  persist(
    (set) => ({
      activeUserId: null,
      activeEventId: null,
      setActiveEvent: (userId, eventId) =>
        set({
          activeUserId: userId,
          activeEventId: eventId ? String(eventId).trim() : null,
        }),
      clear: () => set({ activeUserId: null, activeEventId: null }),
    }),
    {
      name: 'event-selection-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        activeUserId: state.activeUserId,
        activeEventId: state.activeEventId,
      }),
    }
  )
);

