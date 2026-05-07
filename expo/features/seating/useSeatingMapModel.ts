import { useCallback, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type SeatingTableRow = {
  id: string;
  number: number | null;
  name: string | null;
  capacity: number;
  shape: 'square' | 'rectangle' | 'reserve' | null;
  x: number | null;
  y: number | null;
};

export type SeatingGuestRow = {
  id: string;
  name: string;
  table_id: string | null;
  number_of_people: number | null;
};

export type SeatingAnnotation = { id?: string; x?: number; y?: number; text?: string };

export function useSeatingMapModel(eventId: string | null) {
  const [loading, setLoading] = useState(true);
  const [eventTitle, setEventTitle] = useState<string>('');
  const [tables, setTables] = useState<SeatingTableRow[]>([]);
  const [guests, setGuests] = useState<SeatingGuestRow[]>([]);
  const [annotations, setAnnotations] = useState<SeatingAnnotation[]>([]);

  const refresh = useCallback(async () => {
    if (!eventId) {
      setTables([]);
      setGuests([]);
      setAnnotations([]);
      setEventTitle('');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [evRes, tablesRes, guestsRes, mapRes] = await Promise.all([
        supabase.from('events').select('title').eq('id', eventId).maybeSingle(),
        supabase
          .from('tables')
          .select('id,number,name,capacity,shape,x,y')
          .eq('event_id', eventId)
          .order('number'),
        supabase
          .from('guests')
          .select('id,name,table_id,number_of_people')
          .eq('event_id', eventId)
          .order('name'),
        supabase.from('seating_maps').select('annotations').eq('event_id', eventId).maybeSingle(),
      ]);

      if (evRes.error) throw evRes.error;
      if (tablesRes.error) throw tablesRes.error;
      if (guestsRes.error) throw guestsRes.error;

      setEventTitle(String((evRes.data as any)?.title || ''));
      setTables(((tablesRes.data as any[]) || []) as SeatingTableRow[]);
      setGuests(((guestsRes.data as any[]) || []) as SeatingGuestRow[]);
      setAnnotations(Array.isArray((mapRes.data as any)?.annotations) ? ((mapRes.data as any).annotations as SeatingAnnotation[]) : []);
    } catch (e) {
      console.error('Seating map load error:', e);
      setEventTitle('');
      setTables([]);
      setGuests([]);
      setAnnotations([]);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  const tableById = useMemo(() => new Map(tables.map((t) => [t.id, t])), [tables]);

  const sumPeople = useCallback((rows: Array<{ number_of_people: number | null }>) => {
    return rows.reduce((sum, r) => sum + (Number(r.number_of_people) || 1), 0);
  }, []);

  return {
    loading,
    eventTitle,
    tables,
    guests,
    annotations,
    tableById,
    sumPeople,
    refresh,
  };
}

