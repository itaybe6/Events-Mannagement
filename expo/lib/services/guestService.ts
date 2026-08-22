import { supabase } from '../supabase';
import { Guest } from '@/types';
import { normalizeGuestPhone } from '../guestPhone';
import { cachedQuery } from '../queryCache';

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
  const digits = normalizeGuestPhone(phone);
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

function withNormalizedPhone<T extends { phone?: string | null }>(guest: T): T {
  if (guest.phone === undefined) return guest;
  return { ...guest, phone: normalizeGuestPhone(guest.phone) };
}

type ExistingGuestRow = { id?: string; name?: string | null; phone?: string | null };

function isDuplicateGuestCandidate(
  guest: Pick<Guest, 'name' | 'phone'>,
  existingRows: ExistingGuestRow[],
  excludeGuestId?: string
): boolean {
  const nextPhone = normalizeGuestPhone(guest.phone);
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

/** PostgREST caps a single response at 1000 rows. */
const PAGE_SIZE = 1000;

/**
 * Columns the check-in screen actually renders. Selecting these instead of `*`
 * cuts the payload for a 750-guest event from ~520KB to ~200KB, which matters a
 * lot on venue wifi.
 */
const CHECK_IN_COLUMNS =
  'id,event_id,name,phone,status,table_id,number_of_people,category_id,checked_in,checked_in_at,checked_in_count,updated_at';

/**
 * Reads every row matching a query, fetching the pages after the first one in
 * parallel. Round-trip latency to Supabase is ~450ms, so paging sequentially
 * costs a full extra half-second per page; the exact count from the first
 * response tells us how many pages to request at once.
 *
 * It also fixes silent truncation: an unpaginated read stops at 1000 rows, so
 * events larger than that were losing guests.
 */
async function fetchAllRows<T>(
  buildQuery: () => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown; count?: number | null }> }
): Promise<T[]> {
  const first = await buildQuery().range(0, PAGE_SIZE - 1);
  if (first.error) throw first.error;

  const firstRows = (first.data || []) as T[];
  const total = typeof first.count === 'number' ? first.count : firstRows.length;
  if (total <= PAGE_SIZE || firstRows.length < PAGE_SIZE) return firstRows;

  const offsets: number[] = [];
  for (let from = PAGE_SIZE; from < total; from += PAGE_SIZE) offsets.push(from);

  const pages = await Promise.all(
    offsets.map(async (from) => {
      const res = await buildQuery().range(from, from + PAGE_SIZE - 1);
      if (res.error) throw res.error;
      return (res.data || []) as T[];
    })
  );

  return firstRows.concat(...pages);
}

export function mapGuestRowFromDb(guest: Record<string, unknown>): Guest {
  return {
    id: String(guest.id),
    name: String(guest.name ?? ''),
    phone: String(guest.phone ?? '') || '',
    status: guest.status as Guest['status'],
    tableId: (guest.table_id as string | null) ?? null,
    gift: Number(guest.gift_amount) || 0,
    message: String(guest.message ?? '') || '',
    category_id: guest.category_id as string | undefined,
    numberOfPeople: Number(guest.number_of_people) || 1,
    invitationToken: guest.invitation_token ? String(guest.invitation_token) : undefined,
    invitationCode: guest.invitation_code ? String(guest.invitation_code) : undefined,
    checkedIn: Boolean(guest.checked_in),
    checkedInAt: guest.checked_in_at ? new Date(String(guest.checked_in_at)) : null,
    checkedInCount:
      guest.checked_in_count === null || guest.checked_in_count === undefined
        ? null
        : Number(guest.checked_in_count) || 0,
  };
}

