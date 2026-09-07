import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as XLSX from 'xlsx';

import { guestMatchesSearch } from './guestPhone';
import {
  arrivedPeople,
  buildCheckInStats,
  buildRsvpStats,
  filterCoupleReportGuests,
  invitedPeople,
  isConfirmedGuest,
  rsvpBucket,
  rsvpBucketLabel,
  type CoupleReportGuest,
} from './coupleReports';
import { buildCheckInReportWorkbook, buildRsvpReportWorkbook } from './exportCoupleReportsExcel';

const categories = [
  { id: 'cat-bride', name: 'משפחה', side: 'bride' as const },
  { id: 'cat-groom', name: 'חברים', side: 'groom' as const },
];

const tables = [
  { id: 't1', number: 3, name: 'שולחן 3' },
  { id: 't2', number: 8, name: 'שולחן 8' },
];

const guests: CoupleReportGuest[] = [
  {
    id: '1',
    name: 'דנה כהן',
    phone: '0521111111',
    status: 'מגיע',
    category_id: 'cat-bride',
    tableId: 't1',
    numberOfPeople: 2,
    checkedIn: true,
    checkedInAt: '2026-09-07T18:30:00.000Z',
    checkedInCount: 2,
  },
  {
    id: '2',
    name: 'יוסי לוי',
    phone: '0522222222',
    status: 'מגיע',
    category_id: 'cat-groom',
    tableId: 't2',
    numberOfPeople: 3,
    checkedIn: false,
  },
  {
    id: '3',
    name: 'מיכל אברהם',
    phone: '0523333333',
    status: 'אולי מגיע',
    category_id: 'cat-bride',
    numberOfPeople: 1,
  },
  {
    id: '4',
    name: 'רון שמש',
    phone: '0524444444',
    status: 'ממתין',
    category_id: 'cat-groom',
    numberOfPeople: 4,
  },
  {
    id: '5',
    name: 'נועה ברק',
    phone: '0525555555',
    status: 'לא מגיע',
    category_id: 'cat-bride',
    numberOfPeople: 2,
  },
  {
    id: '6',
    name: 'אורי גולן',
    phone: '0526666666',
    status: 'לא מגיעים',
    numberOfPeople: 1,
  },
];

function sheetRows(workbook: XLSX.WorkBook, name: string) {
  const sheet = workbook.Sheets[name];
  assert.ok(sheet, `missing sheet ${name}`);
  return XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: true });
}

function namesInSheet(workbook: XLSX.WorkBook, name: string) {
  return sheetRows(workbook, name)
    .slice(1)
    .map((row) => String(row[0] ?? ''))
    .filter(Boolean);
}

test('rsvp buckets map every Hebrew status the reports page uses', () => {
  assert.equal(rsvpBucket('מגיע'), 'confirmed');
  assert.equal(rsvpBucket('אולי מגיע'), 'maybe');
  assert.equal(rsvpBucket('ממתין'), 'pending');
  assert.equal(rsvpBucket('לא מגיע'), 'declined');
  assert.equal(rsvpBucket('לא מגיעים'), 'declined');
  assert.equal(rsvpBucket(''), 'pending');
  assert.equal(rsvpBucketLabel('מגיע'), 'אישרו הגעה');
  assert.equal(rsvpBucketLabel('לא מגיעים'), 'לא אישרו');
});

