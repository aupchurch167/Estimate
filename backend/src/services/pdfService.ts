/**
 * PDF rendering for estimate snapshots (Phase 4.5).
 *
 * Pure function: takes a deterministic estimate-shape (the same blob
 * snapshotService stores in EstimateSnapshot.estimateData, or a freshly
 * built one from the live estimate) and returns a Buffer of PDF bytes.
 *
 * Aesthetic: utilitarian, mono-spaced labels, single rule lines,
 * tabular-nums totals, no logos. The brief calls for a "drafting"
 * vibe; pdfkit's defaults render close enough in B&W. Fonts are the
 * built-in Helvetica + Courier so the output is reproducible without
 * shipping font binaries.
 */

import PDFDocument from 'pdfkit';

export interface PdfEstimateSection {
  id: string;
  name: string;
  description: string | null;
  order: number;
}

export interface PdfEstimateLineItem {
  id: string;
  scopeSectionId: string;
  description: string;
  quantity: string | number;
  unitOfMeasure: string;
  lineSellPrice: string | number;
  aiAssumption: string | null;
  status?: string;
}

export interface PdfEstimateData {
  estimate: {
    id: string;
    number: string;
    title: string;
    description: string | null;
    status: string;
    clientCompanyName: string | null;
    clientContactName: string | null;
    clientContactEmail: string | null;
    projectAddressLine1: string | null;
    projectAddressLine2: string | null;
    projectCity: string | null;
    projectState: string | null;
    projectPostalCode: string | null;
    totalCost: string;
    totalMarkup: string;
    totalSellPrice: string;
    validUntil: string | Date | null;
    createdAt: string | Date;
  };
  scopeSections: PdfEstimateSection[];
  lineItems: PdfEstimateLineItem[];
}

export interface RenderEstimatePdfOpts {
  /** Org name for the prepared-by line. */
  organizationName: string;
  /** Optional snapshot label rendered in the header (eg "v3 · APPROVAL"). */
  snapshotLabel?: string;
}

const PAGE_MARGIN = 36;
const COL_GAP = 8;

export function renderEstimatePdf(
  data: PdfEstimateData,
  opts: RenderEstimatePdfOpts,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: {
        top: PAGE_MARGIN,
        bottom: PAGE_MARGIN,
        left: PAGE_MARGIN,
        right: PAGE_MARGIN,
      },
      info: {
        Title: `${data.estimate.number} — ${data.estimate.title}`,
        Author: opts.organizationName,
        Subject: 'Construction estimate',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    drawHeader(doc, data, opts);
    drawClientBlock(doc, data);
    drawSections(doc, data);
    drawTotals(doc, data);
    drawAssumptions(doc, data);
    drawFooter(doc, data, opts);

    doc.end();
  });
}

// ─── Header ───────────────────────────────────────────────────────────────

function drawHeader(
  doc: PDFKit.PDFDocument,
  data: PdfEstimateData,
  opts: RenderEstimatePdfOpts,
): void {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const top = doc.page.margins.top;

  doc.font('Courier-Bold').fontSize(8).fillColor('#666666');
  doc.text(opts.organizationName.toUpperCase(), left, top);

  doc.font('Helvetica-Bold').fontSize(20).fillColor('#1a1a1a');
  doc.text('ESTIMATE', left, top + 14);

  doc.font('Courier').fontSize(9).fillColor('#1a1a1a');
  const meta = [
    `No. ${data.estimate.number}`,
    `Status: ${data.estimate.status}`,
    `Issued: ${formatDate(data.estimate.createdAt)}`,
    data.estimate.validUntil ? `Valid until: ${formatDate(data.estimate.validUntil)}` : null,
    opts.snapshotLabel ? `Version: ${opts.snapshotLabel}` : null,
  ]
    .filter((s): s is string => s !== null)
    .join('   ');
  doc.text(meta, left, top + 38, { width: right - left });

  drawHr(doc, top + 56);
  doc.fillColor('#1a1a1a');
}

// ─── Client / project block ──────────────────────────────────────────────

