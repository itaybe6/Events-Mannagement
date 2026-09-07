export type CoupleReportGuest = {
  id?: string;
  name: string;
  phone?: string | null;
  status?: string | null;
  category_id?: string | null;
  tableId?: string | null;
  numberOfPeople?: number | null;
  checkedIn?: boolean;
  checkedInAt?: Date | string | null;
  checkedInCount?: number | null;
};

export type CoupleReportCategory = {
  id: string;
  name: string;
  side?: 'groom' | 'bride' | null;
};

export type CoupleReportTable = {
  id: string;
  number?: number | null;
  name?: string | null;
};

export type RsvpBucket = 'confirmed' | 'declined' | 'pending' | 'maybe';

export const RSVP_BUCKET_LABELS: Record<RsvpBucket, string> = {
  confirmed: 'אישרו הגעה',
  declined: 'לא אישרו',
  pending: 'ממתינים',
  maybe: 'אולי',
};

export function rsvpBucket(status?: string | null): RsvpBucket {
  const value = String(status ?? '').trim();
  if (value === 'מגיע') return 'confirmed';
  if (value === 'אולי מגיע') return 'maybe';
  if (value === 'לא מגיע' || value === 'לא מגיעים') return 'declined';
  return 'pending';
}

export function rsvpBucketLabel(status?: string | null): string {
  return RSVP_BUCKET_LABELS[rsvpBucket(status)];
}

export function isConfirmedGuest(guest: Pick<CoupleReportGuest, 'status'>): boolean {
  return rsvpBucket(guest.status) === 'confirmed';
}

export function invitedPeople(guest: Pick<CoupleReportGuest, 'numberOfPeople'>): number {
  return Math.max(1, Number(guest.numberOfPeople) || 1);
}

export function arrivedPeople(guest: Pick<CoupleReportGuest, 'checkedIn' | 'checkedInCount' | 'numberOfPeople'>): number {
  if (!guest.checkedIn) return 0;
  const invited = invitedPeople(guest);
  const actual =
    guest.checkedInCount === null || guest.checkedInCount === undefined ? null : Number(guest.checkedInCount);
  const n = actual !== null && Number.isFinite(actual) ? actual : invited;
  return Math.max(0, n);
}

export type CheckInFilter = 'all' | 'arrived' | 'missing';
export type RsvpFilter = 'all' | RsvpBucket;
export type CoupleReportKind = 'checkin' | 'rsvp';

export type CheckInReportStats = {
  arrived: CoupleReportGuest[];
  missing: CoupleReportGuest[];
  confirmers: CoupleReportGuest[];
  arrivedCount: number;
  missingCount: number;
  confirmedCount: number;
  arrivedPeople: number;
  missingPeople: number;
  confirmedPeople: number;
  rate: number;
};

export type RsvpReportStats = {
  buckets: Record<RsvpBucket, CoupleReportGuest[]>;
  counts: Record<RsvpBucket | 'total', number>;
  invites: Record<RsvpBucket | 'total', number>;
};

export function confirmersOnly(guests: CoupleReportGuest[]): CoupleReportGuest[] {
  return guests.filter(isConfirmedGuest);
}

export function buildCheckInStats(guests: CoupleReportGuest[]): CheckInReportStats {
  const confirmers = confirmersOnly(guests);
  const arrived = confirmers.filter((guest) => Boolean(guest.checkedIn));
  const missing = confirmers.filter((guest) => !guest.checkedIn);
  const arrivedPeopleCount = arrived.reduce((sum, guest) => sum + arrivedPeople(guest), 0);
  const missingPeopleCount = missing.reduce((sum, guest) => sum + invitedPeople(guest), 0);
  const confirmedPeople = confirmers.reduce((sum, guest) => sum + invitedPeople(guest), 0);
  return {
    arrived,
    missing,
    confirmers,
    arrivedCount: arrived.length,
    missingCount: missing.length,
    confirmedCount: confirmers.length,
    arrivedPeople: arrivedPeopleCount,
    missingPeople: missingPeopleCount,
    confirmedPeople,
    rate: confirmedPeople > 0 ? Math.round((arrivedPeopleCount / confirmedPeople) * 100) : 0,
  };
}

export function buildRsvpStats(guests: CoupleReportGuest[]): RsvpReportStats {
  const buckets: Record<RsvpBucket, CoupleReportGuest[]> = {
    confirmed: [],
    declined: [],
    pending: [],
    maybe: [],
  };
  for (const guest of guests) buckets[rsvpBucket(guest.status)].push(guest);
  const people = (rows: CoupleReportGuest[]) => rows.reduce((sum, guest) => sum + invitedPeople(guest), 0);
  return {
    buckets,
    counts: {
      confirmed: people(buckets.confirmed),
      declined: people(buckets.declined),
      pending: people(buckets.pending),
      maybe: people(buckets.maybe),
      total: people(guests),
    },
    invites: {
      confirmed: buckets.confirmed.length,
      declined: buckets.declined.length,
      pending: buckets.pending.length,
      maybe: buckets.maybe.length,
      total: guests.length,
    },
  };
}

export function filterCoupleReportGuests(
  guests: CoupleReportGuest[],
  opts: {
    kind: CoupleReportKind;
    query?: string;
    checkInFilter?: CheckInFilter;
    rsvpFilter?: RsvpFilter;
    matchesSearch?: (guest: CoupleReportGuest, query: string) => boolean;
  }
): CoupleReportGuest[] {
  const query = String(opts.query ?? '').trim();
  const source = opts.kind === 'checkin' ? confirmersOnly(guests) : guests;
  const matchesSearch = opts.matchesSearch;
  return source.filter((guest) => {
    if (query && matchesSearch && !matchesSearch(guest, query)) return false;
    if (query && !matchesSearch) {
      const name = String(guest.name ?? '').toLowerCase();
      const phone = String(guest.phone ?? '');
      if (!name.includes(query.toLowerCase()) && !phone.includes(query)) return false;
    }
    if (opts.kind === 'checkin') {
      if (opts.checkInFilter === 'arrived') return Boolean(guest.checkedIn);
      if (opts.checkInFilter === 'missing') return !guest.checkedIn;
      return true;
    }
    if (!opts.rsvpFilter || opts.rsvpFilter === 'all') return true;
    return rsvpBucket(guest.status) === opts.rsvpFilter;
  });
}
