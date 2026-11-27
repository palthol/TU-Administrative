import assert from "node:assert/strict";
import test from "node:test";
import {
  ALREADY_ENROLLED_MESSAGE,
  API_UNAVAILABLE_MESSAGE,
  EMPTY_PLACEHOLDER_FORM,
  enrollmentBoardPath,
  enrollmentFlags,
  enrollmentPlanLabel,
  filterBoardRows,
  unenrolledMatches,
  uniqueAccounts,
  validateEnrollExistingForm,
  validatePlaceholderForm,
} from "../src/lib/enrollment.ts";
import {
  createEnrollmentSubscription,
  createPlaceholder,
  fetchEnrollmentBoard,
  listEnrollmentPlans,
} from "../src/lib/enrollment-api.ts";

const connection = { apiBase: "http://localhost:3001", adminKey: "test-key" };

const JORDAN = {
  participant_id: "11111111-1111-4111-8111-111111111111",
  first_name: "Jordan",
  last_name: "Blake",
  is_placeholder: true,
  placeholder_reason: "Walk-in, paperwork later",
  dob_is_placeholder: true,
  waiver_signed: false,
  account_id: "acct-blake",
  account_name: "Blake household",
  subscription: null,
};

const RILEY = {
  participant_id: "22222222-2222-4222-8222-222222222222",
  first_name: "Riley",
  last_name: "Chen",
  is_placeholder: false,
  placeholder_reason: null,
  dob_is_placeholder: false,
  waiver_signed: true,
  account_id: "acct-chen",
  account_name: "Chen household",
  subscription: {
    id: "sub-riley",
    plan_id: "plan-group",
    plan_name: "Basic Group Plan",
    status: "active",
    start_date: "2026-01-01",
  },
};

const AVERY = {
  participant_id: "33333333-3333-4333-8333-333333333333",
  first_name: "Avery",
  last_name: "Patel",
  is_placeholder: false,
  placeholder_reason: null,
  dob_is_placeholder: false,
  waiver_signed: false,
  account_id: "acct-patel",
  account_name: "Patel household",
  subscription: null,
};

const BASIC_GROUP = {
  id: "plan-group",
  name: "Basic Group Plan",
  plan_category: "group",
  billing_cadence: "monthly",
  price_cents: 10000,
  is_active: true,
};

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function withFetch(impl, run) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