function drawClientBlock(doc: PDFKit.PDFDocument, data: PdfEstimateData): void {
  doc.y = doc.page.margins.top + 64;
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const colW = (right - left - COL_GAP) / 2;

  const boxTop = doc.y;
  drawLabeledCell(
    doc,
    left,
    boxTop,
    colW,
    'Project',
    [
      data.estimate.title,
      data.estimate.description ?? null,
      formatAddress(data.estimate),
    ],
  );
  drawLabeledCell(
    doc,
    left + colW + COL_GAP,
    boxTop,
    colW,
    'Client',
    [
      data.estimate.clientCompanyName,
      data.estimate.clientContactName,
      data.estimate.clientContactEmail,
    ],
  );
  doc.y = boxTop + 70;
}

function drawLabeledCell(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  label: string,
  lines: (string | null)[],
): void {
  doc.font('Courier-Bold').fontSize(7).fillColor('#666666');
  doc.text(label.toUpperCase(), x, y, { width: w });
  doc.font('Helvetica').fontSize(10).fillColor('#1a1a1a');
  let yy = y + 10;
  for (const line of lines) {
    if (!line) continue;
    doc.text(line, x, yy, { width: w });
    yy = doc.y + 1;
  }
}

// ─── Sections + line items ───────────────────────────────────────────────

function drawSections(doc: PDFKit.PDFDocument, data: PdfEstimateData): void {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const inner = right - left;

  drawHr(doc, doc.y + 6);
  doc.y += 14;

  doc.font('Courier-Bold').fontSize(8).fillColor('#666666');
  doc.text('SCHEDULE OF VALUES', left, doc.y);
  doc.y += 10;

  // column widths: description / qty / UoM / sell
  const colDesc = inner - 60 - 40 - 90;
  const colQty = 60;
  const colUom = 40;
  const colSell = 90;

  drawTableHeader(doc, left, [
    { label: 'Description', w: colDesc, align: 'left' },
    { label: 'Qty', w: colQty, align: 'right' },
    { label: 'UoM', w: colUom, align: 'right' },
    { label: 'Sell', w: colSell, align: 'right' },
  ]);

  const sortedSections = [...data.scopeSections].sort((a, b) => a.order - b.order);
  for (const section of sortedSections) {
    ensureSpace(doc, 30);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#1a1a1a');
    doc.text(section.name, left, doc.y + 6);
    if (section.description) {
      doc.font('Helvetica').fontSize(9).fillColor('#666666');
      doc.text(section.description, left, doc.y, { width: inner });
    }
    doc.y += 4;
    drawHr(doc, doc.y);
    doc.y += 4;

    const lines = data.lineItems
      .filter((li) => li.scopeSectionId === section.id)
      .sort((a, b) => sortOrder(a, b));

    if (lines.length === 0) {
      doc.font('Courier').fontSize(8).fillColor('#999999');
      doc.text('— no line items —', left, doc.y + 2);
      doc.y += 10;
      continue;
    }

    for (const li of lines) {
      ensureSpace(doc, 20);
      const rowY = doc.y + 2;
      doc.font('Helvetica').fontSize(10).fillColor('#1a1a1a');
      const descHeight = doc.heightOfString(li.description, { width: colDesc });
      doc.text(li.description, left, rowY, { width: colDesc });
      doc
        .font('Courier')
        .fontSize(10)
        .text(formatQty(li.quantity), left + colDesc, rowY, {
          width: colQty,
          align: 'right',
        })
        .text(li.unitOfMeasure, left + colDesc + colQty, rowY, {
          width: colUom,
          align: 'right',
        })
        .text(formatMoney(li.lineSellPrice), left + colDesc + colQty + colUom, rowY, {
          width: colSell,
          align: 'right',
        });
      doc.y = rowY + Math.max(descHeight, 12);
      drawHr(doc, doc.y + 2, '#eeeeee');
      doc.y += 4;
    }
  }
}

function drawTableHeader(
  doc: PDFKit.PDFDocument,
  left: number,
  cols: { label: string; w: number; align: 'left' | 'right' }[],
): void {
  doc.font('Courier-Bold').fontSize(7).fillColor('#666666');
  let x = left;
  for (const c of cols) {
    doc.text(c.label.toUpperCase(), x, doc.y, { width: c.w, align: c.align });
    x += c.w;
  }
  doc.y += 12;
  drawHr(doc, doc.y);
  doc.y += 4;
}

