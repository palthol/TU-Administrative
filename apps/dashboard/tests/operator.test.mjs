import assert from "node:assert/strict";
import test from "node:test";
import {
  agendaQuery,
  localDate,
  localSessions,
  searchPath,
  formatMoney,
  receivableTotal,
  isDate,
} from "../src/lib/operator.ts";

test("search uses the API minimum and cap and encodes identifiers", () => {
  assert.equal(searchPath(" a "), null);
  const path = searchPath(" a&b + phone ");
  const query = new URL(`http://local${path}`).searchParams;
  assert.equal(query.get("q"), "a&b + phone");
  assert.equal(query.get("limit"), "25");
});

test("New York date is previous local day around UTC midnight", () => {
  assert.equal(localDate(new Date("2026-10-03T02:00:00Z")), "2026-10-02");
  assert.equal(localDate(new Date("2026-10-03T04:00:00Z")), "2026-10-03");
});

test("agenda fetches both intersecting UTC dates and preserves pagination/cancellations", () => {
  const params = new URL(`http://local${agendaQuery("2026-12-31", 200)}`)
    .searchParams;
  assert.equal(params.get("start"), "2026-12-31");
  assert.equal(params.get("end"), "2027-01-01");
  assert.equal(params.get("include_cancelled"), "true");
  assert.equal(params.get("limit"), "200");
  assert.equal(params.get("offset"), "200");
});

test("agenda keeps late local classes and excludes adjacent-day rows in chronological order", () => {
  const rows = [
    { id: "late", starts_at: "2026-10-04T02:00:00Z" },
    { id: "previous", starts_at: "2026-10-03T03:59:59Z" },
    { id: "first", starts_at: "2026-10-03T04:00:00Z" },
    { id: "next", starts_at: "2026-10-04T04:00:00Z" },
  ];
  assert.deepEqual(
    localSessions(rows, "2026-10-03").map((s) => s.id),
    ["first", "late"],
  );
});

test("23-hour and 25-hour daylight saving days retain their actual instants", () => {
  assert.equal(localDate(new Date("2026-03-09T03:59:59Z")), "2026-03-08");
  assert.equal(localDate(new Date("2026-03-09T04:00:00Z")), "2026-03-09");
  assert.equal(localDate(new Date("2026-11-02T04:59:59Z")), "2026-11-01");
  assert.equal(localDate(new Date("2026-11-02T05:00:00Z")), "2026-11-02");
});

test("cent values remain exact; missing and malformed data are not displayed as zero", () => {
  assert.equal(formatMoney(24975), "$249.75");
  assert.equal(formatMoney("11500"), "$115.00");
  assert.equal(formatMoney(0), "$0.00");
  for (const value of [
    undefined,
    null,
    "",
    false,
    "12.5",
    "1e3",
    NaN,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ])
    assert.equal(formatMoney(value), "Unavailable");
});

test("receivables use only the total rollup and never sum a partial account page", () => {
  const rows = [
    { scope: "account", total_outstanding_cents: 10000 },
    { scope: "total", total_outstanding_cents: 10000 },
  ];
  assert.equal(receivableTotal(rows).total_outstanding_cents, 10000);
  assert.equal(receivableTotal(rows.slice(0, 1)), undefined);
});

test("real calendar-date validation rejects normalized impossible dates", () => {
  assert.equal(isDate("2026-02-29"), false);
  assert.equal(isDate("2028-02-29"), true);
  assert.throws(() => agendaQuery("2026-02-30"));
});
