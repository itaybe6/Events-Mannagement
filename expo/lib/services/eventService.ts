import { supabase, supabaseAdmin } from '../supabase';
import { cachedQuery, invalidateCache, peekCached } from '../queryCache';
import { Event, Task } from '@/types';

const EVENTS_LIST_KEY = 'events:all';
const EVENTS_UPCOMING_KEY = 'events:upcoming';

/** Columns the admin/employee event list actually renders. Skipping `*` and
 *  `tasks(*)` is the difference between a ~2s first load and a single light
 *  round-trip — the list never showed tasks anyway. */
const EVENT_LIST_COLUMNS =
  'id, title, date, location, city, guests_count, budget, groom_name, bride_name, invitation_image_url, is_approved, user_id, users (name, avatar_url)';

function mapEventListRow(event: any): Event {
  return {
    id: event.id,
    title: event.title,
    date: new Date(event.date),
    location: event.location,
    city: event.city || '',
    story: '',
    guests: event.guests_count || 0,
    budget: Number(event.budget) || 0,
    groomName: event.groom_name ?? undefined,
    brideName: event.bride_name ?? undefined,
    invitationImageUrl: event.invitation_image_url ?? undefined,
    user_id: event.user_id,
    userName: event?.users?.name ?? undefined,
    userAvatarUrl: event?.users?.avatar_url ?? undefined,
    isApproved: event.is_approved ?? undefined,
    tasks: [],
  };
}

/** Called by every write path so the next read doesn't serve a stale list. */
function invalidateEventsCache(): void {
  invalidateCache(EVENTS_LIST_KEY);
  invalidateCache(EVENTS_UPCOMING_KEY);
}

