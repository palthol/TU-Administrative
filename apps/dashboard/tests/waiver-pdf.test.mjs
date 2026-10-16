import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { cropSignaturePng, encodeRgbaPng } from "../src/lib/waiver-png.ts";
import {
  WaiverDocumentError,
  composeWaiverPdf,
  documentText,
  findWaiverRecord,
  isMinorAtSigning,
  waiverRecordPath,
} from "../src/lib/waiver-pdf.ts";

const MARGIN = 54;
const PAGE_WIDTH = 612;

function rgba(width, height, paint) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = paint(x, y);
      const index = (y * width + x) * 4;
      data[index] = pixel[0];
      data[index + 1] = pixel[1];
      data[index + 2] = pixel[2];
      data[index + 3] = pixel[3];
    }
  }
  return data;
}

async function signaturePng() {
  const width = 180;
  const height = 90;
  return encodeRgbaPng(
    width,
    height,
    rgba(width, height, (x, y) => {
      const ink = x >= 4 && x < 24 && y >= 6 && y < 18;
      return ink ? [10, 10, 10, 255] : [0, 0, 0, 0];
    }),
  );
}

function source(overrides = {}) {
  const notes = `${"Clearance note ".repeat(80)}end.`;
  return {
    waiverId: "waiver-100",
    signedAt: "2026-10-16T15:04:00Z",
    locale: "en",
    contentVersion: "waiver.v3",
    documentSha256: "ab".repeat(32),
    fullName: `${"Alexandria ".repeat(8)}Rivera-Example`,
    dateOfBirth: "1990-04-02",
    email: `${"very.long.mailbox".repeat(5)}@participants.example`,
    phone: "555-0100",
    address: `${"1000 Training Floor Avenue ".repeat(6)}Morristown TN 37814`,
    emergencyName: "Jordan Example",
    emergencyRelationship: "Parent",
    emergencyPhone: "555-0199",
    emergencyEmail: "jordan.example@participants.example",
    medical: [
      { label: "Heart disease", value: "No" },
      { label: "Shortness of breath", value: "No" },
      { label: "High blood pressure", value: "Yes" },
      { label: "Smoking", value: "No" },
      { label: "Diabetes", value: "No" },
      { label: "Family history", value: "No" },
      { label: "Workouts", value: "Yes" },
      { label: "Medication", value: "No" },
      { label: "Alcohol", value: "No" },
      { label: "Last physical", value: "2026-01-15" },
      { label: "Exercise restrictions", value: "None" },
      { label: "Injuries", value: "Knees, Lower back" },
      { label: "Recent injury", value: "No" },
      { label: "Injury details", value: "Not recorded" },
      { label: "Physician cleared", value: "Yes" },
      { label: "Clearance notes", value: notes },
    ],
    consent: "Yes",
    initials: [
      { label: "Risk initials", value: "AR" },
      { label: "Release initials", value: "AR" },
      { label: "Indemnification initials", value: "AR" },
      { label: "Media initials", value: "AR" },
    ],
    signaturePng: overrides.signaturePng,
    ...overrides,
  };
}

function overlaps(text, image) {
  return (
    text.page === image.page &&
    text.x < image.x + image.width &&
    text.x + text.width > image.x &&
    text.y - 2 < image.y + image.height &&
    text.y + text.height > image.y
  );
}

test("signed date query uses the UTC day and the following midnight", () => {
  const path = waiverRecordPath("2026-10-16T23:00:00-04:00", 50);
  const params = new URL(`http://local${path}`).searchParams;
  assert.equal(params.get("start"), "2026-10-17");
  assert.equal(params.get("end"), "2026-10-18");
  assert.equal(params.get("offset"), "50");
  assert.equal(params.get("limit"), "50");
  assert.equal(params.get("sort"), "signed_at_utc");
  const undated = new URL(`http://local${waiverRecordPath(null, 0)}`).searchParams;
  assert.equal(undated.get("start"), null);
  assert.equal(undated.get("end"), null);
});

test("a record search stops at the matching waiver and reports a miss", async () => {
  const calls = [];
  const found = await findWaiverRecord(
    async (path) => {
      calls.push(path);
      const offset = new URL(`http://local${path}`).searchParams.get("offset");
      if (offset === "0") {
        return { rows: Array.from({ length: 50 }, (_, index) => ({ waiver_id: `other-${index}` })) };
      }
      return { rows: [{ waiver_id: "wanted", participant_full_name: "Kept" }] };
    },
    "wanted",
    "2026-10-16T12:00:00Z",
  );
  assert.equal(found.participant_full_name, "Kept");
  assert.equal(calls.length, 2);

  await assert.rejects(
    findWaiverRecord(async () => ({ rows: [] }), "missing", null),
    (error) => {
      assert.ok(error instanceof WaiverDocumentError);
      assert.match(error.message, /could not be loaded/);
      assert.equal(error.message.includes("missing"), false);
      return true;
    },
  );
});

