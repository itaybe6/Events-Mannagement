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
