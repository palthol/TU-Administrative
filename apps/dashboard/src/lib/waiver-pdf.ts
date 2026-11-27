import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { getLegalCopy } from "./waiver-legal.ts";
import { cropSignaturePng } from "./waiver-png.ts";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const CONTENT_TOP = PAGE_HEIGHT - MARGIN;
const CONTENT_BOTTOM = 72;
const SIGNATURE_BOX_WIDTH = Math.min(360, CONTENT_WIDTH);
const SIGNATURE_BOX_HEIGHT = 96;

const LAYOUT_MESSAGE =
  "The signed document could not be assembled completely, so it was not opened.";
const SIGNATURE_MESSAGE =
  "The signature image could not be read, so the document was not opened. Refresh the document link and try again.";
const RECORD_MESSAGE =
  "The signed waiver record could not be loaded, so the document was not opened.";

const PUNCTUATION: Record<string, string> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201c": '"',
  "\u201d": '"',
  "\u2013": "-",
  "\u2014": "-",
  "\u2026": "...",
  "\u00a0": " ",
};

export class WaiverDocumentError extends Error {
  readonly detail?: string;

  constructor(message: string, detail?: string) {
    super(message);
    this.name = "WaiverDocumentError";
    this.detail = detail;
  }
}

export function presentWaiverPdfError(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") return "";
  if (error instanceof WaiverDocumentError) return error.message;
  if (
    error instanceof Error &&
    /^(Unavailable:|Session expired|Your staff role|The API returned|Request timed out|Connection unavailable|Class response)/.test(
      error.message,
    )
  ) {
    return error.message;
  }
  return "The signed document could not be opened. Refresh the document link and try again.";
}

type FontKind = "regular" | "bold";

export type PlacedText = {
  page: number;
  text: string;
  x: number;
  y: number;
  size: number;
  width: number;
  height: number;
  font: FontKind;
  region: "body" | "footer";
};

export type PlacedImage = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WaiverPdfPlacement = {
  pageCount: number;
  texts: PlacedText[];
  signature: PlacedImage & { caption: string; box: PlacedImage };
};

type DrawImage = PlacedImage & { png: Uint8Array };
type DrawRect = PlacedImage;

export type WaiverPdfInput = {
  waiverId: string;
  signedAt: string | null;
  locale: string | null;
  contentVersion: string | null;
  documentSha256: string | null;
  fullName: string | null;
  dateOfBirth: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  emergencyName: string | null;
  emergencyRelationship: string | null;
  emergencyPhone: string | null;
  emergencyEmail: string | null;
  medical: Array<{ label: string; value: string }>;
  consent: string | null;
  initials: Array<{ label: string; value: string | null }>;
  signaturePng: Uint8Array;
};

type CalendarDay = { y: number; m: number; d: number };

function calendarDay(value: string | null | undefined): CalendarDay | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

function signedDay(value: string | null | undefined): CalendarDay | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return calendarDay(trimmed);
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return calendarDay(trimmed);
  return calendarDay(parsed.toISOString());
}

export function isMinorAtSigning(
  dateOfBirth: string | null | undefined,
  signedAt: string | null | undefined,
): boolean {
  const birth = calendarDay(dateOfBirth);
  const signed = signedDay(signedAt);
  if (!birth || !signed) return false;
  const adult = Date.UTC(birth.y + 18, birth.m - 1, birth.d);
  const signedUtc = Date.UTC(signed.y, signed.m - 1, signed.d);
  return signedUtc < adult;
}

