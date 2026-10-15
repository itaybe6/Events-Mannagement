// Printable seating-map PDF (RTL, web only). Each table shows its number and
// how many guests are seated there. Layout follows the hall sketch when
// positions exist; otherwise tables are arranged in rows by number.

import { tableCellSize, type Orientation, type TableType } from '../app/seating/web/_types';

export type SeatingPdfTable = {
  number?: number | null;
  name?: string | null;
  seats: number;
  seated: number;
  type: TableType;
  orientation: Orientation;
  gridX: number;
  gridY: number;
};

export type SeatingPdfZone = {
  name: string;
  gridX: number;
  gridY: number;
  widthCells: number;
  heightCells: number;
};

export type SeatingPdfLabel = {
  text: string;
  gridX: number;
  gridY: number;
};

export type ExportSeatingMapParams = {
  eventTitle?: string;
  tables: SeatingPdfTable[];
  zones?: SeatingPdfZone[];
  labels?: SeatingPdfLabel[];
  unseatedPeople?: number;
};

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatGeneratedAt(): string {
  try {
    return new Intl.DateTimeFormat('he-IL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date());
  } catch {
    return '';
  }
}

function positionsAreUsable(tables: SeatingPdfTable[]): boolean {
  if (tables.length <= 1) return true;
  const keys = new Set(tables.map((t) => `${Math.round(Number(t.gridX) || 0)}:${Math.round(Number(t.gridY) || 0)}`));
  return keys.size > 1 && keys.size >= Math.ceil(tables.length * 0.5);
}

function placeForPrint(tables: SeatingPdfTable[]): SeatingPdfTable[] {
  if (positionsAreUsable(tables)) return tables;
  const sorted = [...tables].sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));
  const perRow = Math.min(5, Math.max(2, Math.ceil(Math.sqrt(sorted.length))));
  let x = 0;
  let y = 0;
  let rowH = 0;
  let col = 0;
  return sorted.map((t) => {
    const sz = tableCellSize(t.type, t.seats || 12, t.orientation);
    if (col >= perRow) {
      col = 0;
      x = 0;
      y += rowH + 1;
      rowH = 0;
    }
    const placed = { ...t, gridX: x, gridY: y };
    x += sz.w + 1;
    rowH = Math.max(rowH, sz.h);
    col += 1;
    return placed;
  });
}

type Paint = { fill: string; border: string; text: string; sub: string };

function tablePaint(table: SeatingPdfTable): Paint {
  const seated = Number(table.seated) || 0;
  const cap = Number(table.seats) || 0;
  const full = cap > 0 && seated >= cap;
  if (table.type === 'reserve' && !full) {
    return { fill: 'rgba(240,203,70,0.92)', border: '#E2B200', text: '#06173e', sub: '#06173e' };
  }
  return {
    fill: 'rgba(6,23,62,0.92)',
    border: full ? '#10B981' : '#FFFFFF',
    text: '#FFFFFF',
    sub: 'rgba(255,255,255,0.92)',
  };
}

type Box = { left: number; top: number; w: number; h: number };

type MapLayout = {
  width: number;
  height: number;
  zones: Array<SeatingPdfZone & Box>;
  labels: Array<SeatingPdfLabel & Box>;
  tables: Array<SeatingPdfTable & Box>;
};