test("age uses the signed calendar day", () => {
  assert.equal(isMinorAtSigning("2008-10-16", "2026-10-15T23:00:00Z"), true);
  assert.equal(isMinorAtSigning("2008-10-16", "2026-10-16"), false);
  assert.equal(isMinorAtSigning(null, "2026-10-16"), false);
});

test("signature ink is cropped out of the transparent canvas", async () => {
  const cropped = await cropSignaturePng(await signaturePng());
  assert.ok(cropped);
  assert.ok(cropped.width < 40);
  assert.ok(cropped.height < 30);
  assert.ok(cropped.width > cropped.height);
});

test("adult waiver text stays on the page and the signature sits in its box", async () => {
  const input = source({ signaturePng: await signaturePng() });
  const { bytes, placement } = await composeWaiverPdf(input);
  assert.equal(bytes[0], 0x25);
  assert.equal(String.fromCharCode(...bytes.slice(0, 5)), "%PDF-");
  const reloaded = await PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(), placement.pageCount);
  assert.ok(placement.pageCount >= 2);

  const text = documentText(placement);
  const compact = (value) => value.replace(/\s+/g, "");
  assert.ok(compact(text).includes(compact(input.fullName)));
  assert.ok(compact(text).includes(compact(input.email)));
  assert.ok(compact(text).includes(compact(input.address)));
  assert.match(text, /Heart disease/);
  assert.match(text, /High blood pressure/);
  assert.match(text, /Release/);
  assert.match(text, /Indemnification/);
  assert.match(text, /attorney's\s+fees/);
  assert.match(text, /Use of Picture/);
  assert.match(text, /Acknowledgement/);
  assert.match(text, /waiver\.v3/);
  assert.match(text, /Audit hash ababab/);
  assert.match(text, /Participant signature/);
  assert.equal(text.includes("Parent or guardian signature"), false);
  assert.equal(text.includes("under 18"), false);

  for (const run of placement.texts) {
    assert.ok(run.x >= MARGIN - 0.1, run.text);
    assert.ok(run.x + run.width <= PAGE_WIDTH - MARGIN + 0.1, run.text);
    assert.equal(overlaps(run, placement.signature), false, run.text);
  }
  const caption = placement.texts.find((run) => run.text === "Participant signature");
  assert.ok(caption);
  assert.equal(caption.page, placement.signature.page);
  assert.ok(placement.signature.y + placement.signature.height <= caption.y - 4);
  assert.ok(placement.signature.x >= placement.signature.box.x);
  assert.ok(placement.signature.y >= placement.signature.box.y);
  assert.ok(
    placement.signature.x + placement.signature.width <=
      placement.signature.box.x + placement.signature.box.width + 0.1,
  );
  assert.ok(placement.signature.height > 70);
  assert.ok(placement.signature.width > 80);
});

test("a minor waiver keeps the guardian signature with its label", async () => {
  const input = source({
    signaturePng: await signaturePng(),
    dateOfBirth: "2015-03-01",
    locale: "es-MX",
    fullName: "Ana 😀 Solís",
  });
  const { placement } = await composeWaiverPdf(input);
  const text = documentText(placement);
  assert.match(text, /Parent or guardian signature/);
  assert.match(text, /under\s+18/);
  assert.match(text, /Liberación/);
  assert.match(text, /Indemnización/);
  assert.match(text, /Ana \? Solís|Ana \? Solis/);
  const caption = placement.texts.find((run) => run.text === "Parent or guardian signature");
  assert.ok(caption);
  assert.equal(caption.page, placement.signature.page);
  assert.ok(placement.signature.y + placement.signature.height <= caption.y - 4);
  assert.equal(
    placement.texts.some((run) => run.text === "Release" && run.font === "bold"),
    false,
  );
});

test("an unreadable signature does not produce a document", async () => {
  const input = source({
    signaturePng: Uint8Array.from([1, 2, 3, 4]),
    fullName: "Private Person",
  });
  await assert.rejects(composeWaiverPdf(input), (error) => {
    assert.ok(error instanceof WaiverDocumentError);
    assert.match(error.message, /signature image could not be read/);
    assert.equal(error.message.includes("Private Person"), false);
    return true;
  });
});