function utcDay(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export function waiverRecordPath(signedAt: unknown, offset = 0): string {
  const params = new URLSearchParams({
    sort: "signed_at_utc",
    order: "desc",
    limit: "50",
    offset: String(Math.max(0, offset)),
  });
  const day = utcDay(signedAt);
  if (day) {
    params.set("start", day);
    const end = new Date(`${day}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    params.set("end", end.toISOString().slice(0, 10));
  }
  return `/api/admin/reporting/views/waiver-documents?${params}`;
}

export async function findWaiverRecord(
  read: (path: string) => Promise<{ rows?: Record<string, unknown>[] }>,
  waiverId: string,
  signedAt: unknown,
): Promise<Record<string, unknown>> {
  const dated = await scanWaiverPages(read, waiverId, signedAt);
  if (dated) return dated;
  if (utcDay(signedAt)) {
    const fallback = await scanWaiverPages(read, waiverId, null);
    if (fallback) return fallback;
  }
  throw new WaiverDocumentError(RECORD_MESSAGE);
}

async function scanWaiverPages(
  read: (path: string) => Promise<{ rows?: Record<string, unknown>[] }>,
  waiverId: string,
  signedAt: unknown,
): Promise<Record<string, unknown> | null> {
  for (let page = 0; page < 20; page++) {
    const data = await read(waiverRecordPath(signedAt, page * 50));
    const rows = Array.isArray(data.rows) ? data.rows : [];
    const match = rows.find((row) => String(row.waiver_id ?? "") === waiverId);
    if (match) return match;
    if (rows.length < 50) return null;
  }
  return null;
}

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function yesNo(value: unknown): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "Not recorded";
}

function addressOf(record: Record<string, unknown>): string | null {
  const city = [
    asText(record.participant_city),
    asText(record.participant_state),
    asText(record.participant_zip),
  ]
    .filter(Boolean)
    .join(", ");
  const parts = [asText(record.participant_address_line), city || null].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function injurySummary(record: Record<string, unknown>): string {
  const parts: string[] = [];
  if (record.injuries_knees === true) parts.push("Knees");
  if (record.injuries_lower_back === true) parts.push("Lower back");
  if (record.injuries_neck_shoulders === true) parts.push("Neck and shoulders");
  if (record.injuries_hip_pelvis === true) parts.push("Hip and pelvis");
  if (record.injuries_other_has === true) {
    const details = asText(record.injuries_other_details);
    parts.push(details ? `Other (${details})` : "Other");
  }
  return parts.length ? parts.join(", ") : "Not recorded";
}

export function sourceFromRecord(
  record: Record<string, unknown>,
  extras: {
    signaturePng: Uint8Array;
    locale?: string | null;
    contentVersion?: string | null;
    documentSha256?: string | null;
  },
): WaiverPdfInput {
  const hash = asText(extras.documentSha256);
  return {
    waiverId: String(record.waiver_id ?? ""),
    signedAt: asText(record.signed_at_utc),
    locale: asText(extras.locale) ?? asText(record.locale),
    contentVersion: asText(extras.contentVersion) ?? asText(record.content_version),
    documentSha256: hash && /^[a-fA-F0-9]{32,128}$/.test(hash) ? hash.toLowerCase() : null,
    fullName: asText(record.participant_full_name),
    dateOfBirth: asText(record.participant_date_of_birth),
    email: asText(record.participant_email),
    phone: asText(record.participant_cell_phone) ?? asText(record.participant_home_phone),
    address: addressOf(record),
    emergencyName: asText(record.emergency_contact_name),
    emergencyRelationship: asText(record.emergency_contact_relationship),
    emergencyPhone: asText(record.emergency_contact_phone),
    emergencyEmail: asText(record.emergency_contact_email),
    medical: [
      ["Heart disease", yesNo(record.heart_disease)],
      ["Shortness of breath", yesNo(record.shortness_of_breath)],
      ["High blood pressure", yesNo(record.high_blood_pressure)],
      ["Smoking", yesNo(record.smoking)],
      ["Diabetes", yesNo(record.diabetes)],
      ["Family history", yesNo(record.family_history)],
      ["Workouts", yesNo(record.workouts)],
      ["Medication", yesNo(record.medication)],
      ["Alcohol", yesNo(record.alcohol)],
      ["Last physical", asText(record.last_physical) ?? "Not recorded"],
      ["Exercise restrictions", asText(record.exercise_restriction) ?? "Not recorded"],
      ["Injuries", injurySummary(record)],
      ["Recent injury", yesNo(record.had_recent_injury)],
      ["Injury details", asText(record.injury_details) ?? "Not recorded"],
      ["Physician cleared", yesNo(record.physician_cleared)],
      ["Clearance notes", asText(record.clearance_notes) ?? "Not recorded"],
    ].map(([label, value]) => ({ label, value })),
    consent:
      record.consent_acknowledged === true
        ? "Yes"
        : record.consent_acknowledged === false
          ? "No"
          : null,
    initials: [
      { label: "Risk initials", value: asText(record.initials_risk_assumption) },
      { label: "Release initials", value: asText(record.initials_release) },
      {
        label: "Indemnification initials",
        value: asText(record.initials_indemnification),
      },
      { label: "Media initials", value: asText(record.initials_media_release) },
    ],
    signaturePng: extras.signaturePng,
  };
}

export async function readSignaturePng(
  url: string,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new WaiverDocumentError(SIGNATURE_MESSAGE);
  }
  if (!response.ok) throw new WaiverDocumentError(SIGNATURE_MESSAGE);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50) {
    throw new WaiverDocumentError(SIGNATURE_MESSAGE);
  }
  return bytes;
}

function sanitize(text: string, font: PDFFont): string {
  let mapped = "";
  for (const character of text) mapped += PUNCTUATION[character] ?? character;
  let encoded = "";
  for (const character of mapped) {
    const printable = character === "\n" || character === "\t" ? " " : character;
    try {
      font.encodeText(printable);
      encoded += printable;
    } catch {
      encoded += "?";
    }
  }
  return encoded.replace(/\s+/g, " ").trim();
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  const push = (value: string) => {
    if (value) lines.push(value);
  };
  for (const word of words) {
    let remaining = word;
    while (font.widthOfTextAtSize(remaining, size) > maxWidth) {
      let count = 1;
      while (
        count < remaining.length &&
        font.widthOfTextAtSize(remaining.slice(0, count + 1), size) <= maxWidth
      ) {
        count += 1;
      }
      if (current) {
        push(current);
        current = "";
      }
      push(remaining.slice(0, count));
      remaining = remaining.slice(count);
    }
    const next = current ? `${current} ${remaining}` : remaining;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) current = next;
    else {
      push(current);
      current = remaining;
    }
  }
  push(current);
  return lines.length ? lines : ["Not recorded"];
}

class PageLayout {
  readonly texts: PlacedText[] = [];
  readonly images: DrawImage[] = [];
  readonly rects: DrawRect[] = [];
  private page = 0;
  private baseline = CONTENT_TOP - 16;
  private readonly regular: PDFFont;
  private readonly bold: PDFFont;

  constructor(regular: PDFFont, bold: PDFFont) {
    this.regular = regular;
    this.bold = bold;
  }

  private face(kind: FontKind): PDFFont {
    return kind === "bold" ? this.bold : this.regular;
  }

  private breakPage() {
    this.page += 1;
    this.baseline = CONTENT_TOP - 10;
    this.line("Temple Underground health assessment and waiver", 10, "bold", 3);
    this.line("Continued", 9, "regular", 8);
  }

  private line(text: string, size: number, kind: FontKind, leading: number, x = MARGIN) {
    const font = this.face(kind);
    const safe = sanitize(text, font);
    const width = font.widthOfTextAtSize(safe, size);
    if (width > CONTENT_WIDTH + 0.01) {
      throw new WaiverDocumentError(LAYOUT_MESSAGE, "line wider than the content box");
    }
    if (this.baseline < CONTENT_BOTTOM + size) this.breakPage();
    if (x < MARGIN || x + width > MARGIN + CONTENT_WIDTH + 0.01) {
      throw new WaiverDocumentError(LAYOUT_MESSAGE, "text outside the content box");
    }
    this.texts.push({
      page: this.page,
      text: safe,
      x,
      y: this.baseline,
      size,
      width,
      height: size,
      font: kind,
      region: "body",
    });
    this.baseline -= size + leading;
  }

  paragraph(text: string, size: number, kind: FontKind, leading = 4) {
    const font = this.face(kind);
    const safe = sanitize(text, font) || "Not recorded";
    const lines = wrapText(safe, font, size, CONTENT_WIDTH);
    const compact = (value: string) => value.replace(/\s+/g, "");
    if (compact(lines.join("")) !== compact(safe)) {
      throw new WaiverDocumentError(LAYOUT_MESSAGE, "wrapped text dropped characters");
    }
    for (const line of lines) this.line(line, size, kind, leading);
  }

  heading(text: string) {
    if (this.baseline < CONTENT_BOTTOM + 13 + 8 + 22) this.breakPage();
    this.baseline -= 8;
    this.paragraph(text, 13, "bold", 6);
  }

  field(label: string, value: string | null) {
    this.paragraph(label, 8, "bold", 2);
    this.paragraph(value?.trim() || "Not recorded", 11, "regular", 7);
  }

  signature(caption: string, image: { png: Uint8Array; width: number; height: number }) {
    const size = 12;
    if (this.baseline < CONTENT_BOTTOM + size + 8 + SIGNATURE_BOX_HEIGHT) this.breakPage();
    const captionBaseline = this.baseline;
    this.line(caption, size, "bold", 8);
    const boxTop = captionBaseline - size - 8;
    const boxBottom = boxTop - SIGNATURE_BOX_HEIGHT;
    const pad = 6;
    const scale = Math.min(
      (SIGNATURE_BOX_WIDTH - pad * 2) / image.width,
      (SIGNATURE_BOX_HEIGHT - pad * 2) / image.height,
    );
    if (!Number.isFinite(scale) || scale <= 0) {
      throw new WaiverDocumentError(LAYOUT_MESSAGE, "signature scale");
    }
    const width = image.width * scale;
    const height = image.height * scale;
    const x = MARGIN + (SIGNATURE_BOX_WIDTH - width) / 2;
    const y = boxBottom + (SIGNATURE_BOX_HEIGHT - height) / 2;
    this.rects.push({
      page: this.page,
      x: MARGIN,
      y: boxBottom,
      width: SIGNATURE_BOX_WIDTH,
      height: SIGNATURE_BOX_HEIGHT,
    });
    this.images.push({ page: this.page, png: image.png, x, y, width, height });
    this.baseline = boxBottom - 12;
    return { captionBaseline, boxBottom };
  }

  get pageCount() {
    return this.page + 1;
  }

  footer(note: string, hash: string | null) {
    const font = this.regular;
    for (let page = 0; page < this.pageCount; page++) {
      const pageLabel = `Page ${page + 1} of ${this.pageCount}`;
      const pageWidth = font.widthOfTextAtSize(pageLabel, 8);
      const noteText = sanitize(note, font);
      this.texts.push({
        page,
        text: noteText,
        x: MARGIN,
        y: 48,
        size: 8,
        width: font.widthOfTextAtSize(noteText, 8),
        height: 8,
        font: "regular",
        region: "footer",
      });
      this.texts.push({
        page,
        text: pageLabel,
        x: PAGE_WIDTH - MARGIN - pageWidth,
        y: 36,
        size: 8,
        width: pageWidth,
        height: 8,
        font: "regular",
        region: "footer",
      });
      if (hash) {
        const hashLabel = `Audit hash ${hash}`;
        this.texts.push({
          page,
          text: hashLabel,
          x: MARGIN,
          y: 36,
          size: 8,
          width: font.widthOfTextAtSize(hashLabel, 8),
          height: 8,
          font: "regular",
          region: "footer",
        });
      }
    }
  }
}

export async function composeWaiverPdf(input: WaiverPdfInput): Promise<{
  bytes: Uint8Array;
  placement: WaiverPdfPlacement;
}> {
  if (!input.waiverId.trim()) throw new WaiverDocumentError(RECORD_MESSAGE);
  const cropped = await cropSignaturePng(input.signaturePng);
  if (!cropped) throw new WaiverDocumentError(SIGNATURE_MESSAGE);

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const layout = new PageLayout(regular, bold);
  const minor = isMinorAtSigning(input.dateOfBirth, input.signedAt);
  const caption = minor ? "Parent or guardian signature" : "Participant signature";
  const legal = getLegalCopy(input.locale);

  layout.paragraph("Temple Underground health assessment and waiver", 16, "bold", 12);
  layout.field("Full name", input.fullName);
  layout.field("Date of birth", input.dateOfBirth);
  layout.field("Email", input.email);
  layout.field("Phone", input.phone);
  layout.field("Address", input.address);
  layout.field("Locale", input.locale);
  layout.field("Content version", input.contentVersion);
  layout.field("Signed", input.signedAt);
  layout.field("Waiver id", input.waiverId);

  layout.heading("Emergency contact");
  layout.field("Name", input.emergencyName);
  layout.field("Relationship", input.emergencyRelationship);
  layout.field("Phone", input.emergencyPhone);
  layout.field("Email", input.emergencyEmail);

  layout.heading("Health assessment");
  for (const item of input.medical) layout.field(item.label, item.value);

  layout.heading("Waiver terms");
  for (const section of [legal.release, legal.indemnification, legal.media, legal.acknowledgement]) {
    layout.paragraph(section.title, 11, "bold", 3);
    layout.paragraph(section.body, 10, "regular", 8);
  }

  layout.heading("Confirmation");
  layout.field("Terms accepted", input.consent);
  for (const item of input.initials) layout.field(item.label, item.value);

  layout.heading("Signature");
  if (minor) {
    layout.paragraph(
      "Participant was under 18 on the signed date. The stored mark is the parent or guardian signature.",
      10,
      "regular",
      8,
    );
  }
  layout.signature(caption, cropped);
  layout.footer(
    "Reading copy of the signed record. The archived file and audit hash were not changed.",
    input.documentSha256,
  );

  const signature = layout.images[0];
  const box = layout.rects[0];
  const captionRun = layout.texts.find((text) => text.text === caption && text.region === "body");
  if (!signature || !box || !captionRun || signature.page !== captionRun.page || signature.page !== box.page) {
    throw new WaiverDocumentError(LAYOUT_MESSAGE, "signature separated from its label");
  }
  if (signature.y + signature.height > captionRun.y - 4) {
    throw new WaiverDocumentError(LAYOUT_MESSAGE, "signature overlaps its label");
  }
  if (
    signature.x < box.x ||
    signature.y < box.y ||
    signature.x + signature.width > box.x + box.width + 0.01 ||
    signature.y + signature.height > box.y + box.height + 0.01
  ) {
    throw new WaiverDocumentError(LAYOUT_MESSAGE, "signature outside its box");
  }
  for (const text of layout.texts) {
    if (text.region !== "body" || text.page !== signature.page || text === captionRun) continue;
    const textTop = text.y + text.height;
    const textBottom = text.y - 2;
    const overlaps =
      text.x < signature.x + signature.width &&
      text.x + text.width > signature.x &&
      textBottom < signature.y + signature.height &&
      textTop > signature.y;
    if (overlaps) throw new WaiverDocumentError(LAYOUT_MESSAGE, "signature overlaps document text");
  }
  for (const text of layout.texts) {
    if (text.x < MARGIN - 0.01 || text.x + text.width > PAGE_WIDTH - MARGIN + 0.01) {
      throw new WaiverDocumentError(LAYOUT_MESSAGE, "text clipped at the page edge");
    }
    if (text.region === "body" && (text.y < CONTENT_BOTTOM || text.y > CONTENT_TOP)) {
      throw new WaiverDocumentError(LAYOUT_MESSAGE, "text outside the page body");
    }
  }
  const footers = layout.texts.filter((text) => text.region === "footer");
  for (let index = 0; index < footers.length; index++) {
    for (let other = index + 1; other < footers.length; other++) {
      const left = footers[index];
      const right = footers[other];
      if (left.page !== right.page || Math.abs(left.y - right.y) > 1) continue;
      const overlaps =
        left.x < right.x + right.width && left.x + left.width > right.x;
      if (overlaps) throw new WaiverDocumentError(LAYOUT_MESSAGE, "footer overlap");
    }
  }

  for (let index = 0; index < layout.pageCount; index++) pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const embedded = await pdf.embedPng(cropped.png);
  for (const text of layout.texts) {
    pdf.getPage(text.page).drawText(text.text, {
      x: text.x,
      y: text.y,
      size: text.size,
      font: text.font === "bold" ? bold : regular,
      color: rgb(0.1, 0.12, 0.16),
    });
  }
  pdf.getPage(box.page).drawRectangle({
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    borderWidth: 1,
    borderColor: rgb(0.45, 0.48, 0.52),
    color: rgb(1, 1, 1),
  });
  pdf.getPage(signature.page).drawImage(embedded, {
    x: signature.x,
    y: signature.y,
    width: signature.width,
    height: signature.height,
  });
  pdf.setTitle("Temple Underground health assessment and waiver");

  const bytes = await pdf.save();
  return {
    bytes,
    placement: {
      pageCount: layout.pageCount,
      texts: layout.texts,
      signature: {
        page: signature.page,
        x: signature.x,
        y: signature.y,
        width: signature.width,
        height: signature.height,
        caption,
        box,
      },
    },
  };
}

export function documentText(placement: WaiverPdfPlacement): string {
  return placement.texts.map((text) => text.text).join("\n");
}
