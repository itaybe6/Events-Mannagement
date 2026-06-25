// Generates a beautifully designed, print-optimized (RTL) guest list and opens
// the browser print dialog so the user can save it as a PDF.
// Web-only: relies on `window`/`document`.

export type ExportGuestStatus = 'ממתין' | 'אולי מגיע' | 'מגיע' | 'לא מגיע';

export type ExportGuest = {
  id: string;
  name: string;
  phone: string;
  status: ExportGuestStatus;
  category_id?: string | null;
  numberOfPeople?: number | null;
};

export type ExportCategory = { id: string; name: string };

export type ExportGuestsParams = {
  eventTitle?: string;
  eventDate?: Date | null;
  eventLocation?: string;
  categories: ExportCategory[];
  guests: ExportGuest[];
};

const UNCATEGORIZED_ID = '__uncategorized__';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatHebrewDate(date?: Date | null): string {
  if (!date || isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('he-IL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  } catch {
    return date.toLocaleDateString('he-IL');
  }
}

const STATUS_META: Record<
  ExportGuestStatus,
  { label: string; symbol: string; bg: string; fg: string; border: string }
> = {
  מגיע: { label: 'אישר/ה הגעה', symbol: '✓', bg: '#E7F8EF', fg: '#0F7A43', border: '#9FE3BE' },
  'אולי מגיע': { label: 'אולי מגיע/ה', symbol: '~', bg: '#EAF1FB', fg: '#1D4ED8', border: '#B9D0F2' },
  ממתין: { label: 'ממתין/ה לתשובה', symbol: '•', bg: '#FBF4E0', fg: '#A6791B', border: '#EBD79A' },
  'לא מגיע': { label: 'לא מגיע/ה', symbol: '✕', bg: '#FDEAEE', fg: '#B5263E', border: '#F4B8C5' },
};

function countByStatus(guests: ExportGuest[]) {
  const acc = { total: 0, people: 0, coming: 0, maybe: 0, pending: 0, notComing: 0 };
  for (const g of guests) {
    const ppl = g.numberOfPeople && g.numberOfPeople > 0 ? g.numberOfPeople : 1;
    acc.total += 1;
    acc.people += ppl;
    if (g.status === 'מגיע') acc.coming += ppl;
    else if (g.status === 'אולי מגיע') acc.maybe += ppl;
    else if (g.status === 'לא מגיע') acc.notComing += ppl;
    else acc.pending += ppl;
  }
  return acc;
}

function buildGroups(categories: ExportCategory[], guests: ExportGuest[]) {
  const catIds = new Set(categories.map((c) => String(c.id)));
  const byCat: Record<string, ExportGuest[]> = {};
  const uncategorized: ExportGuest[] = [];

  for (const g of guests) {
    const cid = String(g.category_id || '').trim();
    if (!cid || !catIds.has(cid)) {
      uncategorized.push(g);
      continue;
    }
    if (!byCat[cid]) byCat[cid] = [];
    byCat[cid].push(g);
  }

  const groups: Array<{ id: string; name: string; list: ExportGuest[] }> = [];
  for (const c of categories) {
    const list = byCat[String(c.id)] || [];
    if (list.length) groups.push({ id: String(c.id), name: c.name, list });
  }
  if (uncategorized.length) {
    groups.push({ id: UNCATEGORIZED_ID, name: 'ללא קטגוריה', list: uncategorized });
  }
  return groups;
}

function guestRow(g: ExportGuest, index: number): string {
  const meta = STATUS_META[g.status] || STATUS_META['ממתין'];
  const people = g.numberOfPeople && g.numberOfPeople > 0 ? g.numberOfPeople : 1;
  const phone = String(g.phone || '').trim();
  return `
    <tr>
      <td class="c-idx">${index}</td>
      <td class="c-name">${escapeHtml(g.name) || '—'}</td>
      <td class="c-phone">${phone ? escapeHtml(phone) : '—'}</td>
      <td class="c-people">${people}</td>
      <td class="c-status">
        <span class="badge" style="background:${meta.bg};color:${meta.fg};border-color:${meta.border}">
          <span class="badge-sym">${meta.symbol}</span>${escapeHtml(meta.label)}
        </span>
      </td>
    </tr>`;
}

function categoryCard(group: { name: string; list: ExportGuest[] }): string {
  const c = countByStatus(group.list);
  const rows = group.list.map((g, i) => guestRow(g, i + 1)).join('');
  return `
    <section class="cat">
      <div class="cat-head">
        <div class="cat-title">
          <span class="cat-dot"></span>
          <h2>${escapeHtml(group.name)}</h2>
        </div>
        <div class="cat-meta">
          <span class="chip">${group.list.length} מוזמנים</span>
          <span class="chip chip-people">${c.people} נפשות</span>
          <span class="chip chip-ok">${c.coming} אישרו</span>
        </div>
      </div>
      <table class="tbl">
        <thead>
          <tr>
            <th class="c-idx">#</th>
            <th class="c-name">שם המוזמן</th>
            <th class="c-phone">טלפון</th>
            <th class="c-people">נפשות</th>
            <th class="c-status">סטטוס אישור</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

function buildContentHtml(params: ExportGuestsParams): string {
  const { eventTitle, eventDate, eventLocation, categories, guests } = params;
  const groups = buildGroups(categories, guests);
  const totals = countByStatus(guests);
  const dateStr = formatHebrewDate(eventDate);
  const generatedAt = formatHebrewDate(new Date());

  const summaryCards = `
    <div class="summary">
      <div class="s-card s-total"><div class="s-val">${totals.total}</div><div class="s-lab">סה״כ מוזמנים</div></div>
      <div class="s-card s-people"><div class="s-val">${totals.people}</div><div class="s-lab">סה״כ נפשות</div></div>
      <div class="s-card s-ok"><div class="s-val">${totals.coming}</div><div class="s-lab">אישרו הגעה</div></div>
      <div class="s-card s-maybe"><div class="s-val">${totals.maybe}</div><div class="s-lab">אולי מגיעים</div></div>
      <div class="s-card s-pending"><div class="s-val">${totals.pending}</div><div class="s-lab">ממתינים</div></div>
      <div class="s-card s-no"><div class="s-val">${totals.notComing}</div><div class="s-lab">לא מגיעים</div></div>
    </div>`;

  const body = groups.length
    ? groups.map(categoryCard).join('')
    : '<div class="empty">אין מוזמנים להצגה.</div>';

  const subtitleBits = [dateStr, eventLocation && eventLocation.trim()].filter(Boolean).map((b) => escapeHtml(b));

  return `
    <div class="wrap">
      <header class="header">
        <p class="h-eyebrow">רשימת מוזמנים · אישורי הגעה</p>
        <h1 class="h-title">${escapeHtml(eventTitle || 'האירוע שלי')}</h1>
        ${subtitleBits.length ? `<div class="h-sub">${subtitleBits.map((b) => `<span>${b}</span>`).join('')}</div>` : ''}
      </header>

      ${summaryCards}

      <div class="legend">
        <i><span class="dot" style="background:#0F7A43"></span> אישר/ה הגעה</i>
        <i><span class="dot" style="background:#1D4ED8"></span> אולי מגיע/ה</i>
        <i><span class="dot" style="background:#A6791B"></span> ממתין/ה לתשובה</i>
        <i><span class="dot" style="background:#B5263E"></span> לא מגיע/ה</i>
      </div>

      ${body}

      <div class="footer">
        <span>הופק באמצעות Moon · מערכת ניהול אירועים</span>
        <span>${generatedAt ? 'הופק בתאריך ' + escapeHtml(generatedAt) : ''}</span>
      </div>
    </div>`;
}

const PDF_STYLES = `
  :root{
    --ink:#001D3D; --rich:#06173e; --gold:#CCA000; --yellow:#F0CB46;
    --line:#E6E9F0; --soft:#F6F7FB; --muted:#6B7385;
  }
  .pdf-root *{ box-sizing:border-box; }
  .pdf-root{
    font-family:"Rubik","Segoe UI",Arial,sans-serif; color:var(--ink);
    background:#fff; direction:rtl; -webkit-print-color-adjust:exact; print-color-adjust:exact;
  }
  .pdf-root .wrap{ padding:6px 4px 10px; }

  .pdf-root .header{
    position:relative; overflow:hidden; border-radius:20px; padding:26px 28px;
    background:linear-gradient(135deg,var(--rich) 0%,#0b2a63 60%,#123a82 100%);
    color:#fff;
  }
  .pdf-root .header::after{
    content:""; position:absolute; bottom:-60px; left:-40px; width:220px; height:220px;
    background:radial-gradient(circle,rgba(240,203,70,.35),transparent 70%); pointer-events:none;
  }
  .pdf-root .h-eyebrow{ font-size:12px; letter-spacing:2px; font-weight:700; color:var(--yellow); margin:0 0 6px; }
  .pdf-root .h-title{ font-size:30px; font-weight:800; margin:0; line-height:1.15; }
  .pdf-root .h-sub{ margin:10px 0 0; font-size:14px; color:#D7E0F2; display:flex; gap:14px; flex-wrap:wrap; }
  .pdf-root .h-sub span{ display:inline-flex; align-items:center; gap:6px; }
  .pdf-root .h-sub span::before{ content:"•"; color:var(--yellow); }
  .pdf-root .h-sub span:first-child::before{ content:""; }

  .pdf-root .summary{ display:grid; grid-template-columns:repeat(6,1fr); gap:10px; margin:18px 0 6px; }
  .pdf-root .s-card{ border:1px solid var(--line); border-radius:14px; padding:12px 8px; text-align:center; background:var(--soft); }
  .pdf-root .s-val{ font-size:24px; font-weight:800; line-height:1; }
  .pdf-root .s-lab{ font-size:11px; color:var(--muted); margin-top:5px; font-weight:600; }
  .pdf-root .s-total{ background:#EEF1F8; } .pdf-root .s-total .s-val{ color:var(--rich); }
  .pdf-root .s-people .s-val{ color:#5B4BC4; }
  .pdf-root .s-ok{ background:#E7F8EF; } .pdf-root .s-ok .s-val{ color:#0F7A43; }
  .pdf-root .s-maybe .s-val{ color:#1D4ED8; }
  .pdf-root .s-pending .s-val{ color:#A6791B; }
  .pdf-root .s-no .s-val{ color:#B5263E; }

  .pdf-root .legend{ display:flex; gap:14px; flex-wrap:wrap; margin:14px 2px 4px; font-size:12px; color:var(--muted); }
  .pdf-root .legend i{ font-style:normal; display:inline-flex; align-items:center; gap:6px; }
  .pdf-root .dot{ width:10px; height:10px; border-radius:50%; display:inline-block; }

  .pdf-root .cat{ margin-top:22px; border:1px solid var(--line); border-radius:16px; overflow:hidden; }
  .pdf-root .cat-head{
    display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;
    padding:13px 16px; background:linear-gradient(180deg,#FAFBFE,#F1F3FA); border-bottom:1px solid var(--line);
    page-break-inside:avoid; break-inside:avoid;
  }
  .pdf-root .cat-title{ display:flex; align-items:center; gap:10px; }
  .pdf-root .cat-title h2{ font-size:17px; margin:0; font-weight:800; color:var(--rich); }
  .pdf-root .cat-dot{ width:12px; height:12px; border-radius:4px; background:linear-gradient(135deg,var(--gold),var(--yellow)); }
  .pdf-root .cat-meta{ display:flex; gap:7px; flex-wrap:wrap; }
  .pdf-root .chip{ font-size:11px; font-weight:700; color:var(--rich); background:#fff; border:1px solid var(--line); border-radius:999px; padding:4px 10px; }
  .pdf-root .chip-people{ color:#5B4BC4; }
  .pdf-root .chip-ok{ color:#0F7A43; background:#E7F8EF; border-color:#9FE3BE; }

  .pdf-root table.tbl{ width:100%; border-collapse:collapse; font-size:13px; }
  .pdf-root .tbl thead th{
    text-align:right; font-size:11px; font-weight:700; color:var(--muted); text-transform:none;
    padding:9px 14px; background:#FCFDFF; border-bottom:1px solid var(--line);
  }
  .pdf-root .tbl tbody td{ padding:9px 14px; border-bottom:1px solid #F0F2F7; vertical-align:middle; }
  .pdf-root .tbl tbody tr:nth-child(even){ background:#FAFBFE; }
  .pdf-root .tbl tbody tr:last-child td{ border-bottom:none; }
  .pdf-root .tbl tr{ page-break-inside:avoid; break-inside:avoid; }
  .pdf-root .c-idx{ width:34px; color:var(--muted); text-align:center; font-size:12px; }
  .pdf-root .c-name{ font-weight:700; }
  .pdf-root .c-phone{ direction:ltr; text-align:right; font-variant-numeric:tabular-nums; color:#3A4256; white-space:nowrap; }
  .pdf-root .c-people{ width:60px; text-align:center; font-weight:700; }
  .pdf-root .c-status{ width:150px; }
  .pdf-root .badge{ display:inline-flex; align-items:center; gap:6px; font-size:11.5px; font-weight:700; padding:4px 10px; border-radius:999px; border:1px solid; white-space:nowrap; }
  .pdf-root .badge-sym{ font-weight:800; }

  .pdf-root .empty{ text-align:center; color:var(--muted); padding:40px; }
  .pdf-root .footer{ margin-top:28px; padding-top:14px; border-top:1px solid var(--line); display:flex; justify-content:space-between; font-size:11px; color:var(--muted); }
`;

function fileName(eventTitle?: string): string {
  const base = String(eventTitle || 'מוזמנים').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-');
  return `רשימת-מוזמנים-${base || 'אירוע'}.pdf`;
}

// Fallback: open a print window so the user can "Save as PDF" manually.
function printWindowFallback(params: ExportGuestsParams) {
  const html = `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8" />
<title>${escapeHtml(fileName(params.eventTitle))}</title>
<style>html,body{margin:0;padding:0}@page{size:A4;margin:12mm}${PDF_STYLES}</style></head>
<body><div class="pdf-root">${buildContentHtml(params)}</div>
<script>window.onload=function(){setTimeout(function(){window.print();},350);};</script>
</body></html>`;
  const w = window.open('', '_blank', 'width=980,height=1200');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}

export async function exportGuestsToPdf(params: ExportGuestsParams): Promise<boolean> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;

  let html2pdf: any;
  try {
    html2pdf = (await import('html2pdf.js')).default;
  } catch (e) {
    console.warn('html2pdf load failed, falling back to print window:', e);
    return printWindowFallback(params);
  }

  // Render the styled markup off-screen, then rasterize it into a downloadable PDF.
  const host = document.createElement('div');
  host.className = 'pdf-root';
  host.setAttribute('dir', 'rtl');
  host.style.position = 'fixed';
  host.style.top = '0';
  host.style.right = '-10000px';
  host.style.width = '800px';
  host.style.background = '#ffffff';
  host.innerHTML = `<style>${PDF_STYLES}</style>${buildContentHtml(params)}`;
  document.body.appendChild(host);

  try {
    await html2pdf()
      .set({
        margin: [8, 8, 8, 8],
        filename: fileName(params.eventTitle),
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] },
      })
      .from(host)
      .save();
    return true;
  } catch (e) {
    console.warn('html2pdf render failed, falling back to print window:', e);
    return printWindowFallback(params);
  } finally {
    document.body.removeChild(host);
  }
}
