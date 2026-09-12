/**
 * field.ts — Canvas renderer for the football field graphic.
 *
 * Produces a 288×80 greyscale PNG (base64) suitable for the G2's
 * 4-bit greyscale image container via updateImageRawData.
 *
 * Coordinate system: 0 = away (left) end zone, 100 = home (right) end zone.
 */

// ── Layout constants ────────────────────────────────────────────────
export const FIELD_W = 288;
export const FIELD_H = 80;

const EZ_WIDTH = 20; // pixels per end zone
const FIELD_LEFT = EZ_WIDTH; // where the 0 yard line starts
const FIELD_RIGHT = FIELD_W - EZ_WIDTH; // where the 100 yard line ends
const FIELD_SPAN = FIELD_RIGHT - FIELD_LEFT; // playable pixel width

// ── Greyscale palette (0–255, G2 converts to 4-bit) ────────────────
const COL = {
  fieldBg: 30,
  endzone: 50,
  endzoneText: 90,
  sideline: 100,
  yardLine: 75,
  hashMark: 60,
  yardNum: 95,
  scrimmage: 210,
  firstDown: 170,
  arrow: 255,
  arrowOutline: 140,
};

// ── Public API ──────────────────────────────────────────────────────

export interface FieldRenderOptions {
  /** Ball position: 0 = away end zone, 100 = home end zone */
  ballYard: number;
  /** First-down marker position (same coordinate system). null = hide. */
  firstDownYard: number | null;
  /** 6-char abbreviation for away team (left end zone) */
  awayLabel: string;
  /** 6-char abbreviation for home team (right end zone) */
  homeLabel: string;
  /** Which side has the ball — used for arrow color emphasis */
  possession: 'home' | 'away' | null;
}

/**
 * Render the football field to an offscreen canvas and return
 * the image as a base64-encoded PNG string (no data-URI prefix).
 */
export function renderField(opts: FieldRenderOptions): string {
  const canvas = document.createElement('canvas');
  canvas.width = FIELD_W;
  canvas.height = FIELD_H;
  const ctx = canvas.getContext('2d')!;

  drawBackground(ctx);
  drawEndZones(ctx, opts.awayLabel, opts.homeLabel);
  drawYardLines(ctx);
  drawHashMarks(ctx);
  drawYardNumbers(ctx);
  drawSidelines(ctx);

  if (opts.firstDownYard != null) {
    drawFirstDownLine(ctx, opts.firstDownYard);
  }

  drawScrimmageLine(ctx, opts.ballYard);
  drawBallArrow(ctx, opts.ballYard);

  // Return base64 PNG (strip the data-URI prefix)
  return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
}

// ── Drawing helpers ─────────────────────────────────────────────────

function yardToX(yard: number): number {
  return FIELD_LEFT + (yard / 100) * FIELD_SPAN;
}

function grey(level: number): string {
  return `rgb(${level},${level},${level})`;
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = grey(COL.fieldBg);
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
}