function layoutMap(params: ExportSeatingMapParams): MapLayout | null {
  const tables = placeForPrint(params.tables || []);
  const zones = params.zones || [];
  const labels = params.labels || [];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = 0;
  let maxY = 0;
  const include = (x0: number, y0: number, x1: number, y1: number) => {
    minX = Math.min(minX, x0);
    minY = Math.min(minY, y0);
    maxX = Math.max(maxX, x1);
    maxY = Math.max(maxY, y1);
  };

  for (const t of tables) {
    const sz = tableCellSize(t.type, t.seats || 12, t.orientation);
    include(t.gridX, t.gridY, t.gridX + sz.w, t.gridY + sz.h);
  }
  for (const z of zones) {
    include(z.gridX, z.gridY, z.gridX + Math.max(1, z.widthCells), z.gridY + Math.max(1, z.heightCells));
  }
  for (const l of labels) {
    include(l.gridX, l.gridY, l.gridX + 2, l.gridY + 1);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;

  const pad = 0.6;
  const originX = minX - pad;
  const originY = minY - pad;
  const cols = Math.max(1, maxX - minX + pad * 2);
  const rows = Math.max(1, maxY - minY + pad * 2);
  const cell = Math.max(22, Math.min(52, Math.floor(Math.min(1800 / cols, 1100 / rows))));
  const toBox = (gx: number, gy: number, gw: number, gh: number): Box => ({
    left: Math.round((gx - originX) * cell),
    top: Math.round((gy - originY) * cell),
    w: Math.max(28, Math.round(gw * cell) - 6),
    h: Math.max(28, Math.round(gh * cell) - 6),
  });

  return {
    width: Math.ceil(cols * cell),
    height: Math.ceil(rows * cell),
    zones: zones.map((z) => ({ ...z, ...toBox(z.gridX, z.gridY, Math.max(1, z.widthCells), Math.max(1, z.heightCells)) })),
    labels: labels.map((l) => ({ ...l, ...toBox(l.gridX, l.gridY, 2, 1) })),
    tables: tables.map((t) => {
      const sz = tableCellSize(t.type, t.seats || 12, t.orientation);
      return { ...t, ...toBox(t.gridX, t.gridY, sz.w, sz.h) };
    }),
  };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, start: number, min: number, weight: string) {
  let size = start;
  while (size > min) {
    ctx.font = `${weight} ${size}px Rubik, Arial, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 1;
  }
  ctx.font = `${weight} ${min}px Rubik, Arial, sans-serif`;
  return min;
}

function drawSeatingMapCanvas(params: ExportSeatingMapParams): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const layout = layoutMap(params);
  if (!layout) return null;

  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, layout.width * scale);
  canvas.height = Math.max(1, layout.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(scale, scale);
  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(0, 0, layout.width, layout.height);

  for (const zone of layout.zones) {
    ctx.save();
    ctx.fillStyle = 'rgba(43,140,238,0.05)';
    ctx.strokeStyle = 'rgba(148,163,184,0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    roundRect(ctx, zone.left, zone.top, zone.w, zone.h, 16);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    const name = String(zone.name || '').trim();
    if (name) {
      ctx.save();
      ctx.direction = 'rtl';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(17,24,39,0.62)';
      fitFont(ctx, name, Math.max(20, zone.w - 16), 14, 10, '800');
      ctx.fillText(name, zone.left + zone.w / 2, zone.top + 8);
      ctx.restore();
    }
  }

  for (const label of layout.labels) {
    const text = String(label.text || '').trim();
    if (!text) continue;
    ctx.save();
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(17,24,39,0.7)';
    ctx.font = '800 13px Rubik, Arial, sans-serif';
    ctx.fillText(text, label.left + label.w, label.top + 4);
    ctx.restore();
  }

  for (const table of layout.tables) {
    const paint = tablePaint(table);
    roundRect(ctx, table.left, table.top, table.w, table.h, 14);
    ctx.fillStyle = paint.fill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = paint.border;
    ctx.stroke();

    const num = table.number != null && Number.isFinite(Number(table.number)) ? String(table.number) : '';
    const cap = Number(table.seats) || 0;
    const seated = Number(table.seated) || 0;
    const ratio = cap > 0 ? `${seated}/${cap}` : String(seated);
    const cx = table.left + table.w / 2;
    const cy = table.top + table.h / 2;
    const maxText = Math.max(12, table.w - 10);

    ctx.save();
    ctx.direction = 'ltr';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = paint.text;

    const flat = table.h < 46 || table.w > table.h * 1.7;
    if (flat) {
      const line = num ? `${num}  ${ratio}` : ratio;
      const size = fitFont(ctx, line, maxText, Math.max(11, Math.min(16, Math.floor(table.h * 0.46))), 9, '900');
      ctx.font = `900 ${size}px Rubik, Arial, sans-serif`;
      ctx.fillText(line, cx, cy);
    } else {
      const numSize = fitFont(ctx, num || ratio, maxText, Math.max(13, Math.min(22, Math.floor(Math.min(table.w, table.h) * 0.36))), 11, '900');
      const subSize = fitFont(ctx, ratio, maxText, Math.max(10, Math.min(14, Math.floor(numSize * 0.62))), 9, '800');
      const gap = 3;
      ctx.font = `900 ${numSize}px Rubik, Arial, sans-serif`;
      ctx.fillText(num, cx, cy - (subSize + gap) / 2);
      ctx.font = `800 ${subSize}px Rubik, Arial, sans-serif`;
      ctx.fillStyle = paint.sub;
      ctx.fillText(ratio, cx, cy + (numSize + gap) / 2);
    }
    ctx.restore();
  }

  return canvas;
}

function buildStageHtml(params: ExportSeatingMapParams): string {
  const layout = layoutMap(params);
  if (!layout) return '<div class="empty">אין שולחנות במפה</div>';

  const zones = layout.zones
    .map(
      (z) =>
        `<div class="zone" style="left:${z.left}px;top:${z.top}px;width:${z.w}px;height:${z.h}px"><span>${escapeHtml(z.name)}</span></div>`
    )
    .join('');
  const labels = layout.labels
    .map((l) => `<div class="label" style="left:${l.left}px;top:${l.top}px">${escapeHtml(l.text)}</div>`)
    .join('');
  const tables = layout.tables
    .map((t) => {
      const paint = tablePaint(t);
      const cap = Number(t.seats) || 0;
      const seated = Number(t.seated) || 0;
      const num = t.number != null && Number.isFinite(Number(t.number)) ? String(t.number) : '';
      const ratio = cap > 0 ? `${seated}/${cap}` : String(seated);
      const flat = t.h < 46 || t.w > t.h * 1.7;
      const inner = flat
        ? `<span class="t-line">${escapeHtml(num)}&nbsp;&nbsp;${escapeHtml(ratio)}</span>`
        : `<span class="t-num">${escapeHtml(num)}</span><span class="t-ratio">${escapeHtml(ratio)}</span>`;
      return `<div class="table" style="left:${t.left}px;top:${t.top}px;width:${t.w}px;height:${t.h}px;background:${paint.fill};border-color:${paint.border};color:${paint.text}">${inner}</div>`;
    })
    .join('');

  return `<div class="stage" dir="ltr" style="width:${layout.width}px;height:${layout.height}px">${zones}${labels}${tables}</div>`;
}

function summaryCards(params: ExportSeatingMapParams): string {
  const tables = params.tables || [];
  const seated = tables.reduce((sum, t) => sum + (Number(t.seated) || 0), 0);
  const occupied = tables.filter((t) => (Number(t.seated) || 0) > 0).length;
  const full = tables.filter((t) => {
    const cap = Number(t.seats) || 0;
    const n = Number(t.seated) || 0;
    return cap > 0 && n >= cap;
  }).length;
  const unseated = Number(params.unseatedPeople);
  const cards = [
    { value: tables.length, label: 'שולחנות', cls: '' },
    { value: seated, label: 'מוזמנים שהושבו', cls: 'ok' },
    { value: occupied, label: 'שולחנות עם מוזמנים', cls: '' },
    { value: full, label: 'שולחנות מלאים', cls: 'full' },
  ];
  if (Number.isFinite(unseated) && unseated >= 0) {
    cards.push({ value: unseated, label: 'טרם הושבו', cls: 'wait' });
  }
  return `<div class="summary">${cards
    .map((c) => `<div class="s-card ${c.cls}"><div class="s-val">${c.value}</div><div class="s-lab">${c.label}</div></div>`)
    .join('')}</div>`;
}

function legendHtml(): string {
  return `<div class="legend">
    <i><span class="swatch navy"></span> שולחן</i>
    <i><span class="swatch gold"></span> רזרבה</i>
    <i><span class="swatch green"></span> מלא</i>
    <i class="hint">המספר הגדול הוא מספר השולחן, ומתחתיו יושבים/קיבולת</i>
  </div>`;
}

function headerHtml(params: ExportSeatingMapParams): string {
  const title = String(params.eventTitle || '').trim();
  const when = formatGeneratedAt();
  return `<div class="header">
    <div class="h-eyebrow">מפת הושבה להדפסה</div>
    <h1 class="h-title">${escapeHtml(title || 'מפת הושבה')}</h1>
    <div class="h-sub">${when ? `<span>הופק ${escapeHtml(when)}</span>` : ''}</div>
  </div>
  ${summaryCards(params)}
  ${legendHtml()}`;
}

function listBlock(sliceHtml: string, part: { index: number; count: number }): string {
  const title = part.count > 1 ? `רשימת שולחנות (${part.index + 1}/${part.count})` : 'רשימת שולחנות';
  return `<div class="list-card">
    <div class="list-head"><h2>${title}</h2><span>מספר המוזמנים בכל שולחן</span></div>
    <table class="tbl">
      <thead><tr>
        <th>#</th><th>שולחן</th><th>שם</th><th>מוזמנים</th><th>קיבולת</th><th>פנויים</th>
      </tr></thead>
      <tbody>${sliceHtml}</tbody>
    </table>
  </div>`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const PDF_STYLES = `
  .pdf-root *{ box-sizing:border-box; }
  .pdf-root{
    font-family:"Rubik","Segoe UI",Arial,sans-serif; color:#001D3D;
    background:#fff; direction:rtl; -webkit-print-color-adjust:exact; print-color-adjust:exact;
  }
  .pdf-root .wrap{ padding:4px; }
  .pdf-root .pdf-block{ background:#fff; }
  .pdf-root .header{
    position:relative; overflow:hidden; border-radius:18px; padding:18px 22px;
    background:#06173e; color:#fff;
  }
  .pdf-root .h-eyebrow{ font-size:12px; font-weight:700; color:#F0CB46; margin:0 0 4px; }
  .pdf-root .h-title{ font-size:26px; font-weight:800; margin:0; line-height:1.15; color:#fff; }
  .pdf-root .h-sub{ margin:8px 0 0; font-size:12px; color:#D7E0F2; }
  .pdf-root .summary{ margin:12px 0 4px; }
  .pdf-root .s-card{ display:inline-block; width:18%; margin:0 1% 0 0; border:1px solid #E6E9F0; border-radius:12px; padding:8px 6px; text-align:center; background:#F6F7FB; vertical-align:top; }
  .pdf-root .s-val{ font-size:20px; font-weight:800; line-height:1; color:#06173e; }
  .pdf-root .s-lab{ font-size:11px; color:#6B7385; margin-top:4px; font-weight:700; }
  .pdf-root .s-card.ok .s-val{ color:#047857; }
  .pdf-root .s-card.full .s-val{ color:#1D4ED8; }
  .pdf-root .s-card.wait .s-val{ color:#B45309; }
  .pdf-root .legend{ margin:8px 2px 10px; font-size:12px; color:#475569; }
  .pdf-root .legend i{ font-style:normal; display:inline-block; margin-left:12px; }
  .pdf-root .legend .hint{ color:#64748B; }
  .pdf-root .swatch{ width:14px; height:10px; border-radius:3px; display:inline-block; margin-left:6px; vertical-align:middle; }
  .pdf-root .swatch.navy{ background:#06173e; }
  .pdf-root .swatch.gold{ background:#F0CB46; }
  .pdf-root .swatch.green{ background:#fff; border:2px solid #10B981; }
  .pdf-root .stage{ position:relative; background:#F1F5F9; border-radius:16px; overflow:hidden; border:1px solid #E2E8F0; direction:ltr; }
  .pdf-root .zone{
    position:absolute; border:2px dashed #94A3B8; border-radius:16px; background:rgba(43,140,238,0.05);
    color:#475569; font-size:12px; font-weight:800; direction:rtl; padding:6px 8px; text-align:center;
  }
  .pdf-root .label{
    position:absolute; font-size:12px; font-weight:800; color:#334155; direction:rtl;
  }
  .pdf-root .table{
    position:absolute; border:2px solid #fff; border-radius:14px; overflow:hidden;
    text-align:center; direction:ltr; color:#fff;
  }
  .pdf-root .t-num, .pdf-root .t-ratio, .pdf-root .t-line{
    display:block; font-weight:900; line-height:1.05; text-align:center;
  }
  .pdf-root .t-num{ font-size:16px; margin-top:18%; }
  .pdf-root .t-ratio{ font-size:11px; margin-top:2px; opacity:0.92; }
  .pdf-root .t-line{ font-size:12px; margin-top:22%; }
  .pdf-root .list-card{ margin-top:8px; border:1px solid #E6E9F0; border-radius:16px; overflow:hidden; }
  .pdf-root .list-head{
    padding:12px 14px; background:#F4F6FB; border-bottom:1px solid #E6E9F0;
  }
  .pdf-root .list-head h2{ margin:0; font-size:16px; font-weight:800; display:inline-block; }
  .pdf-root .list-head span{ font-size:12px; color:#64748B; font-weight:700; display:inline-block; margin-right:10px; }
  .pdf-root table.tbl{ width:100%; border-collapse:collapse; font-size:13px; }
  .pdf-root .tbl thead th{
    text-align:right; font-size:11px; font-weight:700; color:#6B7385;
    padding:8px 12px; background:#FCFDFF; border-bottom:1px solid #E6E9F0;
  }
  .pdf-root .tbl tbody td{ padding:8px 12px; border-bottom:1px solid #F0F2F7; }
  .pdf-root .tbl tbody tr:last-child td{ border-bottom:none; }
  .pdf-root .c-idx{ width:36px; color:#94A3B8; text-align:center; }
  .pdf-root .c-num, .pdf-root .c-people, .pdf-root .c-cap, .pdf-root .c-free{ font-weight:800; text-align:center; width:90px; }
  .pdf-root .c-name{ font-weight:700; }
  .pdf-root tr.full td.c-people{ color:#047857; }
  .pdf-root tr.over td.c-people, .pdf-root tr.over td.c-free{ color:#B91C1C; }
  .pdf-root tr.partial td.c-people{ color:#1D4ED8; }
  .pdf-root .empty{ text-align:center; color:#64748B; padding:28px; }
  .pdf-root .footer{ margin-top:12px; font-size:11px; color:#94A3B8; }
`;

function fileName(eventTitle?: string): string {
  const base = String(eventTitle || 'אירוע').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-');
  return `מפת-הושבה-${base || 'אירוע'}.pdf`;
}

function tableListBody(tables: SeatingPdfTable[], startIndex: number): string {
  return tables
    .map((t, i) => {
      const seated = Number(t.seated) || 0;
      const cap = Number(t.seats) || 0;
      const free = cap > 0 ? cap - seated : null;
      const freeLabel = free == null ? '—' : free < 0 ? `חריגה ${Math.abs(free)}` : String(free);
      const tone = cap > 0 && seated > cap ? 'over' : cap > 0 && seated === cap ? 'full' : seated > 0 ? 'partial' : '';
      return `<tr class="${tone}">
        <td class="c-idx">${startIndex + i + 1}</td>
        <td class="c-num">${t.number != null ? escapeHtml(t.number) : '—'}</td>
        <td class="c-name">${escapeHtml(String(t.name || '').trim() || '—')}</td>
        <td class="c-people">${seated}</td>
        <td class="c-cap">${cap > 0 ? cap : '—'}</td>
        <td class="c-free">${escapeHtml(freeLabel)}</td>
      </tr>`;
    })
    .join('');
}

function buildBlocks(params: ExportSeatingMapParams): string[] {
  const blocks = [headerHtml(params), buildStageHtml(params)];
  const sorted = [...(params.tables || [])].sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));
  const parts = chunk(sorted, 16);
  parts.forEach((slice, index) => {
    blocks.push(listBlock(tableListBody(slice, index * 16), { index, count: parts.length }));
  });
  blocks.push(`<div class="footer">הופק באמצעות Moon · מערכת ניהול אירועים</div>`);
  return blocks;
}

function printWindowFallback(params: ExportSeatingMapParams) {
  const html = `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8" />
<title>${escapeHtml(fileName(params.eventTitle))}</title>
<style>html,body{margin:0;padding:16px;background:#fff}@page{size:A4 landscape;margin:10mm}${PDF_STYLES}</style></head>
<body><div class="pdf-root"><div class="wrap">${buildBlocks(params).join('')}</div></div>
<script>window.onload=function(){setTimeout(function(){window.print();},350);};</script>
</body></html>`;
  const w = window.open('', '_blank', 'width=1100,height=800');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}

const RENDER_WIDTH = 1100;
const PAGE = { w: 297, h: 210, margin: 8 };
const BLOCK_GAP = 3;

export async function exportSeatingMapToPdf(params: ExportSeatingMapParams): Promise<boolean> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (!params.tables?.length) return false;

  let jsPDFCtor: any;
  let html2canvas: any;
  try {
    jsPDFCtor = (await import('jspdf')).jsPDF;
    html2canvas = (await import('html2canvas')).default;
  } catch (e) {
    console.warn('PDF libraries failed to load, falling back to print window:', e);
    return printWindowFallback(params);
  }

  const styleEl = document.createElement('style');
  styleEl.setAttribute('data-seating-pdf', '1');
  styleEl.textContent = PDF_STYLES;
  document.head.appendChild(styleEl);

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
      const needed = Math.ceil(Math.max(RENDER_WIDTH, target.scrollWidth, target.offsetWidth));
      if (needed > RENDER_WIDTH) {
        host.style.width = `${needed}px`;
      }
      const canvas = await html2canvas(target, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: Math.max(target.offsetWidth, target.scrollWidth),
        height: Math.max(target.offsetHeight, target.scrollHeight),
        windowWidth: Math.max(needed, RENDER_WIDTH),
        windowHeight: Math.max(target.scrollHeight + 40, target.offsetHeight + 40, 700),
      });
      return canvas;
    } finally {
      document.body.removeChild(host);
    }
  };

  try {
    if ((document as any).fonts?.ready) {
      try {
        await (document as any).fonts.ready;
      } catch {
        // continue with fallback fonts
      }
    }

    const doc = new jsPDFCtor({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    const contentW = PAGE.w - PAGE.margin * 2;
    const pageContentH = PAGE.h - PAGE.margin * 2;
    let cursorY = PAGE.margin;
    let isFirst = true;

    const place = (canvas: HTMLCanvasElement | null, opts?: { map?: boolean }) => {
      if (!canvas || !canvas.width || !canvas.height) return;
      const naturalH = (canvas.height * contentW) / canvas.width;
      let drawW = contentW;
      let drawH = naturalH;
      if (opts?.map && naturalH > pageContentH - 2) {
        drawH = pageContentH;
        drawW = Math.min(contentW, (canvas.width * drawH) / canvas.height);
      } else if (opts?.map) {
        const available = PAGE.margin + pageContentH - cursorY;
        if (naturalH > available && available > 80) {
          drawH = available;
          drawW = Math.min(contentW, (canvas.width * drawH) / canvas.height);
        }
      }

      if (!isFirst && cursorY + drawH > PAGE.margin + pageContentH + 0.1) {
        doc.addPage();
        cursorY = PAGE.margin;
        if (opts?.map && naturalH > pageContentH - 2) {
          drawH = pageContentH;
          drawW = Math.min(contentW, (canvas.width * drawH) / canvas.height);
        }
      }

      const x = PAGE.margin + Math.max(0, (contentW - drawW) / 2);
      const format = opts?.map ? 'PNG' : 'JPEG';
      const data = opts?.map ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.92);
      doc.addImage(data, format, x, cursorY, drawW, drawH);
      cursorY += drawH + BLOCK_GAP;
      isFirst = false;
    };

    const sorted = [...(params.tables || [])].sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));
    const listParts = chunk(sorted, 16);

    place(await renderBlock(headerHtml(params)));
    place(drawSeatingMapCanvas(params), { map: true });
    for (let index = 0; index < listParts.length; index += 1) {
      const slice = listParts[index];
      place(await renderBlock(listBlock(tableListBody(slice, index * 16), { index, count: listParts.length })));
    }
    place(await renderBlock(`<div class="footer">הופק באמצעות Moon · מערכת ניהול אירועים</div>`));

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
    console.warn('Seating PDF render failed, falling back to print window:', e);
    return printWindowFallback(params);
  } finally {
    styleEl.remove();
  }
}