export const eventService = {
  /** Last loaded events list, if any, so a screen can paint before revalidating. */
  peekEvents: (): Event[] | undefined => peekCached<Event[]>(EVENTS_LIST_KEY),

  peekUpcomingEvents: (): Event[] | undefined => peekCached<Event[]>(EVENTS_UPCOMING_KEY),

  invalidateEventsCache,

  // Get all events for current user
  getEvents: async (opts?: { force?: boolean }): Promise<Event[]> =>
    cachedQuery(EVENTS_LIST_KEY, () => eventService.fetchEvents(), { force: opts?.force }),

  fetchEvents: async (): Promise<Event[]> => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select(EVENT_LIST_COLUMNS)
        .order('date', { ascending: true });

      if (error) throw error;

      return (data || []).map(mapEventListRow);
    } catch (error) {
      console.error('Get events error:', error);
      throw error;
    }
  },

  /** Upcoming/today events only — what the admin mobile list shows first. */
  getUpcomingEvents: async (opts?: { force?: boolean }): Promise<Event[]> => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return cachedQuery(
      EVENTS_UPCOMING_KEY,
      async () => {
        const { data, error } = await supabase
          .from('events')
          .select(EVENT_LIST_COLUMNS)
          .gte('date', start.toISOString())
          .order('date', { ascending: true });

        if (error) throw error;
        return (data || []).map(mapEventListRow);
      },
      { maxAgeMs: 30_000, force: opts?.force }
    );
  },

  prefetchEventsList: (): void => {
    void eventService.getUpcomingEvents().catch(() => undefined);
    void eventService.getEvents().catch(() => undefined);
  },

  // Get all events for a specific user (event owner)
  getEventsForUser: async (
    userId: string,
    opts?: { limit?: number; asAdmin?: boolean }
  ): Promise<Array<Pick<Event, 'id' | 'title' | 'date' | 'location' | 'city'>>> => {
    const cacheKey = `events:user:${userId}:${opts?.limit ?? 'all'}:${opts?.asAdmin ? 'admin' : 'user'}`;
    return cachedQuery(
      cacheKey,
      async () => {
        try {
          const client = opts?.asAdmin ? supabaseAdmin : supabase;
          const query = client
            .from('events')
            .select('id,title,date,location,city')
            .eq('user_id', userId)
            .order('date', { ascending: true });

          const { data, error } = await (opts?.limit ? query.limit(opts.limit) : query);

          if (error) throw error;

          return (data || []).map((e: any) => ({
            id: e.id,
            title: e.title,
            date: new Date(e.date),
            location: e.location,
            city: e.city || '',
          }));
        } catch (error) {
          console.error('Get events for user error:', error);
          throw error;
        }
      },
      { maxAgeMs: 30_000 }
    );
  },

  // Get single event by ID
  getEvent: async (eventId: string): Promise<Event | null> => {
    try {
      const cleanId = String(eventId || '').trim();
      if (!cleanId) return null;

      const { data, error } = await supabase
        .from('events')
        .select(`
          *,
          tasks (*),
          users (name, avatar_url)
        `)
        .eq('id', cleanId)
        .maybeSingle();

      // When no rows match (or are visible due to RLS), PostgREST can return PGRST116 for single-row coercion.
      // `maybeSingle()` usually avoids it, but keep this guard for safety across versions.
      if (error) {
        const code = (error as any)?.code ? String((error as any).code) : '';
        if (code === 'PGRST116') return null;
        throw error;
      }
      if (!data) return null;

      return {
        id: data.id,
        title: data.title,
        date: new Date(data.date),
        location: data.location,
        city: data.city || '',
        story: data.story || '',
        guests: data.guests_count || 0,
        budget: Number(data.budget) || 0,
        groomName: (data as any).groom_name ?? undefined,
        brideName: (data as any).bride_name ?? undefined,
        rsvpLink: (data as any).rsvp_link ?? undefined,
        invitationTitle: (data as any).invitation_title ?? undefined,
        invitationImageUrl: (data as any).invitation_image_url ?? undefined,
        receptionTime: (data as any).reception_time ?? undefined,
        ceremonyTime: (data as any).ceremony_time ?? undefined,
        brideParents: (data as any).bride_parents ?? undefined,
        groomParents: (data as any).groom_parents ?? undefined,
        user_id: data.user_id, // הוסף את user_id
        userName: (data as any)?.users?.name ?? undefined,
        userAvatarUrl: (data as any)?.users?.avatar_url ?? undefined,
        isApproved: (data as any).is_approved ?? undefined,
        tasks: ((data as any).tasks || []).map((task: any) => ({
          id: task.id,
          title: task.title,
          completed: task.completed,
          dueDate: new Date(task.due_date),
        })),
      };
    } catch (error) {
      console.error('Get event error:', error);
      throw error;
    }
  },

  // Lightweight single-event fetch for screens that only need the event header
  // info (couple home screen). Skips the `tasks(*)` join and pulls just the
  // columns actually rendered, which keeps the initial load fast.
  getEventLite: async (
    eventId: string
  ): Promise<
    | (Pick<Event, 'id' | 'title' | 'date' | 'location' | 'city'> & {
        brideName?: string;
        groomName?: string;
        isApproved?: boolean;
      })
    | null
  > => {
    const cleanId = String(eventId || '').trim();
    if (!cleanId) return null;

    return cachedQuery(
      `event:lite:${cleanId}`,
      async () => {
        try {
          const { data, error } = await supabase
            .from('events')
            .select('id, title, date, location, city, groom_name, bride_name, is_approved')
            .eq('id', cleanId)
            .maybeSingle();

          if (error) {
            const code = (error as any)?.code ? String((error as any).code) : '';
            if (code === 'PGRST116') return null;
            throw error;
          }
          if (!data) return null;

          return {
            id: data.id,
            title: data.title,
            date: new Date(data.date),
            location: data.location,
            city: data.city || '',
            groomName: (data as any).groom_name ?? undefined,
            brideName: (data as any).bride_name ?? undefined,
            isApproved: (data as any).is_approved ?? undefined,
          };
        } catch (error) {
          console.error('Get event (lite) error:', error);
          throw error;
        }
      },
      { maxAgeMs: 30_000 }
    );
  },

  // Create new event
  createEvent: async (eventData: Omit<Event, 'id' | 'tasks'>): Promise<Event> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user');

      const insertData: any = {
        user_id: user.id,
        title: eventData.title,
        date: eventData.date.toISOString(),
        location: eventData.location,
        city: eventData.city,
        story: eventData.story,
        guests_count: eventData.guests,
        budget: eventData.budget,
      };
      if (eventData.isApproved !== undefined) insertData.is_approved = eventData.isApproved;
      if (eventData.groomName !== undefined) insertData.groom_name = eventData.groomName;
      if (eventData.brideName !== undefined) insertData.bride_name = eventData.brideName;
      if (eventData.rsvpLink !== undefined) insertData.rsvp_link = eventData.rsvpLink;
      if ((eventData as any).invitationTitle !== undefined) insertData.invitation_title = (eventData as any).invitationTitle;
      if ((eventData as any).invitationImageUrl !== undefined) insertData.invitation_image_url = (eventData as any).invitationImageUrl;
      if ((eventData as any).receptionTime !== undefined) insertData.reception_time = (eventData as any).receptionTime;
      if ((eventData as any).ceremonyTime !== undefined) insertData.ceremony_time = (eventData as any).ceremonyTime;
      if ((eventData as any).brideParents !== undefined) insertData.bride_parents = (eventData as any).brideParents;
      if ((eventData as any).groomParents !== undefined) insertData.groom_parents = (eventData as any).groomParents;

      const { data, error } = await supabase
        .from('events')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;
      invalidateEventsCache();

      return {
        id: data.id,
        title: data.title,
        date: new Date(data.date),
        location: data.location,
        city: data.city || '',
        story: data.story || '',
        guests: data.guests_count || 0,
        budget: Number(data.budget) || 0,
        groomName: (data as any).groom_name ?? undefined,
        brideName: (data as any).bride_name ?? undefined,
        rsvpLink: (data as any).rsvp_link ?? undefined,
        invitationTitle: (data as any).invitation_title ?? undefined,
        invitationImageUrl: (data as any).invitation_image_url ?? undefined,
        receptionTime: (data as any).reception_time ?? undefined,
        ceremonyTime: (data as any).ceremony_time ?? undefined,
        brideParents: (data as any).bride_parents ?? undefined,
        groomParents: (data as any).groom_parents ?? undefined,
        isApproved: (data as any).is_approved ?? undefined,
        tasks: [],
      };
    } catch (error) {
      console.error('Create event error:', error);
      throw error;
    }
  },

  // Create new event for a specific user (admin).
  // Admin-created events are approved by default unless `isApproved` is passed explicitly.
  createEventForUser: async (userId: string, eventData: Omit<Event, 'id' | 'tasks'>): Promise<Event> => {
    try {
      const insertData: any = {
        user_id: userId,
        title: eventData.title,
        date: eventData.date.toISOString(),
        location: eventData.location,
        city: eventData.city,
        story: eventData.story,
        guests_count: eventData.guests,
        budget: eventData.budget,
        is_approved: eventData.isApproved ?? true,
      };
      if (eventData.groomName !== undefined) insertData.groom_name = eventData.groomName;
      if (eventData.brideName !== undefined) insertData.bride_name = eventData.brideName;
      if (eventData.rsvpLink !== undefined) insertData.rsvp_link = eventData.rsvpLink;
      if ((eventData as any).invitationTitle !== undefined) insertData.invitation_title = (eventData as any).invitationTitle;
      if ((eventData as any).invitationImageUrl !== undefined) insertData.invitation_image_url = (eventData as any).invitationImageUrl;
      if ((eventData as any).receptionTime !== undefined) insertData.reception_time = (eventData as any).receptionTime;
      if ((eventData as any).ceremonyTime !== undefined) insertData.ceremony_time = (eventData as any).ceremonyTime;
      if ((eventData as any).brideParents !== undefined) insertData.bride_parents = (eventData as any).brideParents;
      if ((eventData as any).groomParents !== undefined) insertData.groom_parents = (eventData as any).groomParents;

      const { data, error } = await supabase
        .from('events')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;
      invalidateEventsCache();

      // עדכן את המשתמש עם ה-event_id החדש
      await supabase
        .from('users')
        .update({ event_id: data.id })
        .eq('id', userId);

      return {
        id: data.id,
        title: data.title,
        date: new Date(data.date),
        location: data.location,
        city: data.city || '',
        story: data.story || '',
        guests: data.guests_count || 0,
        budget: Number(data.budget) || 0,
        groomName: (data as any).groom_name ?? undefined,
        brideName: (data as any).bride_name ?? undefined,
        rsvpLink: (data as any).rsvp_link ?? undefined,
        invitationTitle: (data as any).invitation_title ?? undefined,
        invitationImageUrl: (data as any).invitation_image_url ?? undefined,
        receptionTime: (data as any).reception_time ?? undefined,
        ceremonyTime: (data as any).ceremony_time ?? undefined,
        brideParents: (data as any).bride_parents ?? undefined,
        groomParents: (data as any).groom_parents ?? undefined,
        isApproved: (data as any).is_approved ?? undefined,
        tasks: [],
      };
    } catch (error) {
      console.error('Create event for user error:', error);
      throw error;
    }
  },

  // Create a new event for the currently authenticated user (self-signup).
  // Always starts unapproved unless explicitly overridden.
  createEventForCurrentUser: async (eventData: Omit<Event, 'id' | 'tasks'>): Promise<Event> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user');

      const insertData: any = {
        user_id: user.id,
        title: eventData.title,
        date: eventData.date.toISOString(),
        location: eventData.location,
        city: eventData.city,
        story: eventData.story,
        guests_count: eventData.guests,
        budget: eventData.budget,
        is_approved: eventData.isApproved ?? false,
      };

      const { data, error } = await supabase
        .from('events')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;
      invalidateEventsCache();

      // Link the user's primary event to the newly-created one.
      await supabase
        .from('users')
        .update({ event_id: data.id })
        .eq('id', user.id);

      return {
        id: data.id,
        title: data.title,
        date: new Date(data.date),
        location: data.location,
        city: data.city || '',
        story: data.story || '',
        guests: data.guests_count || 0,
        budget: Number(data.budget) || 0,
        isApproved: (data as any).is_approved ?? undefined,
        tasks: [],
      };
    } catch (error) {
      console.error('Create event for current user error:', error);
      throw error;
    }
  },

  // Admin-only: toggle approval status for an event.
  setEventApproval: async (eventId: string, approved: boolean): Promise<void> => {
    try {
      const { error } = await supabase
        .from('events')
        .update({ is_approved: approved })
        .eq('id', eventId);
      if (error) throw error;
      invalidateEventsCache();
    } catch (error) {
      console.error('Set event approval error:', error);
      throw error;
    }
  },

  // Update event
  updateEvent: async (eventId: string, updates: Partial<Omit<Event, 'id' | 'tasks'>>): Promise<Event> => {
    try {
      const updateData: any = {};
      
      if (updates.title) updateData.title = updates.title;
      if (updates.date) updateData.date = updates.date.toISOString();
      if (updates.location) updateData.location = updates.location;
      if (updates.city !== undefined) updateData.city = updates.city;
      if (updates.story) updateData.story = updates.story;
      if (updates.guests !== undefined) updateData.guests_count = updates.guests;
      if (updates.budget !== undefined) updateData.budget = updates.budget;
      if (updates.groomName !== undefined) updateData.groom_name = updates.groomName;
      if (updates.brideName !== undefined) updateData.bride_name = updates.brideName;
      if (updates.rsvpLink !== undefined) updateData.rsvp_link = updates.rsvpLink;
      if ((updates as any).invitationTitle !== undefined) updateData.invitation_title = (updates as any).invitationTitle;
      if ((updates as any).invitationImageUrl !== undefined) updateData.invitation_image_url = (updates as any).invitationImageUrl;
      if ((updates as any).receptionTime !== undefined) updateData.reception_time = (updates as any).receptionTime;
      if ((updates as any).ceremonyTime !== undefined) updateData.ceremony_time = (updates as any).ceremonyTime;
      if ((updates as any).brideParents !== undefined) updateData.bride_parents = (updates as any).brideParents;
      if ((updates as any).groomParents !== undefined) updateData.groom_parents = (updates as any).groomParents;
      if (updates.isApproved !== undefined) updateData.is_approved = updates.isApproved;

      const { data, error } = await supabase
        .from('events')
        .update(updateData)
        .eq('id', eventId)
        .select(`
          *,
          tasks (*)
        `)
        .single();

      if (error) throw error;
      invalidateEventsCache();

      return {
        id: data.id,
        title: data.title,
        date: new Date(data.date),
        location: data.location,
        city: data.city || '',
        story: data.story || '',
        guests: data.guests_count || 0,
        budget: Number(data.budget) || 0,
        groomName: (data as any).groom_name ?? undefined,
        brideName: (data as any).bride_name ?? undefined,
        rsvpLink: (data as any).rsvp_link ?? undefined,
        invitationTitle: (data as any).invitation_title ?? undefined,
        invitationImageUrl: (data as any).invitation_image_url ?? undefined,
        receptionTime: (data as any).reception_time ?? undefined,
        ceremonyTime: (data as any).ceremony_time ?? undefined,
        brideParents: (data as any).bride_parents ?? undefined,
        groomParents: (data as any).groom_parents ?? undefined,
        isApproved: (data as any).is_approved ?? undefined,
        tasks: data.tasks.map((task: any) => ({
          id: task.id,
          title: task.title,
          completed: task.completed,
          dueDate: new Date(task.due_date),
        })) || [],
      };
    } catch (error) {
      console.error('Update event error:', error);
      throw error;
    }
  },

  // Delete event
  deleteEvent: async (eventId: string): Promise<void> => {
    try {
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId);

      if (error) throw error;
      invalidateEventsCache();
    } catch (error) {
      console.error('Delete event error:', error);
      throw error;
    }
  },

  // Add task to event
  addTask: async (eventId: string, task: Omit<Task, 'id'>): Promise<Task> => {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          event_id: eventId,
          title: task.title,
          completed: task.completed,
          due_date: task.dueDate.toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        title: data.title,
        completed: data.completed,
        dueDate: new Date(data.due_date),
      };
    } catch (error) {
      console.error('Add task error:', error);
      throw error;
    }
  },

  // Update task
  updateTask: async (taskId: string, updates: Partial<Omit<Task, 'id'>>): Promise<Task> => {
    try {
      const updateData: any = {};
      
      if (updates.title) updateData.title = updates.title;
      if (updates.completed !== undefined) updateData.completed = updates.completed;
      if (updates.dueDate) updateData.due_date = updates.dueDate.toISOString();

      const { data, error } = await supabase
        .from('tasks')
        .update(updateData)
        .eq('id', taskId)
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        title: data.title,
        completed: data.completed,
        dueDate: new Date(data.due_date),
      };
    } catch (error) {
      console.error('Update task error:', error);
      throw error;
    }
  },

  // Delete task
  deleteTask: async (taskId: string): Promise<void> => {
    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId);

      if (error) throw error;
    } catch (error) {
      console.error('Delete task error:', error);
      throw error;
    }
  },
}; 