test("placeholder reason is required", () => {
  const result = validatePlaceholderForm({
    ...EMPTY_PLACEHOLDER_FORM,
    first_name: "Jordan",
    last_name: "Blake",
    account_mode: "new",
    account_name: "Blake household",
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.placeholder_reason, /required/i);
});

test("stand-in date of birth requires a reason", () => {
  const missing = validatePlaceholderForm({
    ...EMPTY_PLACEHOLDER_FORM,
    first_name: "Jordan",
    last_name: "Blake",
    placeholder_reason: "Walk-in, paperwork later",
    dob_is_placeholder: true,
    date_of_birth: "2012-01-01",
    account_mode: "new",
    account_name: "Blake household",
  });
  assert.equal(missing.ok, false);
  assert.match(missing.errors.dob_placeholder_reason, /stand-in/i);

  const missingDate = validatePlaceholderForm({
    ...EMPTY_PLACEHOLDER_FORM,
    first_name: "Jordan",
    last_name: "Blake",
    placeholder_reason: "Walk-in, paperwork later",
    dob_is_placeholder: true,
    dob_placeholder_reason: "Family did not know the date",
    account_mode: "new",
    account_name: "Blake household",
  });
  assert.equal(missingDate.ok, false);
  assert.match(missingDate.errors.date_of_birth, /required/i);
});

test("valid placeholder form sends stand-in flags and omits empty optionals", () => {
  const result = validatePlaceholderForm({
    ...EMPTY_PLACEHOLDER_FORM,
    first_name: " Jordan ",
    last_name: "Blake",
    placeholder_reason: "Walk-in, paperwork later",
    dob_is_placeholder: true,
    date_of_birth: "2012-01-01",
    dob_placeholder_reason: "Family did not know the date",
    account_mode: "new",
    account_name: "Blake household",
    email: "jordan.blake@tu-test.invalid",
    plan_id: "plan-group",
    start_date: "2026-12-01",
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.body, {
    first_name: "Jordan",
    last_name: "Blake",
    placeholder_reason: "Walk-in, paperwork later",
    email: "jordan.blake@tu-test.invalid",
    date_of_birth: "2012-01-01",
    dob_is_placeholder: true,
    dob_placeholder_reason: "Family did not know the date",
    account_name: "Blake household",
    plan_id: "plan-group",
    start_date: "2026-12-01",
  });
  assert.equal("phone" in result.body, false);
  assert.equal("account_id" in result.body, false);
});

test("enroll-existing validation requires a person and a plan", () => {
  const empty = validateEnrollExistingForm({
    participant_id: "",
    account_id: "",
    plan_id: "",
    start_date: "",
  });
  assert.equal(empty.ok, false);
  assert.match(empty.errors.participant_id, /person/i);
  assert.match(empty.errors.plan_id, /plan/i);

  const ok = validateEnrollExistingForm({
    participant_id: AVERY.participant_id,
    account_id: AVERY.account_id,
    plan_id: BASIC_GROUP.id,
    start_date: "2026-12-01",
  });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.body, {
    participant_id: AVERY.participant_id,
    plan_id: BASIC_GROUP.id,
    account_id: AVERY.account_id,
    start_date: "2026-12-01",
  });
});

test("board flags mark placeholders, stand-in DOB, missing waivers, and enrollment", () => {
  assert.deepEqual(enrollmentFlags(JORDAN), {
    placeholder: true,
    placeholderReason: "Walk-in, paperwork later",
    dobStandIn: true,
    noWaiver: true,
    enrolled: false,
  });
  assert.equal(enrollmentPlanLabel(JORDAN), "Not enrolled");
  assert.deepEqual(enrollmentFlags(RILEY), {
    placeholder: false,
    placeholderReason: null,
    dobStandIn: false,
    noWaiver: false,
    enrolled: true,
  });
  assert.equal(enrollmentPlanLabel(RILEY), "Basic Group Plan · active");
  assert.equal(enrollmentFlags(AVERY).noWaiver, true);
  assert.equal(enrollmentPlanLabel(AVERY), "Not enrolled");
});

test("board filtering uses status tabs and name search", () => {
  const rows = [JORDAN, RILEY, AVERY];
  assert.deepEqual(
    filterBoardRows(rows, "enrolled", "").map((row) => row.last_name),
    ["Chen"],
  );
  assert.deepEqual(
    filterBoardRows(rows, "unenrolled", "").map((row) => row.last_name),
    ["Blake", "Patel"],
  );
  assert.deepEqual(
    filterBoardRows(rows, "placeholder", "").map((row) => row.last_name),
    ["Blake"],
  );
  assert.deepEqual(
    filterBoardRows(rows, "all", "pat").map((row) => row.last_name),
    ["Patel"],
  );
  assert.deepEqual(
    unenrolledMatches(rows, "jo").map((row) => row.first_name),
    ["Jordan"],
  );
  assert.deepEqual(unenrolledMatches(rows, "j"), []);
  assert.deepEqual(uniqueAccounts(rows).map((account) => account.account_name), [
    "Blake household",
    "Chen household",
    "Patel household",
  ]);
});

test("enrollmentBoardPath omits all-status and empty search", () => {
  assert.equal(enrollmentBoardPath(), "/api/admin/billing/enrollment-board");
  assert.equal(
    enrollmentBoardPath({ status: "all", q: "  " }),
    "/api/admin/billing/enrollment-board",
  );
  assert.equal(
    enrollmentBoardPath({ status: "unenrolled", q: "Avery" }),
    "/api/admin/billing/enrollment-board?status=unenrolled&q=Avery",
  );
});

test("fetchEnrollmentBoard returns the board on success", async () => {
  await withFetch(async (url, init) => {
    assert.equal(
      String(url),
      "http://localhost:3001/api/admin/billing/enrollment-board?status=placeholder&q=Jordan",
    );
    assert.equal(init.credentials, "include");
    assert.equal(init.headers["x-admin-key"], "test-key");
    return jsonResponse(200, {
      ok: true,
      counts: { total: 3, enrolled: 1, unenrolled: 2, placeholders: 1 },
      rows: [JORDAN],
    });
  }, async () => {
    const result = await fetchEnrollmentBoard(connection, {
      status: "placeholder",
      q: "Jordan",
    });
    assert.equal(result.kind, "ok");
    assert.equal(result.value.counts.placeholders, 1);
    assert.equal(result.value.rows[0].first_name, "Jordan");
    assert.equal(result.value.rows[0].is_placeholder, true);
  });
});

test("fetchEnrollmentBoard and plans treat 404 as API not available yet", async () => {
  await withFetch(
    async () => jsonResponse(404, { ok: false, error: "not_found" }),
    async () => {
      const board = await fetchEnrollmentBoard(connection);
      assert.equal(board.kind, "unavailable");
      const plans = await listEnrollmentPlans(connection);
      assert.equal(plans.kind, "unavailable");
      assert.equal(API_UNAVAILABLE_MESSAGE, "API not available yet");
    },
  );
});

test("enrollment API treats network failure as API not available yet", async () => {
  await withFetch(
    async () => {
      throw new TypeError("fetch failed");
    },
    async () => {
      const board = await fetchEnrollmentBoard(connection);
      assert.equal(board.kind, "unavailable");
    },
  );
});

test("createPlaceholder posts the contract body and reads a 201", async () => {
  const body = {
    first_name: "Jordan",
    last_name: "Blake",
    placeholder_reason: "Walk-in, paperwork later",
    account_name: "Blake household",
  };
  await withFetch(async (url, init) => {
    assert.equal(
      String(url),
      "http://localhost:3001/api/admin/participants/placeholders",
    );
    assert.equal(init.method, "POST");
    assert.deepEqual(JSON.parse(init.body), body);
    return jsonResponse(201, {
      ok: true,
      participant: {
        id: JORDAN.participant_id,
        first_name: "Jordan",
        last_name: "Blake",
        is_placeholder: true,
        placeholder_reason: "Walk-in, paperwork later",
        dob_is_placeholder: false,
      },
      account_id: "acct-blake",
      subscription: null,
    });
  }, async () => {
    const result = await createPlaceholder(connection, body);
    assert.equal(result.kind, "ok");
    assert.equal(result.value.participant.last_name, "Blake");
    assert.equal(result.value.account_id, "acct-blake");
    assert.equal(result.value.subscription, null);
  });
});

test("createEnrollmentSubscription returns 409 as a friendly conflict", async () => {
  await withFetch(async (url, init) => {
    assert.equal(
      String(url),
      "http://localhost:3001/api/admin/billing/subscriptions",
    );
    assert.equal(init.method, "POST");
    assert.deepEqual(JSON.parse(init.body), {
      participant_id: RILEY.participant_id,
      plan_id: BASIC_GROUP.id,
    });
    return jsonResponse(409, {
      ok: false,
      error: "overlapping_active_subscription",
    });
  }, async () => {
    const result = await createEnrollmentSubscription(connection, {
      participant_id: RILEY.participant_id,
      plan_id: BASIC_GROUP.id,
    });
    assert.equal(result.kind, "conflict");
    assert.equal(result.error, ALREADY_ENROLLED_MESSAGE);
  });
});

test("createEnrollmentSubscription success does not create a charge payload", async () => {
  await withFetch(async (_url, init) => {
    const sent = JSON.parse(init.body);
    assert.equal("create_initial_charge" in sent, false);
    return jsonResponse(201, {
      ok: true,
      subscription: {
        id: "sub-avery",
        plan_id: BASIC_GROUP.id,
        plan_name: BASIC_GROUP.name,
        status: "active",
        start_date: "2026-12-01",
      },
    });
  }, async () => {
    const result = await createEnrollmentSubscription(connection, {
      participant_id: AVERY.participant_id,
      plan_id: BASIC_GROUP.id,
      start_date: "2026-12-01",
    });
    assert.equal(result.kind, "ok");
    assert.equal(result.value.plan_name, "Basic Group Plan");
  });
});
