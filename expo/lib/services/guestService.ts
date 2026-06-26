import { supabase } from '../supabase';
import { Guest } from '@/types';

/**
 * Maximum number of guests allowed on an event that has NOT been approved yet.
 * Self-signup events start unapproved; once MOON staff approves the event, the limit is lifted.
 */
export const UNAPPROVED_EVENT_GUEST_LIMIT = 10;

/**
 * Error message (Hebrew) surfaced when the unapproved-event guest limit is reached.
 * Callers can match against this to display a localized alert to users.
 */
export const UNAPPROVED_EVENT_GUEST_LIMIT_ERROR =
  'האירוע עדיין ממתין לאישור. ניתן להזין עד 10 מוזמנים בלבד עד שצוות MOON יאשר את האירוע.';

export const DUPLICATE_GUEST_ERROR =
  'המוזמן כבר קיים באירוע לפי מספר טלפון.';

export const GUEST_DELETE_FAILED_ERROR =
  'לא ניתן למחוק את האורח. נסו לרענן את הדף ולנסות שוב.';

export function normalizeGuestNameForDuplicate(name: string): string {
  return String(name || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/["'׳״.,:;!?()[\]{}<>_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export function getPhoneDuplicateKeys(phone: string): string[] {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return [];

  const keys = new Set<string>([digits]);
  if (digits.startsWith('00972') && digits.length > 5) {
    const local = `0${digits.slice(5)}`;
    keys.add(local);
    keys.add(`972${local.slice(1)}`);
  }
  if (digits.startsWith('972') && digits.length > 3) {
    const local = `0${digits.slice(3)}`;
    keys.add(local);
    keys.add(`972${local.slice(1)}`);
  }
  if (digits.startsWith('0') && digits.length > 1) {
    keys.add(`972${digits.slice(1)}`);
  }

  return Array.from(keys);
}

function hasSharedPhoneKey(a: string, b: string): boolean {
  const aKeys = new Set(getPhoneDuplicateKeys(a));
  if (aKeys.size === 0) return false;
  return getPhoneDuplicateKeys(b).some((key) => aKeys.has(key));
}

type ExistingGuestRow = { id?: string; name?: string | null; phone?: string | null };

function isDuplicateGuestCandidate(
  guest: Pick<Guest, 'name' | 'phone'>,
  existingRows: ExistingGuestRow[],
  excludeGuestId?: string
): boolean {
  const nextPhone = String(guest.phone || '').trim();
  // Only check by phone. If there's no phone we can't determine a duplicate.
  if (getPhoneDuplicateKeys(nextPhone).length === 0) return false;

  return existingRows.some((row) => {
    if (excludeGuestId && String(row?.id) === String(excludeGuestId)) return false;
    const existingPhone = String(row?.phone ?? '');
    return hasSharedPhoneKey(nextPhone, existingPhone);
  });
}

async function fetchExistingGuestsForDuplicateCheck(eventId: string): Promise<ExistingGuestRow[]> {
  const { data, error } = await supabase
    .from('guests')
    .select('id, name, phone')
    .eq('event_id', eventId);

  if (error) throw error;
  return ((data as ExistingGuestRow[]) || []);
}

async function ensureGuestIsUniqueForEvent(
  eventId: string,
  guest: Pick<Guest, 'name' | 'phone'>,
  excludeGuestId?: string,
  existingRows?: ExistingGuestRow[]
): Promise<void> {
  if (!eventId) return;

  const rows = existingRows ?? (await fetchExistingGuestsForDuplicateCheck(eventId));
  if (isDuplicateGuestCandidate(guest, rows, excludeGuestId)) {
    throw new Error(DUPLICATE_GUEST_ERROR);
  }
}

async function ensureUnapprovedEventGuestLimit(eventId: string): Promise<void> {
  if (!eventId) return;
  try {
    const { data: eventRow, error: eventErr } = await supabase
      .from('events')
      .select('is_approved')
      .eq('id', eventId)
      .maybeSingle();

    if (eventErr) {
      // Fail open: if we can't read the flag, don't block the user.
      return;
    }
    // If column hasn't been migrated yet we treat it as approved.
    const isApproved = (eventRow as any)?.is_approved;
    if (isApproved !== false) return;

    const { count, error: countErr } = await supabase
      .from('guests')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId);
    if (countErr) return;

    if ((count ?? 0) >= UNAPPROVED_EVENT_GUEST_LIMIT) {
      throw new Error(UNAPPROVED_EVENT_GUEST_LIMIT_ERROR);
    }
  } catch (e) {
    if (e instanceof Error && e.message === UNAPPROVED_EVENT_GUEST_LIMIT_ERROR) throw e;
    // Any other error is treated as "fail open" to avoid blocking normal usage.
  }
}

export type EventGuestPeopleStats = {
  invitedPeople: number;
  comingPeople: number;
  seatedPeople: number;
};

export const guestService = {
  /**
   * People-based guest aggregates for one or more events.
   * Paginates through all guest rows (Supabase defaults to 1000 rows per request).
   */
  getGuestPeopleStatsByEventIds: async (eventIds: string[]): Promise<Record<string, EventGuestPeopleStats>> => {
    const cleanIds = [...new Set(eventIds.map((id) => String(id || '').trim()).filter(Boolean))];
    if (!cleanIds.length) return {};

    const next: Record<string, EventGuestPeopleStats> = {};
    const pageSize = 1000;

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from('guests')
        .select('event_id,status,number_of_people,table_id')
        .in('event_id', cleanIds)
        .range(from, from + pageSize - 1);

      if (error) throw error;

      const rows = data || [];
      for (const row of rows) {
        const eventId = String((row as any)?.event_id ?? '').trim();
        if (!eventId) continue;

        const people = Number((row as any)?.number_of_people) || 1;
        const status = String((row as any)?.status ?? '').trim();
        const hasTable = Boolean((row as any)?.table_id);

        const prev = next[eventId] || { invitedPeople: 0, comingPeople: 0, seatedPeople: 0 };
        prev.invitedPeople += people;
        if (status === 'מגיע') prev.comingPeople += people;
        if (hasTable) prev.seatedPeople += people;
        next[eventId] = prev;
      }

      if (rows.length < pageSize) break;
    }

    return next;
  },

  // Get all guests for an event
  getGuests: async (eventId: string): Promise<Guest[]> => {
    try {
      const { data, error } = await supabase
        .from('guests')
        .select('*')
        .eq('event_id', eventId)
        .order('name');

      if (error) throw error;

      return data.map(guest => ({
        id: guest.id,
        name: guest.name,
        phone: guest.phone || '',
        status: guest.status as Guest['status'],
        tableId: guest.table_id,
        gift: Number(guest.gift_amount) || 0,
        message: guest.message || '',
        category_id: guest.category_id,
        numberOfPeople: guest.number_of_people || 1,
        invitationToken: (guest as any).invitation_token ? String((guest as any).invitation_token) : undefined,
        invitationCode: (guest as any).invitation_code ? String((guest as any).invitation_code) : undefined,
        checkedIn: Boolean((guest as any).checked_in),
        checkedInAt: (guest as any).checked_in_at ? new Date((guest as any).checked_in_at) : null,
        checkedInCount:
          (guest as any).checked_in_count === null || (guest as any).checked_in_count === undefined
            ? null
            : Number((guest as any).checked_in_count) || 0,
      }));
    } catch (error) {
      console.error('Get guests error:', error);
      throw error;
    }
  },

  /**
   * Returns the set of guest IDs (for the given event) that have received at least
   * one successfully sent message.
   *
   * Combines both messaging sources via the `get_event_messaged_guest_ids` RPC:
   *   - automatic notifications (scheduled_notification_sms_run_recipients, status 'sent')
   *   - invitation/other SMS logged in `messages` (status starting with 'נשלח', matched by phone)
   *
   * Fails open (returns an empty set) on error so callers never break.
   */
  getMessagedGuestIds: async (eventId: string): Promise<Set<string>> => {
    const result = new Set<string>();
    if (!eventId) return result;

    try {
      const { data, error } = await supabase.rpc('get_event_messaged_guest_ids', {
        p_event_id: eventId,
      });
      if (error) throw error;

      for (const row of (data as any[]) || []) {
        const guestId = typeof row === 'string' ? row : String((row as any)?.guest_id ?? (row as any)?.id ?? row ?? '');
        const trimmed = guestId.trim();
        if (trimmed) result.add(trimmed);
      }
    } catch (error) {
      console.warn('getMessagedGuestIds error:', error);
    }

    return result;
  },

  /**
   * Lightweight aggregate stats for the couple home screen.
   *
   * Instead of pulling every guest row with `select('*')` (which on large events
   * is the main reason the home screen feels slow to load), we fetch only the
   * columns required to compute the dashboard numbers and reduce them once.
   * Status counts (`coming`, `maybe`, `pending`, `declined`) are people totals
   * (sum of `number_of_people`), matching the donut center (`confirmedPeople`).
   */
  getEventGuestStats: async (
    eventId: string
  ): Promise<{
    inviteCount: number;
    coming: number;
    maybe: number;
    pending: number;
    declined: number;
    confirmedPeople: number;
    seatedPeople: number;
  }> => {
    const empty = {
      inviteCount: 0,
      coming: 0,
      maybe: 0,
      pending: 0,
      declined: 0,
      confirmedPeople: 0,
      seatedPeople: 0,
    };

    try {
      const cleanId = String(eventId || '').trim();
      if (!cleanId) return empty;

      const { data, error } = await supabase
        .from('guests')
        .select('status, number_of_people, table_id')
        .eq('event_id', cleanId);

      if (error) throw error;

      const rows = data || [];
      let coming = 0;
      let maybe = 0;
      let pending = 0;
      let declined = 0;
      let confirmedPeople = 0;
      let seatedPeople = 0;

      for (const row of rows) {
        const status = (row as any).status;
        const people = Number((row as any).number_of_people ?? 1) || 1;
        const hasTable = String((row as any).table_id ?? '').trim().length > 0;

        if (status === 'מגיע') {
          coming += people;
          confirmedPeople += people;
          if (hasTable) seatedPeople += people;
        } else if (status === 'אולי מגיע') {
          maybe += people;
        } else if (status === 'ממתין') {
          pending += people;
        } else if (status === 'לא מגיע') {
          declined += people;
        }
      }

      return {
        inviteCount: rows.length,
        coming,
        maybe,
        pending,
        declined,
        confirmedPeople,
        seatedPeople,
      };
    } catch (error) {
      console.error('Get event guest stats error:', error);
      throw error;
    }
  },

  addGuestsBatch: async (
    eventId: string,
    guests: Array<Omit<Guest, 'id'>>,
    opts?: { existingRows?: ExistingGuestRow[] }
  ): Promise<{ added: Guest[]; duplicateSkipped: number; duplicateNames: string[] }> => {
    if (!eventId || guests.length === 0) {
      return { added: [], duplicateSkipped: 0, duplicateNames: [] };
    }

    try {
      const existingRows = opts?.existingRows ?? (await fetchExistingGuestsForDuplicateCheck(eventId));
      const knownRows = [...existingRows];
      const toInsert: Array<Omit<Guest, 'id'>> = [];
      let duplicateSkipped = 0;
      const duplicateNames: string[] = [];

      for (const guest of guests) {
        if (isDuplicateGuestCandidate(guest, knownRows)) {
          duplicateSkipped++;
          duplicateNames.push(String(guest.name || '').trim());
          continue;
        }
        toInsert.push(guest);
        knownRows.push({
          name: guest.name,
          phone: guest.phone,
        });
      }

      if (toInsert.length === 0) {
        return { added: [], duplicateSkipped, duplicateNames };
      }

      await ensureUnapprovedEventGuestLimit(eventId);

      const { count, error: countErr } = await supabase
        .from('guests')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId);
      if (countErr) throw countErr;

      const { data: eventRow, error: eventErr } = await supabase
        .from('events')
        .select('is_approved')
        .eq('id', eventId)
        .maybeSingle();
      if (eventErr) throw eventErr;

      const isApproved = (eventRow as any)?.is_approved;
      if (isApproved === false) {
        const remaining = Math.max(0, UNAPPROVED_EVENT_GUEST_LIMIT - (count ?? 0));
        if (remaining === 0) {
          throw new Error(UNAPPROVED_EVENT_GUEST_LIMIT_ERROR);
        }
        if (toInsert.length > remaining) {
          throw new Error(UNAPPROVED_EVENT_GUEST_LIMIT_ERROR);
        }
      }

      const added: Guest[] = [];
      const batchSize = 100;

      for (let i = 0; i < toInsert.length; i += batchSize) {
        const batch = toInsert.slice(i, i + batchSize);
        const { data, error } = await supabase
          .from('guests')
          .insert(
            batch.map((guest) => ({
              event_id: eventId,
              name: guest.name,
              phone: guest.phone,
              status: guest.status,
              table_id: guest.tableId,
              gift_amount: guest.gift,
              message: guest.message,
              category_id: guest.category_id,
              number_of_people: guest.numberOfPeople,
            }))
          )
          .select();

        if (error) throw error;

        for (const row of data || []) {
          added.push({
            id: row.id,
            name: row.name,
            phone: row.phone || '',
            status: row.status as Guest['status'],
            tableId: row.table_id,
            gift: Number(row.gift_amount) || 0,
            message: row.message || '',
            category_id: row.category_id,
            numberOfPeople: row.number_of_people || 1,
            invitationToken: (row as any).invitation_token ? String((row as any).invitation_token) : undefined,
            invitationCode: (row as any).invitation_code ? String((row as any).invitation_code) : undefined,
          });
        }
      }

      return { added, duplicateSkipped, duplicateNames };
    } catch (error) {
      console.error('Add guests batch error:', error);
      throw error;
    }
  },

  // Add new guest
  addGuest: async (eventId: string, guest: Omit<Guest, 'id'>): Promise<Guest> => {
    try {
      await ensureGuestIsUniqueForEvent(eventId, guest);
      await ensureUnapprovedEventGuestLimit(eventId);
      const { data, error } = await supabase
        .from('guests')
        .insert({
          event_id: eventId,
          name: guest.name,
          phone: guest.phone,
          status: guest.status,
          table_id: guest.tableId,
          gift_amount: guest.gift,
          message: guest.message,
          category_id: guest.category_id,
          number_of_people: guest.numberOfPeople,
        })
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        name: data.name,
        phone: data.phone || '',
        status: data.status as Guest['status'],
        tableId: data.table_id,
        gift: Number(data.gift_amount) || 0,
        message: data.message || '',
        category_id: data.category_id,
        numberOfPeople: data.number_of_people || 1,
        invitationToken: (data as any).invitation_token ? String((data as any).invitation_token) : undefined,
        invitationCode: (data as any).invitation_code ? String((data as any).invitation_code) : undefined,
      };
    } catch (error) {
      console.error('Add guest error:', error);
      throw error;
    }
  },

  // Update guest
  updateGuest: async (guestId: string, updates: Partial<Omit<Guest, 'id'>>): Promise<Guest> => {
    try {
      const updateData: any = {};
      let currentGuest: any = null;

      if (updates.name !== undefined || updates.phone !== undefined) {
        const { data: current, error: currentError } = await supabase
          .from('guests')
          .select('id, event_id, name, phone')
          .eq('id', guestId)
          .single();

        if (currentError) throw currentError;
        currentGuest = current;
        await ensureGuestIsUniqueForEvent(
          String((currentGuest as any)?.event_id || ''),
          {
            name: updates.name ?? String((currentGuest as any)?.name ?? ''),
            phone: updates.phone ?? String((currentGuest as any)?.phone ?? ''),
          } as Pick<Guest, 'name' | 'phone'>,
          guestId
        );
      }
      
      if (updates.name) updateData.name = updates.name;
      if (updates.phone) updateData.phone = updates.phone;
      if (updates.status) updateData.status = updates.status;
      if (updates.tableId !== undefined) updateData.table_id = updates.tableId;
      if (updates.gift !== undefined) updateData.gift_amount = updates.gift;
      if (updates.message !== undefined) updateData.message = updates.message;
      if (updates.category_id !== undefined) updateData.category_id = updates.category_id;
      if (updates.numberOfPeople !== undefined) updateData.number_of_people = updates.numberOfPeople;
      if ((updates as any).checkedIn !== undefined) updateData.checked_in = Boolean((updates as any).checkedIn);
      if ((updates as any).checkedInAt !== undefined)
        updateData.checked_in_at = (updates as any).checkedInAt
          ? (updates as any).checkedInAt
          : null;

      const { data, error } = await supabase
        .from('guests')
        .update(updateData)
        .eq('id', guestId)
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        name: data.name,
        phone: data.phone || '',
        status: data.status as Guest['status'],
        tableId: data.table_id,
        gift: Number(data.gift_amount) || 0,
        message: data.message || '',
        category_id: data.category_id,
        numberOfPeople: data.number_of_people || 1,
        invitationToken: (data as any).invitation_token ? String((data as any).invitation_token) : undefined,
        invitationCode: (data as any).invitation_code ? String((data as any).invitation_code) : undefined,
        checkedIn: Boolean((data as any).checked_in),
        checkedInAt: (data as any).checked_in_at ? new Date((data as any).checked_in_at) : null,
        checkedInCount:
          (data as any).checked_in_count === null || (data as any).checked_in_count === undefined
            ? null
            : Number((data as any).checked_in_count) || 0,
      };
    } catch (error) {
      console.error('Update guest error:', error);
      throw error;
    }
  },

  moveGuestsToCategory: async (guestIds: string[], categoryId: string): Promise<void> => {
    const ids = (guestIds || []).map(String).filter(Boolean);
    if (!ids.length) return;
    try {
      const { error } = await supabase.from('guests').update({ category_id: categoryId }).in('id', ids);
      if (error) throw error;
    } catch (error) {
      console.error('Move guests to category error:', error);
      throw error;
    }
  },

  // Delete guest
  deleteGuest: async (guestId: string): Promise<void> => {
    try {
      const { data, error } = await supabase
        .from('guests')
        .delete()
        .eq('id', guestId)
        .select('id');

      if (error) throw error;
      if (!data?.length) throw new Error(GUEST_DELETE_FAILED_ERROR);
    } catch (error) {
      console.error('Delete guest error:', error);
      throw error;
    }
  },

  // Update guest status
  updateGuestStatus: async (guestId: string, status: Guest['status']): Promise<Guest> => {
    try {
      const { data, error } = await supabase
        .from('guests')
        .update({ status })
        .eq('id', guestId)
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        name: data.name,
        phone: data.phone || '',
        status: data.status as Guest['status'],
        tableId: data.table_id,
        gift: Number(data.gift_amount) || 0,
        message: data.message || '',
        category_id: (data as any).category_id,
        numberOfPeople: (data as any).number_of_people || 1,
        invitationToken: (data as any).invitation_token ? String((data as any).invitation_token) : undefined,
        invitationCode: (data as any).invitation_code ? String((data as any).invitation_code) : undefined,
        checkedIn: Boolean((data as any).checked_in),
        checkedInAt: (data as any).checked_in_at ? new Date((data as any).checked_in_at) : null,
      };
    } catch (error) {
      console.error('Update guest status error:', error);
      throw error;
    }
  },

  // Assign guest to table
  assignGuestToTable: async (guestId: string, tableId: string | null): Promise<Guest> => {
    try {
      const { data, error } = await supabase
        .from('guests')
        .update({ table_id: tableId })
        .eq('id', guestId)
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        name: data.name,
        phone: data.phone || '',
        status: data.status as Guest['status'],
        tableId: data.table_id,
        gift: Number(data.gift_amount) || 0,
        message: data.message || '',
        category_id: (data as any).category_id,
        numberOfPeople: (data as any).number_of_people || 1,
        invitationToken: (data as any).invitation_token ? String((data as any).invitation_token) : undefined,
        invitationCode: (data as any).invitation_code ? String((data as any).invitation_code) : undefined,
        checkedIn: Boolean((data as any).checked_in),
        checkedInAt: (data as any).checked_in_at ? new Date((data as any).checked_in_at) : null,
      };
    } catch (error) {
      console.error('Assign guest to table error:', error);
      throw error;
    }
  },

  // Check-in (arrival to venue)
  setGuestCheckedIn: async (guestId: string, checkedIn: boolean, opts?: { checkedInCount?: number | null }): Promise<Guest> => {
    try {
      const payload: any = {
        checked_in: Boolean(checkedIn),
        checked_in_at: checkedIn ? new Date().toISOString() : null,
      };
      if (checkedIn) {
        if (opts?.checkedInCount !== undefined) payload.checked_in_count = opts.checkedInCount;
      } else {
        // When un-checking, clear the actual arrived count.
        payload.checked_in_count = null;
      }

      const { data, error } = await supabase
        .from('guests')
        .update(payload)
        .eq('id', guestId)
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        name: data.name,
        phone: data.phone || '',
        status: data.status as Guest['status'],
        tableId: data.table_id,
        gift: Number(data.gift_amount) || 0,
        message: data.message || '',
        category_id: data.category_id,
        numberOfPeople: data.number_of_people || 1,
        invitationToken: (data as any).invitation_token ? String((data as any).invitation_token) : undefined,
        invitationCode: (data as any).invitation_code ? String((data as any).invitation_code) : undefined,
        checkedIn: Boolean((data as any).checked_in),
        checkedInAt: (data as any).checked_in_at ? new Date((data as any).checked_in_at) : null,
        checkedInCount:
          (data as any).checked_in_count === null || (data as any).checked_in_count === undefined
            ? null
            : Number((data as any).checked_in_count) || 0,
      };
    } catch (error) {
      console.error('Set guest checked-in error:', error);
      throw error;
    }
  },

  setGuestCheckedInCount: async (guestId: string, checkedInCount: number | null): Promise<Guest> => {
    try {
      const payload: any = {
        checked_in_count: checkedInCount === null ? null : Number(checkedInCount) || 0,
      };

      const { data, error } = await supabase
        .from('guests')
        .update(payload)
        .eq('id', guestId)
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        name: data.name,
        phone: data.phone || '',
        status: data.status as Guest['status'],
        tableId: data.table_id,
        gift: Number(data.gift_amount) || 0,
        message: data.message || '',
        category_id: data.category_id,
        numberOfPeople: data.number_of_people || 1,
        invitationToken: (data as any).invitation_token ? String((data as any).invitation_token) : undefined,
        invitationCode: (data as any).invitation_code ? String((data as any).invitation_code) : undefined,
        checkedIn: Boolean((data as any).checked_in),
        checkedInAt: (data as any).checked_in_at ? new Date((data as any).checked_in_at) : null,
        checkedInCount:
          (data as any).checked_in_count === null || (data as any).checked_in_count === undefined
            ? null
            : Number((data as any).checked_in_count) || 0,
      };
    } catch (error) {
      console.error('Set guest checked-in count error:', error);
      throw error;
    }
  },

  async getGuestCategories(eventId: string) {
    const { data, error } = await supabase
      .from('guest_categories')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data.map(category => ({
      id: category.id,
      name: category.name,
      event_id: category.event_id,
      side: category.side || 'groom', // ברירת מחדל לחתן
    }));
  },

  async addGuestCategory(eventId: string, name: string, side: 'groom' | 'bride' = 'groom') {
    const { data, error } = await supabase
      .from('guest_categories')
      .insert({ event_id: eventId, name, side })
      .select()
      .single();
    if (error) throw error;
    return {
      id: data.id,
      name: data.name,
      event_id: data.event_id,
      side: data.side || 'groom',
    };
  },

  async getGuestCategoriesBySide(eventId: string, side: 'groom' | 'bride') {
    const { data, error } = await supabase
      .from('guest_categories')
      .select('*')
      .eq('event_id', eventId)
      .eq('side', side)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data.map(category => ({
      id: category.id,
      name: category.name,
      event_id: category.event_id,
      side: category.side || 'groom',
    }));
  },

  async updateGuestCategory(categoryId: string, updates: { name?: string }) {
    const { data, error } = await supabase
      .from('guest_categories')
      .update(updates)
      .eq('id', categoryId)
      .select()
      .single();
    if (error) throw error;
    return {
      id: data.id,
      name: data.name,
      event_id: data.event_id,
      side: data.side || 'groom',
    };
  },

  async deleteGuestCategory(categoryId: string) {
    const { data, error } = await supabase
      .from('guest_categories')
      .delete()
      .eq('id', categoryId)
      .select('id');
    if (error) throw error;
    if (!data?.length) throw new Error(GUEST_DELETE_FAILED_ERROR);
  },

  async deleteGuestCategoryWithGuests(categoryId: string) {
    const { error: guestsError } = await supabase
      .from('guests')
      .delete()
      .eq('category_id', categoryId);
    if (guestsError) throw guestsError;

    const { data, error: categoryError } = await supabase
      .from('guest_categories')
      .delete()
      .eq('id', categoryId)
      .select('id');
    if (categoryError) throw categoryError;
    if (!data?.length) throw new Error(GUEST_DELETE_FAILED_ERROR);
  },
}; 