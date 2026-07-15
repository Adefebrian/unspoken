import type { UnspokenDTO } from "../../shared/types.ts";
import { relativeTime } from "./time.ts";

// Instagram story canvas: 1080 x 1920 (9:16). Rendered clean and minimalist,
// on the same warm paper palette as the site, with a minimal domain footer.
export const STORY_W = 1080;
export const STORY_H = 1920;

const PALETTE = {
  paper: "#f3efe6",
  card: "#fdfcf8",
  ink: "#22221e",
  inkSoft: "#5f5b52",
  inkFaint: "#6f6959",
  line: "#d8d0bd",
  sage: "#5d6d50",
};

let fontsPromise: Promise<void> | null = null;

// Canvas can only paint a webfont once it is actually loaded. The page already
// declares these via @font-face, so we just make sure the glyphs are resident.
function ensureFonts(): Promise<void> {
  if (fontsPromise) return fontsPromise;
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts) {
    fontsPromise = Promise.resolve();
    return fontsPromise;
  }
  const wanted = [
    '500 64px "Shantell Sans"',
    '400 44px "Shantell Sans"',
    '800 60px "Inter"',
    '600 30px "Inter"',
    '500 30px "Inter"',
  ];
  fontsPromise = Promise.all(wanted.map((f) => fonts.load(f).catch(() => {})))
    .then(() => fonts.ready)
    .then(() => {});
  return fontsPromise;
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, px: number): void {
  try {
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${px}px`;
  } catch {
    /* older browsers: ignore, spacing just falls back to default */
  }
}

// Word-wrap one paragraph to a max width for the given font.
function wrapParagraph(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const attempt = line ? `${line} ${word}` : word;
    if (ctx.measureText(attempt).width <= maxWidth || !line) {
      line = attempt;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function wrapBody(ctx: CanvasRenderingContext2D, body: string, maxWidth: number): string[] {
  return body
    .replace(/\r\n/g, "\n")
    .split("\n")
    .flatMap((para) => (para.trim() ? wrapParagraph(ctx, para, maxWidth) : [""]));
}

// Shrink the handwriting until the whole letter fits the body box; if it still
// overflows at the smallest size, clamp with an ellipsis so it stays readable.
function fitBody(
  ctx: CanvasRenderingContext2D,
  body: string,
  maxWidth: number,
  maxHeight: number,
): { lines: string[]; size: number; lineHeight: number } {
  for (let size = 64; size >= 32; size -= 2) {
    const lineHeight = Math.round(size * 1.5);
    ctx.font = `500 ${size}px "Shantell Sans", cursive`;
    const lines = wrapBody(ctx, body, maxWidth);
    if (lines.length * lineHeight <= maxHeight) return { lines, size, lineHeight };
  }
  const size = 32;
  const lineHeight = Math.round(size * 1.5);
  ctx.font = `500 ${size}px "Shantell Sans", cursive`;
  const all = wrapBody(ctx, body, maxWidth);
  const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
  const lines = all.slice(0, maxLines);
  if (all.length > maxLines && lines.length) {
    const last = lines.length - 1;
    let text = lines[last];
    while (text && ctx.measureText(`${text}…`).width > maxWidth) {
      text = text.slice(0, -1).trimEnd();
    }
    lines[last] = `${text}…`;
  }
  return { lines, size, lineHeight };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Paint the letter into a fresh 1080x1920 canvas sized for an Instagram story. */
export async function renderStory(u: UnspokenDTO): Promise<HTMLCanvasElement> {
  await ensureFonts();

  const canvas = document.createElement("canvas");
  canvas.width = STORY_W;
  canvas.height = STORY_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");

  // --- Background: warm paper + soft on-brand glows -----------------------
  ctx.fillStyle = PALETTE.paper;
  ctx.fillRect(0, 0, STORY_W, STORY_H);

  const topGlow = ctx.createRadialGradient(STORY_W / 2, -240, 80, STORY_W / 2, -240, 1100);
  topGlow.addColorStop(0, "rgba(255,255,255,0.55)");
  topGlow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, 0, STORY_W, STORY_H);

  const sageGlow = ctx.createRadialGradient(120, STORY_H, 60, 120, STORY_H, 1000);
  sageGlow.addColorStop(0, "rgba(111,129,99,0.10)");
  sageGlow.addColorStop(1, "rgba(111,129,99,0)");
  ctx.fillStyle = sageGlow;
  ctx.fillRect(0, 0, STORY_W, STORY_H);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // --- Top wordmark -------------------------------------------------------
  ctx.font = '800 44px "Inter", sans-serif';
  setLetterSpacing(ctx, -1);
  const topText = "unspoken";
  const topW = ctx.measureText(topText).width;
  ctx.fillStyle = PALETTE.ink;
  ctx.fillText(topText, STORY_W / 2 - 8, 214);
  ctx.fillStyle = PALETTE.sage;
  ctx.fillText(".", STORY_W / 2 - 8 + topW / 2 + 8, 214);
  setLetterSpacing(ctx, 0);

  // --- Card ---------------------------------------------------------------
  const cardX = 84;
  const cardW = STORY_W - cardX * 2;
  const cardY = 322;
  const cardH = 1170;
  const pad = 78;
  const innerW = cardW - pad * 2;

  ctx.save();
  ctx.shadowColor = "rgba(20,20,18,0.28)";
  ctx.shadowBlur = 70;
  ctx.shadowOffsetY = 40;
  roundRect(ctx, cardX, cardY, cardW, cardH, 40);
  ctx.fillStyle = PALETTE.card;
  ctx.fill();
  ctx.restore();
  roundRect(ctx, cardX, cardY, cardW, cardH, 40);
  ctx.strokeStyle = PALETTE.line;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Washi tape tab, like the letter modal.
  ctx.save();
  ctx.translate(STORY_W / 2, cardY);
  ctx.rotate((-1.5 * Math.PI) / 180);
  roundRect(ctx, -95, -22, 190, 42, 5);
  ctx.fillStyle = "rgba(93,109,80,0.20)";
  ctx.fill();
  ctx.setLineDash([7, 6]);
  ctx.strokeStyle = "rgba(93,109,80,0.45)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // Eyebrow
  ctx.font = '600 28px "Inter", sans-serif';
  setLetterSpacing(ctx, 5);
  ctx.fillStyle = PALETTE.sage;
  ctx.fillText("AN UNSPOKEN LETTER", STORY_W / 2, cardY + 118);
  setLetterSpacing(ctx, 0);

  // Body (auto-fit handwriting), vertically centered in its box.
  const bodyTop = cardY + 176;
  const bodyBottom = cardY + cardH - 152;
  const bodyBoxH = bodyBottom - bodyTop;
  const { lines, size, lineHeight } = fitBody(ctx, u.body.trim(), innerW, bodyBoxH);

  ctx.fillStyle = PALETTE.ink;
  ctx.font = `500 ${size}px "Shantell Sans", cursive`;
  const blockH = lines.length * lineHeight;
  let ty = bodyTop + (bodyBoxH - blockH) / 2 + lineHeight * 0.72;
  for (const line of lines) {
    ctx.fillText(line, STORY_W / 2, ty);
    ty += lineHeight;
  }

  // Divider + meta line
  const metaY = cardY + cardH - 96;
  ctx.strokeStyle = PALETTE.line;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cardX + pad, metaY - 40);
  ctx.lineTo(cardX + cardW - pad, metaY - 40);
  ctx.stroke();

  const bits: string[] = ["left here by someone"];
  const when = relativeTime(u.createdAt);
  if (when) bits.push(when);
  if (u.relateCount > 0) bits.push(`${u.relateCount} relate`);
  if (u.hugCount > 0) bits.push(`${u.hugCount} hugs`);
  ctx.font = '500 28px "Inter", sans-serif';
  ctx.fillStyle = PALETTE.inkFaint;
  ctx.fillText(bits.join("  ·  "), STORY_W / 2, metaY + 6);

  // --- Footer: domain only, small and minimalist -------------------------
  ctx.textAlign = "center";
  ctx.font = '500 30px "Inter", sans-serif';
  setLetterSpacing(ctx, 3);
  ctx.fillStyle = PALETTE.inkFaint;
  ctx.fillText("unspoken.zone", STORY_W / 2, 1760);
  setLetterSpacing(ctx, 0);

  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/png",
    );
  });
}