function drawEndZones(
  ctx: CanvasRenderingContext2D,
  awayLabel: string,
  homeLabel: string,
) {
  // Away end zone (left)
  ctx.fillStyle = grey(COL.endzone);
  ctx.fillRect(0, 0, EZ_WIDTH, FIELD_H);

  // Home end zone (right)
  ctx.fillRect(FIELD_W - EZ_WIDTH, 0, EZ_WIDTH, FIELD_H);

  // End zone labels (drawn vertically)
  ctx.save();
  ctx.font = 'bold 9px monospace';
  ctx.fillStyle = grey(COL.endzoneText);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Away label — rotated 270° (bottom to top)
  ctx.save();
  ctx.translate(EZ_WIDTH / 2, FIELD_H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(awayLabel.slice(0, 5), 0, 0);
  ctx.restore();

  // Home label — rotated 90° (top to bottom)
  ctx.save();
  ctx.translate(FIELD_W - EZ_WIDTH / 2, FIELD_H / 2);
  ctx.rotate(Math.PI / 2);
  ctx.fillText(homeLabel.slice(0, 5), 0, 0);
  ctx.restore();

  ctx.restore();
}

function drawSidelines(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = grey(COL.sideline);
  ctx.lineWidth = 1;
  // Top sideline
  ctx.beginPath();
  ctx.moveTo(FIELD_LEFT, 4);
  ctx.lineTo(FIELD_RIGHT, 4);
  ctx.stroke();
  // Bottom sideline
  ctx.beginPath();
  ctx.moveTo(FIELD_LEFT, FIELD_H - 4);
  ctx.lineTo(FIELD_RIGHT, FIELD_H - 4);
  ctx.stroke();
}

function drawYardLines(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = grey(COL.yardLine);
  ctx.lineWidth = 1;

  for (let yd = 10; yd <= 90; yd += 10) {
    const x = Math.round(yardToX(yd));
    ctx.beginPath();
    ctx.moveTo(x, 5);
    ctx.lineTo(x, FIELD_H - 5);
    ctx.stroke();
  }

  // Goal lines (brighter)
  ctx.strokeStyle = grey(COL.sideline);
  ctx.lineWidth = 2;
  for (const yd of [0, 100]) {
    const x = Math.round(yardToX(yd));
    ctx.beginPath();
    ctx.moveTo(x, 4);
    ctx.lineTo(x, FIELD_H - 4);
    ctx.stroke();
  }
}

function drawHashMarks(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = grey(COL.hashMark);
  ctx.lineWidth = 1;

  for (let yd = 5; yd <= 95; yd += 5) {
    if (yd % 10 === 0) continue; // skip major yard lines
    const x = Math.round(yardToX(yd));
    // Top hash
    ctx.beginPath();
    ctx.moveTo(x, 5);
    ctx.lineTo(x, 10);
    ctx.stroke();
    // Upper-mid hash
    ctx.beginPath();
    ctx.moveTo(x, 30);
    ctx.lineTo(x, 35);
    ctx.stroke();
    // Lower-mid hash
    ctx.beginPath();
    ctx.moveTo(x, FIELD_H - 35);
    ctx.lineTo(x, FIELD_H - 30);
    ctx.stroke();
    // Bottom hash
    ctx.beginPath();
    ctx.moveTo(x, FIELD_H - 10);
    ctx.lineTo(x, FIELD_H - 5);
    ctx.stroke();
  }
}

function drawYardNumbers(ctx: CanvasRenderingContext2D) {
  ctx.font = '8px monospace';
  ctx.fillStyle = grey(COL.yardNum);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Yard numbers: 10, 20, 30, 40, 50, 40, 30, 20, 10
  const labels = [10, 20, 30, 40, 50, 40, 30, 20, 10];
  const yards = [10, 20, 30, 40, 50, 60, 70, 80, 90];

  for (let i = 0; i < yards.length; i++) {
    const x = yardToX(yards[i]);
    // Top number row
    ctx.fillText(String(labels[i]), x, 18);
    // Bottom number row
    ctx.fillText(String(labels[i]), x, FIELD_H - 18);
  }
}

function drawScrimmageLine(ctx: CanvasRenderingContext2D, yard: number) {
  const x = Math.round(yardToX(yard));
  ctx.strokeStyle = grey(COL.scrimmage);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, 4);
  ctx.lineTo(x, FIELD_H - 4);
  ctx.stroke();
}

function drawFirstDownLine(ctx: CanvasRenderingContext2D, yard: number) {
  const x = Math.round(yardToX(yard));
  ctx.strokeStyle = grey(COL.firstDown);
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(x, 4);
  ctx.lineTo(x, FIELD_H - 4);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawBallArrow(ctx: CanvasRenderingContext2D, yard: number) {
  const x = yardToX(yard);
  const tipY = 40; // vertical center
  const size = 7;

  // Filled downward-pointing triangle
  ctx.fillStyle = grey(COL.arrow);
  ctx.beginPath();
  ctx.moveTo(x, tipY + size); // bottom point
  ctx.lineTo(x - size, tipY - size); // top-left
  ctx.lineTo(x + size, tipY - size); // top-right
  ctx.closePath();
  ctx.fill();

  // Outline for contrast
  ctx.strokeStyle = grey(COL.arrowOutline);
  ctx.lineWidth = 1;
  ctx.stroke();

  // Small bright dot at exact ball position
  ctx.fillStyle = grey(COL.arrow);
  ctx.beginPath();
  ctx.arc(x, tipY + size + 4, 3, 0, Math.PI * 2);
  ctx.fill();
}

// ── Browser preview (renders the field into the #preview div) ───────

export function renderPreview(opts: FieldRenderOptions) {
  const container = document.getElementById('preview');
  if (!container) return;

  const canvas = document.createElement('canvas');
  canvas.width = FIELD_W;
  canvas.height = FIELD_H;
  canvas.style.left = `${(576 - FIELD_W) / 2}px`;
  canvas.style.top = '60px';

  const ctx = canvas.getContext('2d')!;

  // Re-draw everything on the visible canvas (for browser preview)
  drawBackground(ctx);
  drawEndZones(ctx, opts.awayLabel, opts.homeLabel);
  drawYardLines(ctx);
  drawHashMarks(ctx);
  drawYardNumbers(ctx);
  drawSidelines(ctx);
  if (opts.firstDownYard != null) drawFirstDownLine(ctx, opts.firstDownYard);
  drawScrimmageLine(ctx, opts.ballYard);
  drawBallArrow(ctx, opts.ballYard);

  // Replace existing field canvas
  const existing = container.querySelector('canvas');
  if (existing) existing.remove();
  container.appendChild(canvas);
}