test('check-in counts only confirmers and uses actual arrived people', () => {
  assert.equal(isConfirmedGuest({ status: 'מגיע' }), true);
  assert.equal(isConfirmedGuest({ status: 'אולי מגיע' }), false);
  assert.equal(invitedPeople({ numberOfPeople: 0 }), 1);
  assert.equal(arrivedPeople({ checkedIn: false, numberOfPeople: 4 }), 0);
  assert.equal(arrivedPeople({ checkedIn: true, numberOfPeople: 4, checkedInCount: 2 }), 2);
  assert.equal(arrivedPeople({ checkedIn: true, numberOfPeople: 3, checkedInCount: null }), 3);

  const stats = buildCheckInStats(guests);
  assert.deepEqual(
    stats.confirmers.map((g) => g.name),
    ['דנה כהן', 'יוסי לוי']
  );
  assert.deepEqual(
    stats.arrived.map((g) => g.name),
    ['דנה כהן']
  );
  assert.deepEqual(
    stats.missing.map((g) => g.name),
    ['יוסי לוי']
  );
  assert.equal(stats.confirmedCount, 2);
  assert.equal(stats.confirmedPeople, 5);
  assert.equal(stats.arrivedPeople, 2);
  assert.equal(stats.missingPeople, 3);
  assert.equal(stats.rate, 40);
});

test('rsvp stats split confirmed / declined / pending / maybe by people', () => {
  const stats = buildRsvpStats(guests);
  assert.equal(stats.invites.confirmed, 2);
  assert.equal(stats.invites.maybe, 1);
  assert.equal(stats.invites.pending, 1);
  assert.equal(stats.invites.declined, 2);
  assert.equal(stats.invites.total, 6);
  assert.equal(stats.counts.confirmed, 5);
  assert.equal(stats.counts.maybe, 1);
  assert.equal(stats.counts.pending, 4);
  assert.equal(stats.counts.declined, 3);
  assert.equal(stats.counts.total, 13);
});

test('check-in filters stay on confirmers and ignore maybe/pending/declined', () => {
  const arrived = filterCoupleReportGuests(guests, { kind: 'checkin', checkInFilter: 'arrived' });
  const missing = filterCoupleReportGuests(guests, { kind: 'checkin', checkInFilter: 'missing' });
  const all = filterCoupleReportGuests(guests, { kind: 'checkin', checkInFilter: 'all' });

  assert.deepEqual(
    arrived.map((g) => g.name),
    ['דנה כהן']
  );
  assert.deepEqual(
    missing.map((g) => g.name),
    ['יוסי לוי']
  );
  assert.deepEqual(
    all.map((g) => g.name),
    ['דנה כהן', 'יוסי לוי']
  );
});

test('rsvp filters and search match the reports page', () => {
  const confirmed = filterCoupleReportGuests(guests, { kind: 'rsvp', rsvpFilter: 'confirmed' });
  const declined = filterCoupleReportGuests(guests, { kind: 'rsvp', rsvpFilter: 'declined' });
  const pending = filterCoupleReportGuests(guests, { kind: 'rsvp', rsvpFilter: 'pending' });
  const maybe = filterCoupleReportGuests(guests, { kind: 'rsvp', rsvpFilter: 'maybe' });
  const search = filterCoupleReportGuests(guests, {
    kind: 'rsvp',
    rsvpFilter: 'all',
    query: '052-222-2222',
    matchesSearch: guestMatchesSearch,
  });

  assert.deepEqual(
    confirmed.map((g) => g.name),
    ['דנה כהן', 'יוסי לוי']
  );
  assert.deepEqual(
    declined.map((g) => g.name),
    ['נועה ברק', 'אורי גולן']
  );
  assert.deepEqual(
    pending.map((g) => g.name),
    ['רון שמש']
  );
  assert.deepEqual(
    maybe.map((g) => g.name),
    ['מיכל אברהם']
  );
  assert.deepEqual(
    search.map((g) => g.name),
    ['יוסי לוי']
  );
});

