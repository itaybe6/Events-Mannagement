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
          tasks (*)
        `)
        .order('date', { ascending: true });

      if (error) throw error;

      return data.map(event => ({
        id: event.id,
        title: event.title,
        date: new Date(event.date),
        location: event.location,
        image: event.image || '',
        story: event.story || '',
        guests: event.guests_count || 0,
        budget: Number(event.budget) || 0,
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
          tasks (*)
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
        image: data.image || '',
        story: data.story || '',
        guests: data.guests_count || 0,
        budget: Number(data.budget) || 0,
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

      const { data, error } = await supabase
        .from('events')
        .insert({
          user_id: user.id,
          title: eventData.title,
          date: eventData.date.toISOString(),
          location: eventData.location,
          image: eventData.image,
          story: eventData.story,
          guests_count: eventData.guests,
          budget: eventData.budget,
        })
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        title: data.title,
        date: new Date(data.date),
        location: data.location,
        image: data.image || '',
        story: data.story || '',
        guests: data.guests_count || 0,
        budget: Number(data.budget) || 0,
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
      const { data, error } = await supabase
        .from('events')
        .insert({
          user_id: userId,
          title: eventData.title,
          date: eventData.date.toISOString(),
          location: eventData.location,
          image: eventData.image,
          story: eventData.story,
          guests_count: eventData.guests,
          budget: eventData.budget,
        })
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        title: data.title,
        date: new Date(data.date),
        location: data.location,
        image: data.image || '',
        story: data.story || '',
        guests: data.guests_count || 0,
        budget: Number(data.budget) || 0,
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
      if (updates.image) updateData.image = updates.image;
      if (updates.story) updateData.story = updates.story;
      if (updates.guests !== undefined) updateData.guests_count = updates.guests;
      if (updates.budget !== undefined) updateData.budget = updates.budget;

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
        image: data.image || '',
        story: data.story || '',
        guests: data.guests_count || 0,
        budget: Number(data.budget) || 0,
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