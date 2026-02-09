import { supabase } from '../supabase';
import { Event, Task } from '@/types';

export const eventService = {
  // Get all events for current user
  getEvents: async (): Promise<Event[]> => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select(`
          *,
          tasks (*),
          users (name)
        `)
        .order('date', { ascending: true });

      if (error) throw error;

      return data.map(event => ({
        id: event.id,
        title: event.title,
        date: new Date(event.date),
        location: event.location,
        city: event.city || '',
        story: event.story || '',
        guests: event.guests_count || 0,
        budget: Number(event.budget) || 0,
        groomName: (event as any).groom_name ?? undefined,
        brideName: (event as any).bride_name ?? undefined,
        rsvpLink: (event as any).rsvp_link ?? undefined,
        user_id: event.user_id,
        userName: (event as any)?.users?.name ?? undefined,
        tasks: event.tasks.map((task: any) => ({
          id: task.id,
          title: task.title,
          completed: task.completed,
          dueDate: new Date(task.due_date),
        })) || [],
      }));
    } catch (error) {
      console.error('Get events error:', error);
      throw error;
    }
  },

  // Get single event by ID
  getEvent: async (eventId: string): Promise<Event | null> => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select(`
          *,
          tasks (*),
          users (name)
        `)
        .eq('id', eventId)
        .single();

      if (error) throw error;
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
        user_id: data.user_id, // הוסף את user_id
        userName: (data as any)?.users?.name ?? undefined,
        tasks: data.tasks.map((task: any) => ({
          id: task.id,
          title: task.title,
          completed: task.completed,
          dueDate: new Date(task.due_date),
        })) || [],
      };
    } catch (error) {
      console.error('Get event error:', error);
      throw error;
    }
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
      if (eventData.groomName !== undefined) insertData.groom_name = eventData.groomName;
      if (eventData.brideName !== undefined) insertData.bride_name = eventData.brideName;
      if (eventData.rsvpLink !== undefined) insertData.rsvp_link = eventData.rsvpLink;

      const { data, error } = await supabase
        .from('events')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

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
        tasks: [],
      };
    } catch (error) {
      console.error('Create event error:', error);
      throw error;
    }
  },

  // Create new event for a specific user (admin)
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
      };
      if (eventData.groomName !== undefined) insertData.groom_name = eventData.groomName;
      if (eventData.brideName !== undefined) insertData.bride_name = eventData.brideName;
      if (eventData.rsvpLink !== undefined) insertData.rsvp_link = eventData.rsvpLink;

      const { data, error } = await supabase
        .from('events')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

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
        tasks: [],
      };
    } catch (error) {
      console.error('Create event for user error:', error);
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