test('check-in excel includes only confirmers on arrived / missing sheets', () => {
  const built = buildCheckInReportWorkbook(guests, {
    eventTitle: 'חתונת דנה ויוסי',
    categories,
    tables,
  });

  assert.deepEqual(built.workbook.SheetNames, ['סיכום', 'הגיעו', 'לא הגיעו']);
  assert.match(built.fileName, /^דוח-צק-אין-חתונת-דנה-ויוסי-\d{4}-\d{2}-\d{2}\.xlsx$/);
  assert.equal(built.confirmers, 2);
  assert.equal(built.arrived, 1);
  assert.equal(built.missing, 1);

  const summary = sheetRows(built.workbook, 'סיכום');
  const summaryMap = Object.fromEntries(summary.slice(1).map((row) => [String(row[0]), row[1]]));
  assert.equal(summaryMap['מאשרים (הזמנות)'], 2);
  assert.equal(summaryMap['מאשרים (אורחים)'], 5);
  assert.equal(summaryMap['הגיעו (הזמנות)'], 1);
  assert.equal(summaryMap['הגיעו (אורחים)'], 2);
  assert.equal(summaryMap['לא הגיעו (הזמנות)'], 1);
  assert.equal(summaryMap['לא הגיעו (אורחים)'], 3);

  const arrivedNames = namesInSheet(built.workbook, 'הגיעו');
  const missingNames = namesInSheet(built.workbook, 'לא הגיעו');
  assert.deepEqual(arrivedNames, ['דנה כהן']);
  assert.deepEqual(missingNames, ['יוסי לוי']);
  assert.ok(!arrivedNames.includes('מיכל אברהם'));
  assert.ok(!missingNames.includes('נועה ברק'));

  const arrivedRow = sheetRows(built.workbook, 'הגיעו')[1];
  assert.equal(arrivedRow[1], 2);
  assert.equal(arrivedRow[2], 2);
  assert.equal(String(arrivedRow[3]), '3');
  assert.equal(arrivedRow[4], 'משפחה');
  assert.equal(arrivedRow[5], 'כלה');
  assert.equal(arrivedRow[6], '0521111111');
  assert.equal(arrivedRow[8], 'הגיע');

  const missingRow = sheetRows(built.workbook, 'לא הגיעו')[1];
  assert.equal(missingRow[1], 3);
  assert.equal(missingRow[2], 0);
  assert.equal(String(missingRow[3]), '8');
  assert.equal(missingRow[4], 'חברים');
  assert.equal(missingRow[5], 'חתן');
  assert.equal(missingRow[8], 'לא הגיע');
});

test('rsvp excel writes a sheet per status including declined variants', () => {
  const built = buildRsvpReportWorkbook(guests, {
    eventTitle: 'חתונת דנה ויוסי',
    categories,
    tables,
  });

  assert.deepEqual(built.workbook.SheetNames, ['סיכום', 'הכל', 'אישרו הגעה', 'לא אישרו', 'ממתינים', 'אולי']);
  assert.equal(built.total, 6);
  assert.match(built.fileName, /^דוח-אישורי-הגעה-חתונת-דנה-ויוסי-\d{4}-\d{2}-\d{2}\.xlsx$/);

  assert.deepEqual(namesInSheet(built.workbook, 'אישרו הגעה'), ['דנה כהן', 'יוסי לוי']);
  assert.deepEqual(namesInSheet(built.workbook, 'לא אישרו'), ['נועה ברק', 'אורי גולן']);
  assert.deepEqual(namesInSheet(built.workbook, 'ממתינים'), ['רון שמש']);
  assert.deepEqual(namesInSheet(built.workbook, 'אולי'), ['מיכל אברהם']);
  assert.equal(namesInSheet(built.workbook, 'הכל').length, 6);

  const confirmedRow = sheetRows(built.workbook, 'אישרו הגעה').find((row) => row[0] === 'דנה כהן');
  assert.ok(confirmedRow);
  assert.equal(confirmedRow[1], 2);
  assert.equal(confirmedRow[2], 'אישרו הגעה');
  assert.equal(confirmedRow[3], 'משפחה');
  assert.equal(confirmedRow[4], 'כלה');
  assert.equal(String(confirmedRow[5]), '3');
});

test('excel builders reject empty reports', () => {
  assert.throws(() => buildCheckInReportWorkbook(guests.filter((g) => g.status !== 'מגיע')), /אין מאשרים לייצוא/);
  assert.throws(() => buildRsvpReportWorkbook([]), /אין מוזמנים לייצוא/);
});
