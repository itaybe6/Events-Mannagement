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
  tableId?: string | null;
  numberOfPeople?: number | null;
};

export type ExportCategory = { id: string; name: string };

export type ExportTable = {
  id: string;
  name?: string | null;
  number?: number | null;
  capacity?: number | null;
  area?: string | null;
};

export type ExportGuestsParams = {
  eventTitle?: string;
  eventDate?: Date | null;
  eventLocation?: string;
  categories: ExportCategory[];
  guests: ExportGuest[];
  // When the event has a seating map (one or more tables), the list is grouped
  // by table instead of by category.
  tables?: ExportTable[];
};

// One rendered section of the document — either a guest category or a table.
type Group = {
  id: string;
  name: string;
  list: ExportGuest[];
  kind: 'category' | 'table';
  capacity?: number | null;
  area?: string | null;
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

function buildCategoryGroups(categories: ExportCategory[], guests: ExportGuest[]): Group[] {
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

  const groups: Group[] = [];
  for (const c of categories) {
    const list = byCat[String(c.id)] || [];
    if (list.length) groups.push({ id: String(c.id), name: c.name, list, kind: 'category' });
  }
  if (uncategorized.length) {
    groups.push({ id: UNCATEGORIZED_ID, name: 'ללא קטגוריה', list: uncategorized, kind: 'category' });
  }
  return groups;
}

function tableLabel(t: ExportTable): string {
  const number = String(t.number ?? '').trim();
  const name = String(t.name || '').replace(/\s+/g, ' ').trim();
  if (number) {
    const base = `שולחן ${number}`;
    const nameNoPrefix = name.replace(/^שולחן\s+/u, '').trim();
    if (!name || name === base || nameNoPrefix === number) return base;
    return `${base} · ${name}`;
  }
  return name || 'שולחן';
}

function buildTableGroups(tables: ExportTable[], guests: ExportGuest[]): Group[] {
  const tableIds = new Set(tables.map((t) => String(t.id)));
  const byTable: Record<string, ExportGuest[]> = {};
  const unseated: ExportGuest[] = [];

  for (const g of guests) {
    const tid = String(g.tableId || '').trim();
    if (!tid || !tableIds.has(tid)) {
      unseated.push(g);
      continue;
    }
    if (!byTable[tid]) byTable[tid] = [];
    byTable[tid].push(g);
  }

  const sorted = [...tables].sort((a, b) => {
    const an = a.number == null ? Number.POSITIVE_INFINITY : Number(a.number);
    const bn = b.number == null ? Number.POSITIVE_INFINITY : Number(b.number);
    if (an !== bn) return an - bn;
    return String(a.name || '').localeCompare(String(b.name || ''), 'he');
  });

  const groups: Group[] = [];
  for (const t of sorted) {
    const list = byTable[String(t.id)] || [];
    if (!list.length) continue; // skip empty tables
    groups.push({
      id: String(t.id),
      name: tableLabel(t),
      list,
      kind: 'table',
      capacity: t.capacity ?? null,
      area: t.area ?? null,
    });
  }
  if (unseated.length) {
    groups.push({ id: '__unseated__', name: 'ללא שיבוץ לשולחן', list: unseated, kind: 'table' });
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

// Max guest rows rendered per block. Sized so a block fits within a single A4
// page (avoiding mid-row slicing) and keeps each rasterized canvas well under
// the browser's max-canvas-size limit, even for events with hundreds of guests.
const ROWS_PER_BLOCK = 24;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function sectionCard(
  group: Group,
  rowsSlice: ExportGuest[],
  indexOffset: number,
  part: { index: number; count: number }
): string {
  const c = countByStatus(group.list);
  const rows = rowsSlice.map((g, i) => guestRow(g, indexOffset + i + 1)).join('');
  const partLabel = part.count > 1 ? ` <span class="chip chip-part">חלק ${part.index + 1}/${part.count}</span>` : '';
  const areaChip = group.area && String(group.area).trim()
    ? `<span class="chip chip-area">${escapeHtml(String(group.area).trim())}</span>`
    : '';
  const capacityChip =
    group.kind === 'table' && group.capacity && group.capacity > 0
      ? `<span class="chip">${c.people}/${group.capacity} מקומות</span>`
      : '';
  const metaChips =
    part.index === 0
      ? `<span class="chip">${group.list.length} מוזמנים</span>
         <span class="chip chip-people">${c.people} נפשות</span>
         ${capacityChip}
         <span class="chip chip-ok">${c.coming} אישרו</span>
         ${areaChip}`
      : `<span class="chip">המשך · ${group.list.length} מוזמנים</span>`;
  return `
    <section class="cat">
      <div class="cat-head">
        <div class="cat-title">
          <span class="cat-dot"></span>
          <h2>${escapeHtml(group.name)}</h2>${partLabel}
        </div>
        <div class="cat-meta">${metaChips}</div>
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

// Builds the document as an ordered list of self-contained HTML blocks.
// Each block is rasterized separately, so no single canvas grows too large.
function buildBlocks(params: ExportGuestsParams): string[] {
  const { eventTitle, eventDate, eventLocation, categories, guests, tables } = params;
  // If the event has a seating map (any tables defined), group by table.
  const byTables = Array.isArray(tables) && tables.length > 0;
  const groups = byTables
    ? buildTableGroups(tables as ExportTable[], guests)
    : buildCategoryGroups(categories, guests);
  const eyebrow = byTables ? 'רשימת מוזמנים · לפי שולחנות' : 'רשימת מוזמנים · אישורי הגעה';
  const emptyMsg = byTables ? 'אין שולחנות עם מוזמנים להצגה.' : 'אין מוזמנים להצגה.';
  const totals = countByStatus(guests);
  const dateStr = formatHebrewDate(eventDate);
  const generatedAt = formatHebrewDate(new Date());
  const subtitleBits = [dateStr, eventLocation && eventLocation.trim()].filter(Boolean).map((b) => escapeHtml(b));

  const blocks: string[] = [];

  blocks.push(`
    <header class="header">
      <p class="h-eyebrow">${eyebrow}</p>
      <h1 class="h-title">${escapeHtml(eventTitle || 'האירוע שלי')}</h1>
      ${subtitleBits.length ? `<div class="h-sub">${subtitleBits.map((b) => `<span>${b}</span>`).join('')}</div>` : ''}
    </header>
    <div class="summary">
      <div class="s-card s-total"><div class="s-val">${totals.total}</div><div class="s-lab">סה״כ מוזמנים</div></div>
      <div class="s-card s-people"><div class="s-val">${totals.people}</div><div class="s-lab">סה״כ נפשות</div></div>
      <div class="s-card s-ok"><div class="s-val">${totals.coming}</div><div class="s-lab">אישרו הגעה</div></div>
      <div class="s-card s-maybe"><div class="s-val">${totals.maybe}</div><div class="s-lab">אולי מגיעים</div></div>
      <div class="s-card s-pending"><div class="s-val">${totals.pending}</div><div class="s-lab">ממתינים</div></div>
      <div class="s-card s-no"><div class="s-val">${totals.notComing}</div><div class="s-lab">לא מגיעים</div></div>
    </div>
    <div class="legend">
      <i><span class="dot" style="background:#0F7A43"></span> אישר/ה הגעה</i>
      <i><span class="dot" style="background:#1D4ED8"></span> אולי מגיע/ה</i>
      <i><span class="dot" style="background:#A6791B"></span> ממתין/ה לתשובה</i>
      <i><span class="dot" style="background:#B5263E"></span> לא מגיע/ה</i>
    </div>`);

  if (!groups.length) {
    blocks.push(`<div class="empty">${emptyMsg}</div>`);
  } else {
    for (const group of groups) {
      const parts = chunk(group.list, ROWS_PER_BLOCK);
      parts.forEach((slice, i) => {
        blocks.push(sectionCard(group, slice, i * ROWS_PER_BLOCK, { index: i, count: parts.length }));
      });
    }
  }

  blocks.push(`
    <div class="footer">
      <span>הופק באמצעות Moon · מערכת ניהול אירועים</span>
      <span>${generatedAt ? 'הופק בתאריך ' + escapeHtml(generatedAt) : ''}</span>
    </div>`);

  return blocks;
}

function buildContentHtml(params: ExportGuestsParams): string {
  return `<div class="wrap">${buildBlocks(params).join('')}</div>`;
}

// NOTE: colors are hardcoded (no CSS custom properties) because html2canvas
// 1.x does not reliably resolve var() during rasterization.
const PDF_STYLES = `
  .pdf-root *{ box-sizing:border-box; }
  .pdf-root{
    font-family:"Rubik","Segoe UI",Arial,sans-serif; color:#001D3D;
    background:#fff; direction:rtl; -webkit-print-color-adjust:exact; print-color-adjust:exact;
  }
  .pdf-root .wrap{ padding:6px 4px 10px; }
  .pdf-root .pdf-block{ background:#fff; }
  .pdf-root .pdf-block > .cat{ margin-top:0; }

  .pdf-root .header{
    position:relative; overflow:hidden; border-radius:20px; padding:26px 28px;
    background:linear-gradient(135deg,#06173e 0%,#0b2a63 60%,#123a82 100%);
    color:#fff;
  }
  .pdf-root .header::after{
    content:""; position:absolute; bottom:-60px; left:-40px; width:220px; height:220px;
    background:radial-gradient(circle,rgba(240,203,70,.35),rgba(240,203,70,0) 70%); pointer-events:none;
  }
  .pdf-root .h-eyebrow{ font-size:12px; letter-spacing:2px; font-weight:700; color:#F0CB46; margin:0 0 6px; }
  .pdf-root .h-title{ font-size:30px; font-weight:800; margin:0; line-height:1.15; color:#ffffff; }
  .pdf-root .h-sub{ margin:10px 0 0; font-size:14px; color:#D7E0F2; display:flex; gap:14px; flex-wrap:wrap; }
  .pdf-root .h-sub span{ display:inline-flex; align-items:center; gap:6px; }
  .pdf-root .h-sub span::before{ content:"•"; color:#F0CB46; }
  .pdf-root .h-sub span:first-child::before{ content:""; }

  .pdf-root .summary{ display:flex; gap:10px; margin:18px 0 6px; }
  .pdf-root .s-card{ flex:1; border:1px solid #E6E9F0; border-radius:14px; padding:12px 8px; text-align:center; background:#F6F7FB; }
  .pdf-root .s-val{ font-size:24px; font-weight:800; line-height:1; color:#06173e; }
  .pdf-root .s-lab{ font-size:11px; color:#6B7385; margin-top:5px; font-weight:600; }
  .pdf-root .s-total{ background:#EEF1F8; } .pdf-root .s-total .s-val{ color:#06173e; }
  .pdf-root .s-people .s-val{ color:#5B4BC4; }
  .pdf-root .s-ok{ background:#E7F8EF; } .pdf-root .s-ok .s-val{ color:#0F7A43; }
  .pdf-root .s-maybe .s-val{ color:#1D4ED8; }
  .pdf-root .s-pending .s-val{ color:#A6791B; }
  .pdf-root .s-no .s-val{ color:#B5263E; }

  .pdf-root .legend{ display:flex; gap:14px; flex-wrap:wrap; margin:14px 2px 4px; font-size:12px; color:#6B7385; }
  .pdf-root .legend i{ font-style:normal; display:inline-flex; align-items:center; gap:6px; }
  .pdf-root .dot{ width:10px; height:10px; border-radius:50%; display:inline-block; }

  .pdf-root .cat{ margin-top:22px; border:1px solid #E6E9F0; border-radius:16px; overflow:hidden; }
  .pdf-root .cat-head{
    display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;
    padding:13px 16px; background:#F4F6FB; border-bottom:1px solid #E6E9F0;
  }
  .pdf-root .cat-title{ display:flex; align-items:center; gap:10px; }
  .pdf-root .cat-title h2{ font-size:17px; margin:0; font-weight:800; color:#06173e; }
  .pdf-root .cat-dot{ width:12px; height:12px; border-radius:4px; background:linear-gradient(135deg,#CCA000,#F0CB46); }
  .pdf-root .cat-meta{ display:flex; gap:7px; flex-wrap:wrap; }
  .pdf-root .chip{ font-size:11px; font-weight:700; color:#06173e; background:#fff; border:1px solid #E6E9F0; border-radius:999px; padding:4px 10px; }
  .pdf-root .chip-people{ color:#5B4BC4; }
  .pdf-root .chip-ok{ color:#0F7A43; background:#E7F8EF; border-color:#9FE3BE; }
  .pdf-root .chip-part{ color:#CCA000; background:#FBF4E0; border-color:#EBD79A; }
  .pdf-root .chip-area{ color:#1D4ED8; background:#EAF1FB; border-color:#B9D0F2; }

  .pdf-root table.tbl{ width:100%; border-collapse:collapse; font-size:13px; }
  .pdf-root .tbl thead th{
    text-align:right; font-size:11px; font-weight:700; color:#6B7385; text-transform:none;
    padding:9px 14px; background:#FCFDFF; border-bottom:1px solid #E6E9F0;
  }
  .pdf-root .tbl tbody td{ padding:9px 14px; border-bottom:1px solid #F0F2F7; vertical-align:middle; }
  .pdf-root .tbl tbody tr:nth-child(even){ background:#FAFBFE; }
  .pdf-root .tbl tbody tr:last-child td{ border-bottom:none; }
  .pdf-root .c-idx{ width:34px; color:#6B7385; text-align:center; font-size:12px; }
  .pdf-root .c-name{ font-weight:700; color:#001D3D; }
  .pdf-root .c-phone{ direction:ltr; text-align:right; color:#3A4256; white-space:nowrap; }
  .pdf-root .c-people{ width:60px; text-align:center; font-weight:700; }
  .pdf-root .c-status{ width:150px; }
  .pdf-root .badge{ display:inline-flex; align-items:center; gap:6px; font-size:11.5px; font-weight:700; padding:4px 10px; border-radius:999px; border:1px solid; white-space:nowrap; }
  .pdf-root .badge-sym{ font-weight:800; }

  .pdf-root .empty{ text-align:center; color:#6B7385; padding:40px; }
  .pdf-root .footer{ margin-top:28px; padding-top:14px; border-top:1px solid #E6E9F0; display:flex; justify-content:space-between; font-size:11px; color:#6B7385; }
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

// Render width (px) of the off-screen document. Maps to the A4 content width.
const RENDER_WIDTH = 760;
const PAGE = { w: 210, h: 297, margin: 8 }; // A4 in mm
const BLOCK_GAP = 4; // mm between blocks

export async function exportGuestsToPdf(params: ExportGuestsParams): Promise<boolean> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;

  let jsPDFCtor: any;
  let html2canvas: any;
  try {
    jsPDFCtor = (await import('jspdf')).jsPDF;
    html2canvas = (await import('html2canvas')).default;
  } catch (e) {
    console.warn('PDF libraries failed to load, falling back to print window:', e);
    return printWindowFallback(params);
  }

  // Styles go in <head> so html2canvas reliably includes them in its clone.
  const styleEl = document.createElement('style');
  styleEl.setAttribute('data-pdf-export', '1');
  styleEl.textContent = PDF_STYLES;
  document.head.appendChild(styleEl);

  // Each block is rendered in its own host anchored at (0,0) and pushed behind
  // the app. Rendering one block at a time keeps every element inside the
  // viewport (html2canvas can capture blank for elements far down the page) and
  // keeps each canvas small.
  const renderBlock = async (blockHtml: string): Promise<HTMLCanvasElement | null> => {
    const host = document.createElement('div');
    host.className = 'pdf-root';
    host.setAttribute('dir', 'rtl');
    host.style.position = 'fixed';
    host.style.top = '0';
    host.style.left = '0';
    host.style.zIndex = '-1';
    host.style.pointerEvents = 'none';
    host.style.width = `${RENDER_WIDTH}px`;
    host.style.background = '#ffffff';
    host.innerHTML = `<div class="wrap"><div class="pdf-block">${blockHtml}</div></div>`;
    document.body.appendChild(host);
    try {
      const target = host.querySelector<HTMLElement>('.pdf-block') || host;
      const canvas = await html2canvas(target, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: target.offsetWidth,
        height: target.offsetHeight,
        windowWidth: RENDER_WIDTH,
        windowHeight: Math.max(target.offsetHeight + 40, 600),
      });
      return canvas;
    } finally {
      document.body.removeChild(host);
    }
  };

  try {
    // Give web fonts a chance to load so text measures/renders correctly.
    if ((document as any).fonts?.ready) {
      try {
        await (document as any).fonts.ready;
      } catch {}
    }

    const blocks = buildBlocks(params);
    const doc = new jsPDFCtor({ unit: 'mm', format: 'a4', orientation: 'portrait' });

    const contentW = PAGE.w - PAGE.margin * 2;
    const pageContentH = PAGE.h - PAGE.margin * 2;
    let cursorY = PAGE.margin;
    let isFirst = true;

    for (const blockHtml of blocks) {
      const canvas = await renderBlock(blockHtml);
      if (!canvas || !canvas.width || !canvas.height) continue;

      const imgH = (canvas.height * contentW) / canvas.width; // mm

      if (imgH <= pageContentH) {
        // Whole block fits on a page — start a new page if it would overflow.
        if (!isFirst && cursorY + imgH > PAGE.margin + pageContentH + 0.1) {
          doc.addPage();
          cursorY = PAGE.margin;
        }
        doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', PAGE.margin, cursorY, contentW, imgH);
        cursorY += imgH + BLOCK_GAP;
      } else {
        // Block taller than a page — slice the canvas across pages.
        if (!isFirst && cursorY > PAGE.margin + 0.1) {
          doc.addPage();
          cursorY = PAGE.margin;
        }
        const pageSlicePx = Math.floor((pageContentH * canvas.width) / contentW);
        let offsetPx = 0;
        let firstSlice = true;
        let lastSliceMm = pageContentH;
        while (offsetPx < canvas.height) {
          if (!firstSlice) {
            doc.addPage();
            cursorY = PAGE.margin;
          }
          firstSlice = false;
          const sliceH = Math.min(pageSlicePx, canvas.height - offsetPx);
          const tmp = document.createElement('canvas');
          tmp.width = canvas.width;
          tmp.height = sliceH;
          const ctx = tmp.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, tmp.width, tmp.height);
            ctx.drawImage(canvas, 0, offsetPx, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
          }
          lastSliceMm = (sliceH * contentW) / canvas.width;
          doc.addImage(tmp.toDataURL('image/jpeg', 0.95), 'JPEG', PAGE.margin, PAGE.margin, contentW, lastSliceMm);
          offsetPx += sliceH;
        }
        cursorY = PAGE.margin + lastSliceMm + BLOCK_GAP;
      }
      isFirst = false;
    }

    // Numeric page footer (ASCII only — safe with the default font).
    const total = doc.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      doc.setFontSize(9);
      doc.setTextColor(150, 150, 150);
      doc.text(`${p} / ${total}`, PAGE.w / 2, PAGE.h - 4, { align: 'center' });
    }

    doc.save(fileName(params.eventTitle));
    return true;
  } catch (e) {
    console.warn('PDF render failed, falling back to print window:', e);
    return printWindowFallback(params);
  } finally {
    styleEl.remove();
  }
}