// ─── Totals ──────────────────────────────────────────────────────────────

function drawTotals(doc: PDFKit.PDFDocument, data: PdfEstimateData): void {
  ensureSpace(doc, 60);
  drawHr(doc, doc.y + 6);
  doc.y += 12;

  const right = doc.page.width - doc.page.margins.right;
  const w = 220;
  const x = right - w;

  drawTotalsRow(doc, x, w, 'Subtotal (cost)', formatMoney(data.estimate.totalCost), false);
  drawTotalsRow(doc, x, w, 'Markup', formatMoney(data.estimate.totalMarkup), false);
  drawTotalsRow(doc, x, w, 'Total', formatMoney(data.estimate.totalSellPrice), true);
}

function drawTotalsRow(
  doc: PDFKit.PDFDocument,
  x: number,
  w: number,
  label: string,
  value: string,
  emphasize: boolean,
): void {
  const y = doc.y;
  doc
    .font(emphasize ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(emphasize ? 13 : 10)
    .fillColor('#1a1a1a')
    .text(label, x, y, { width: w / 2, align: 'left' });
  doc
    .font(emphasize ? 'Courier-Bold' : 'Courier')
    .fontSize(emphasize ? 13 : 10)
    .text(value, x + w / 2, y, { width: w / 2, align: 'right' });
  doc.y = y + (emphasize ? 18 : 14);
}

// ─── Assumptions ─────────────────────────────────────────────────────────

function drawAssumptions(doc: PDFKit.PDFDocument, data: PdfEstimateData): void {
  const items = data.lineItems
    .filter((li) => li.aiAssumption && li.aiAssumption.trim().length > 0)
    .map((li) => ({ description: li.description, text: li.aiAssumption ?? '' }));
  if (items.length === 0) return;
  ensureSpace(doc, 50);
  drawHr(doc, doc.y + 6);
  doc.y += 12;

  doc.font('Courier-Bold').fontSize(8).fillColor('#666666');
  doc.text('ASSUMPTIONS — please confirm', doc.page.margins.left, doc.y);
  doc.y += 10;

  doc.font('Helvetica').fontSize(9).fillColor('#1a1a1a');
  for (const a of items) {
    ensureSpace(doc, 18);
    doc.text(`• ${a.description}: ${a.text}`, doc.page.margins.left, doc.y, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    });
    doc.y += 2;
  }
}

// ─── Footer ──────────────────────────────────────────────────────────────

function drawFooter(
  doc: PDFKit.PDFDocument,
  data: PdfEstimateData,
  opts: RenderEstimatePdfOpts,
): void {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const y = doc.page.height - doc.page.margins.bottom + 10;
  doc.font('Courier').fontSize(7).fillColor('#999999');
  doc.text(
    `${opts.organizationName} · Estimate ${data.estimate.number} · Generated ${formatDate(new Date())}`,
    left,
    y,
    { width: right - left, align: 'center' },
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function drawHr(doc: PDFKit.PDFDocument, y: number, color = '#1a1a1a'): void {
  doc
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.width - doc.page.margins.right, y)
    .lineWidth(0.5)
    .strokeColor(color)
    .stroke();
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) doc.addPage();
}

function formatDate(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

function formatMoney(v: string | number): string {
  const n = typeof v === 'string' ? Number(v) : v;
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatQty(v: string | number): string {
  const n = typeof v === 'string' ? Number(v) : v;
  if (!Number.isFinite(n)) return '—';
  // Drop trailing .00 but keep up to 4 dp.
  const s = n.toLocaleString('en-US', { maximumFractionDigits: 4 });
  return s;
}

function formatAddress(estimate: PdfEstimateData['estimate']): string | null {
  const parts = [
    estimate.projectAddressLine1,
    estimate.projectAddressLine2,
    [estimate.projectCity, estimate.projectState].filter(Boolean).join(', ') || null,
    estimate.projectPostalCode,
  ].filter(Boolean);
  return parts.length ? parts.join('\n') : null;
}

function sortOrder(a: PdfEstimateLineItem, b: PdfEstimateLineItem): number {
  const ao = (a as { order?: number }).order ?? 0;
  const bo = (b as { order?: number }).order ?? 0;
  return ao - bo;
}