export const guestService = {
  /**
   * People-based guest aggregates for one or more events.
   *
   * Prefers the `get_events_guest_people_stats` RPC, which sums in the database
   * and returns one row per event. Downloading the raw guest rows to add them up
   * on the client meant ~4k rows / ~540KB spread over several sequential
   * requests just to render a handful of numbers on the events list.
   *
   * Falls back to the client-side reduction when the RPC is missing, so the app
   * keeps working on databases where the migration hasn't been applied yet.
   */
  getGuestPeopleStatsByEventIds: async (eventIds: string[]): Promise<Record<string, EventGuestPeopleStats>> => {
    const cleanIds = [...new Set(eventIds.map((id) => String(id || '').trim()).filter(Boolean))];
    if (!cleanIds.length) return {};

    const next: Record<string, EventGuestPeopleStats> = {};

    const { data: rpcRows, error: rpcError } = await supabase.rpc('get_events_guest_people_stats', {
      p_event_ids: cleanIds,
    });

    if (!rpcError && Array.isArray(rpcRows)) {
      for (const row of rpcRows as any[]) {
        const eventId = String(row?.event_id ?? '').trim();
        if (!eventId) continue;
        next[eventId] = {
          invitedPeople: Number(row?.invited_people) || 0,
          comingPeople: Number(row?.coming_people) || 0,
          seatedPeople: Number(row?.seated_people) || 0,
        };
      }
      return next;
    }

    const rows = await fetchAllRows<Record<string, unknown>>(() =>
      supabase
        .from('guests')
        .select('event_id,status,number_of_people,table_id', { count: 'exact' })
        .in('event_id', cleanIds)
    );

    for (const row of rows) {
      const eventId = String(row?.event_id ?? '').trim();
      if (!eventId) continue;

      const people = Number(row?.number_of_people) || 1;
      const status = String(row?.status ?? '').trim();
      const hasTable = Boolean(row?.table_id);

      const prev = next[eventId] || { invitedPeople: 0, comingPeople: 0, seatedPeople: 0 };
      prev.invitedPeople += people;
      if (status === 'מגיע') prev.comingPeople += people;
      if (hasTable) prev.seatedPeople += people;
      next[eventId] = prev;
    }

    return next;
  },

  /**
   * Same aggregates as `getGuestPeopleStatsByEventIds`, for every event the
   * caller can see. Lets the events list start this request on mount instead of
   * waiting for the event list to arrive first, which saves a full round trip.
   */
  getGuestPeopleStatsForAllEvents: async (): Promise<Record<string, EventGuestPeopleStats>> => {
    const next: Record<string, EventGuestPeopleStats> = {};

    const { data: rpcRows, error: rpcError } = await supabase.rpc('get_events_guest_people_stats', {
      p_event_ids: null,
    });

    if (!rpcError && Array.isArray(rpcRows)) {
      for (const row of rpcRows as any[]) {
        const eventId = String(row?.event_id ?? '').trim();
        if (!eventId) continue;
        next[eventId] = {
          invitedPeople: Number(row?.invited_people) || 0,
          comingPeople: Number(row?.coming_people) || 0,
          seatedPeople: Number(row?.seated_people) || 0,
        };
      }
      return next;
    }

    const rows = await fetchAllRows<Record<string, unknown>>(() =>
      supabase.from('guests').select('event_id,status,number_of_people,table_id', { count: 'exact' })
    );

    for (const row of rows) {
      const eventId = String(row?.event_id ?? '').trim();
      if (!eventId) continue;

      const people = Number(row?.number_of_people) || 1;
      const prev = next[eventId] || { invitedPeople: 0, comingPeople: 0, seatedPeople: 0 };
      prev.invitedPeople += people;
      if (String(row?.status ?? '').trim() === 'מגיע') prev.comingPeople += people;
      if (row?.table_id) prev.seatedPeople += people;
      next[eventId] = prev;
    }

    return next;
  },

  // Get all guests for an event
  getGuests: async (eventId: string): Promise<Guest[]> => {
    try {
      const rows = await fetchAllRows<Record<string, unknown>>(() =>
        supabase.from('guests').select('*', { count: 'exact' }).eq('event_id', eventId).order('name')
      );

      return rows.map((guest) => mapGuestRowFromDb(guest));
    } catch (error) {
      console.error('Get guests error:', error);
      throw error;
    }
  },

  /**
   * Guest list trimmed to the columns the check-in screen renders.
   * See CHECK_IN_COLUMNS for why this exists separately from `getGuests`.
   * `latestUpdatedAt` seeds the incremental sync watermark.
   */
  getGuestsForCheckIn: async (
    eventId: string,
    opts?: { force?: boolean }
  ): Promise<{ guests: Guest[]; latestUpdatedAt: string | null }> => {
    return cachedQuery(
      `guests:checkin:${eventId}`,
      async () => {
        const rows = await fetchAllRows<Record<string, unknown>>(() =>
          supabase.from('guests').select(CHECK_IN_COLUMNS, { count: 'exact' }).eq('event_id', eventId).order('name')
        );

        let latestUpdatedAt: string | null = null;
        for (const row of rows) {
          const updatedAt = String(row?.updated_at ?? '');
          if (updatedAt && (!latestUpdatedAt || updatedAt > latestUpdatedAt)) latestUpdatedAt = updatedAt;
        }

        return { guests: rows.map((guest) => mapGuestRowFromDb(guest)), latestUpdatedAt };
      },
      { maxAgeMs: 10_000, force: opts?.force }
    );
  },

  /** Cheap row count used to detect guests added/removed by other stations. */
  getGuestCount: async (eventId: string): Promise<number> => {
    const { count, error } = await supabase
      .from('guests')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId);

    if (error) throw error;
    return count ?? 0;
  },

  /**
   * Guests touched at or after `since`, used by the check-in screen to stay in
   * sync with other usher stations without re-downloading the whole list.
   * Returns the rows plus the newest `updated_at` seen, which becomes the
   * watermark for the next call.
   *
   * The bound is inclusive so rows sharing the watermark's exact timestamp are
   * never skipped; callers merge by id, so re-sending a row is harmless.
   */
  getGuestsUpdatedSince: async (
    eventId: string,
    since: string
  ): Promise<{ guests: Guest[]; latestUpdatedAt: string | null }> => {
    const { data, error } = await supabase
      .from('guests')
      .select(CHECK_IN_COLUMNS)
      .eq('event_id', eventId)
      .gte('updated_at', since)
      .order('updated_at', { ascending: true })
      .limit(PAGE_SIZE);

    if (error) throw error;

    const rows = (data || []) as Record<string, unknown>[];
    const latestUpdatedAt = rows.length ? String(rows[rows.length - 1]?.updated_at ?? '') || null : null;

    return { guests: rows.map((guest) => mapGuestRowFromDb(guest)), latestUpdatedAt };
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

    const cleanId = String(eventId || '').trim();
    if (!cleanId) return empty;

    return cachedQuery(
      `guests:home-stats:${cleanId}`,
      async () => {
        try {
          const { data: rpcRows, error: rpcError } = await supabase.rpc('get_event_guest_home_stats', {
            p_event_id: cleanId,
          });

          if (!rpcError && Array.isArray(rpcRows) && rpcRows[0]) {
            const row = rpcRows[0] as Record<string, unknown>;
            return {
              inviteCount: Number(row.invite_count) || 0,
              coming: Number(row.coming) || 0,
              maybe: Number(row.maybe) || 0,
              pending: Number(row.pending) || 0,
              declined: Number(row.declined) || 0,
              confirmedPeople: Number(row.confirmed_people) || 0,
              seatedPeople: Number(row.seated_people) || 0,
            };
          }

          const rows = await fetchAllRows<Record<string, unknown>>(() =>
            supabase
              .from('guests')
              .select('status, number_of_people, table_id', { count: 'exact' })
              .eq('event_id', cleanId)
          );

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
      { maxAgeMs: 15_000 }
    );
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
        const normalizedGuest = withNormalizedPhone(guest);
        if (isDuplicateGuestCandidate(normalizedGuest, knownRows)) {
          duplicateSkipped++;
          duplicateNames.push(String(normalizedGuest.name || '').trim());
          continue;
        }
        toInsert.push(normalizedGuest);
        knownRows.push({
          name: normalizedGuest.name,
          phone: normalizedGuest.phone,
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
      const normalizedGuest = withNormalizedPhone(guest);
      await ensureGuestIsUniqueForEvent(eventId, normalizedGuest);
      await ensureUnapprovedEventGuestLimit(eventId);
      const { data, error } = await supabase
        .from('guests')
        .insert({
          event_id: eventId,
          name: normalizedGuest.name,
          phone: normalizedGuest.phone,
          status: normalizedGuest.status,
          table_id: normalizedGuest.tableId,
          gift_amount: normalizedGuest.gift,
          message: normalizedGuest.message,
          category_id: normalizedGuest.category_id,
          number_of_people: normalizedGuest.numberOfPeople,
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
        const nextPhone =
          updates.phone !== undefined ? normalizeGuestPhone(updates.phone) : String((currentGuest as any)?.phone ?? '');
        await ensureGuestIsUniqueForEvent(
          String((currentGuest as any)?.event_id || ''),
          {
            name: updates.name ?? String((currentGuest as any)?.name ?? ''),
            phone: nextPhone,
          } as Pick<Guest, 'name' | 'phone'>,
          guestId
        );
      }
      
      if (updates.name) updateData.name = updates.name;
      if (updates.phone !== undefined) updateData.phone = normalizeGuestPhone(updates.phone);
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