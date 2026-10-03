// Synthetic HTTP contracts only. Never connects to production or writes records.
// Set DASHBOARD_PLAYWRIGHT_MODULE / DASHBOARD_BROWSER_EXECUTABLE for an existing runtime.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createServer } from "vite";
import { localDate } from "../src/lib/operator.ts";

const { chromium } = await import(
  process.env.DASHBOARD_PLAYWRIGHT_MODULE || "playwright"
);
const server = await createServer({
  server: { host: "127.0.0.1", port: 5174, strictPort: true },
});
await server.listen();
const browserOptions = {
  executablePath: process.env.DASHBOARD_BROWSER_EXECUTABLE || undefined,
  headless: true,
  args: process.env.DASHBOARD_BROWSER_EXECUTABLE
    ? [
        "--no-sandbox",
        "--single-process",
        "--in-process-gpu",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--disable-dev-shm-usage",
        "--no-zygote",
      ]
    : [],
};
let browser = await chromium.launch(browserOptions);
const day = localDate();
const next = new Date(`${day}T12:00:00Z`);
next.setUTCDate(next.getUTCDate() + 1);
const nextDay = next.toISOString().slice(0, 10);
const person = {
  participant_id: "test-person",
  full_name: "[TU-TEST] Casey Ray",
  email: `${"long".repeat(16)}@tu-test.invalid`,
  cell_phone: "555-0100",
  account_count: 2,
  preferred_account_id: "payer-one",
  accounts: [
    {
      account_id: "payer-one",
      account_primary_contact_name: "[TU-TEST] Payer One",
      role: "guardian",
      account_status: "active",
    },
    {
      account_id: "payer-two",
      account_primary_contact_name: "[TU-TEST] Payer Two",
      role: "payer",
      account_status: "active",
    },
  ],
};
const classSession = {
  id: "test-session",
  starts_at: `${day}T23:00:00Z`,
  ends_at: `${nextDay}T00:00:00Z`,
  session_label: "[TU-TEST] Evening class",
  cancelled_at: null,
};
const waiver = {
  waiver_id: "test-waiver",
  participant_id: person.participant_id,
  participant_full_name: person.full_name,
  signed_at_utc: `${day}T12:00:00Z`,
};
const requests = [];
const errors = [];
const output = process.env.DASHBOARD_SCREENSHOT_DIR;
if (output) await mkdir(output, { recursive: true });

async function verify(width) {
  if (!browser.isConnected()) browser = await chromium.launch(browserOptions);
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.on("pageerror", (error) => errors.push(error.message));
  let failSummary = true,
    failDocument = true,
    documentReads = 0;
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
      await route.abort();
      return;
    }
    if (!url.pathname.startsWith("/api/admin/")) {
      await route.continue();
      return;
    }
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "x-admin-key",
      "content-type": "application/json",
    };
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    assert.equal(
      route.request().method(),
      "GET",
      "Dashboard must never perform a write",
    );
    assert.equal(
      route.request().headers()["x-admin-key"],
      "local-synthetic-key",
    );
    requests.push(url);
    let data = { ok: true, rows: [] },
      status = 200;
    const path = url.pathname;
    if (path.endsWith("/auth/me"))
      data = {
        ok: true,
        staff: {
          display_name: "[TU-TEST] Operator",
          role: "owner",
          auth_method: "staff_key",
        },
      };
    else if (path.endsWith("/participants/search")) {
      const q = url.searchParams.get("q");
      assert(q.length >= 2);
      assert.equal(url.searchParams.get("limit"), "25");
      if (q === "old") {
        await new Promise((resolve) => setTimeout(resolve, 700));
        data = { ok: true, rows: [{ ...person, full_name: "Stale result" }] };
      } else
        data = {
          ok: true,
          rows:
            q === "cap"
              ? Array.from({ length: 25 }, (_, i) => ({
                  ...person,
                  participant_id: `cap-${i}`,
                }))
              : [person],
        };
    } else if (path.endsWith("/summary/primary-kpis")) {
      if (failSummary) {
        status = 500;
        data = { ok: false, error: "summary_unavailable" };
      } else
        data = {
          ok: true,
          kpis: {
            expected_revenue_open_due_cents: 10000,
            total_visitors_present_checkins: 4,
            current_monthly_members_active_count: 2,
          },
        };
    } else if (path.endsWith("/waiver-compliance-gaps"))
      data = {
        ok: true,
        rows: [
          {
            participant_name: person.full_name,
            missing_waiver: true,
            latest_waiver_at: null,
          },
        ],
      };
    else if (path.endsWith("/scheduling/sessions"))
      data = {
        ok: true,
        rows: [
          classSession,
          {
            ...classSession,
            id: "late-session",
            session_label: "Late local class",
            starts_at: `${nextDay}T02:00:00Z`,
            ends_at: `${nextDay}T03:00:00Z`,
          },
          {
            ...classSession,
            id: "outside-day",
            session_label: "Outside local day",
            starts_at: `${day}T02:00:00Z`,
          },
        ],
      };
    else if (path.endsWith("/scheduling/sessions/test-session"))
      data = {
        ok: true,
        session: classSession,
        attendance: [
          { participant_id: "unhydrated-person", status: "present" },
        ],
      };
    else if (path.endsWith("/waivers"))
      data = {
        ok: true,
        rows:
          url.searchParams.get("offset") === "0"
            ? [
                waiver,
                ...Array.from({ length: 49 }, (_, i) => ({
                  ...waiver,
                  waiver_id: `waiver-${i}`,
                  participant_id: "someone-else",
                  participant_full_name: `Other signer ${i}`,
                })),
              ]
            : [],
      };
    else if (path.endsWith("/waivers/test-waiver")) {
      documentReads++;
      if (failDocument) {
        status = 500;
        data = { ok: false, error: "signed_url_failed" };
      } else
        data = {
          ok: true,
          documentPdfUrl: `http://127.0.0.1:5174/synthetic.pdf?revision=${documentReads}`,
          content_version: "test-v1",
          locale: "en",
        };
    } else if (path.endsWith("/ar-aging"))
      data = {
        ok: true,
        rows: [
          {
            scope: "account",
            account_id: "payer-one",
            total_outstanding_cents: 10000,
            open_item_count: 1,
            bucket_0_30_cents: 10000,
          },
          {
            scope: "total",
            total_outstanding_cents: 10000,
            open_item_count: 1,
            bucket_0_30_cents: 10000,
          },
        ],
      };
    else if (path.endsWith("/attendance-utilization-weekly"))
      data = {
        ok: true,
        rows: [{ week_start: day, present_count: 4, session_count: 1 }],
      };
    try {
      await route.fulfill({ status, headers, json: data });
    } catch {
      /* superseded searches can be cancelled before the fixture responds */
    }
  });
  await page.goto("http://127.0.0.1:5174");
  await page
    .getByLabel("Staff key", { exact: true })
    .fill("local-synthetic-key");
  await page.getByRole("button", { name: "Unlock workspace" }).click();
  await page
    .getByRole("heading", { name: "At the desk", exact: true })
    .waitFor();
  const summary = page
    .locator(".operator-panel")
    .filter({
      has: page.getByRole("heading", { name: "This month’s context" }),
    });
  await summary.getByText("Unavailable: summary_unavailable.").waitFor();
  assert.equal(
    await summary.locator(".metric strong").first().innerText(),
    "Unavailable",
  );
  failSummary = false;
  await page
    .getByRole("button", { name: "Refresh summary", exact: true })
    .click();
  await summary.getByText("$100.00", { exact: true }).waitFor();
  assert.equal(
    await page.getByText("Outside local day", { exact: true }).count(),
    0,
  );
  await page.getByText("Late local class", { exact: true }).waitFor();
  if (output) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `${output}/today-${width}.png`,
      fullPage: true,
    });
  }

  const input = page.getByLabel("Find a participant", { exact: false });
  await input.fill("c");
  await page.waitForTimeout(300);
  assert(!requests.some((url) => url.searchParams.get("q") === "c"));
  await input.fill("old");
  await page.waitForTimeout(320);
  await input.fill("Casey");
  await page.locator(".person-result").first().waitFor();
  await page.waitForTimeout(750);
  assert.equal(
    await page.getByText("Stale result", { exact: true }).count(),
    0,
  );
  await input.fill("cap");
  await page
    .getByText("Showing the first 25 matches.", { exact: false })
    .waitFor();
  await input.fill("Casey");
  await page.waitForFunction(
    () => document.querySelectorAll(".person-result").length === 1,
  );
  await input.press("ArrowDown");
  await input.press("Enter");
  await page.getByRole("heading", { name: "People", exact: true }).waitFor();
  const personPanel = page.locator(".participant-lookup");
  assert.equal(
    await personPanel
      .getByRole("button", { name: "Review this payer" })
      .count(),
    2,
  );
  await personPanel
    .getByRole("button", { name: "Review this payer" })
    .first()
    .click();
  await page.getByRole("heading", { name: "Billing", exact: true }).waitFor();
  const overview = page
    .locator(".operator-panel")
    .filter({
      has: page.getByRole("heading", { name: "Receivables overview" }),
    });
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll(".operator-panel")]
        .find(
          (p) => p.querySelector("h2")?.textContent === "Receivables overview",
        )
        ?.querySelector(".large-amount")?.textContent === "$100.00",
  );
  assert.equal(await overview.getByText("$200.00", { exact: true }).count(), 0);
  const nav =
    width >= 1024
      ? page.getByRole("navigation", { name: "Main navigation" })
      : page.getByRole("navigation", { name: "Mobile navigation" });
  await nav.getByRole("link", { name: "People", exact: true }).click();
  await page.getByLabel("Only [TU-TEST] Casey Ray on this loaded page").check();
  await page
    .getByRole("button", { name: "View document", exact: true })
    .click();
  await page.getByText("Unavailable: signed_url_failed.").waitFor();
  failDocument = false;
  await page.getByRole("button", { name: "Refresh document link" }).click();
  const pdf = page.getByRole("link", { name: "Open signed PDF" });
  await pdf.waitFor();
  const firstUrl = await pdf.getAttribute("href");
  await page.getByRole("button", { name: "Refresh document link" }).click();
  await page.waitForFunction(
    (old) => document.querySelector(".document-detail a")?.href !== old,
    firstUrl,
  );
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await page
    .getByText("No waiver for this participant on the loaded page.", {
      exact: false,
    })
    .waitFor();

  await nav.getByRole("link", { name: "Today", exact: true }).click();
  await page
    .getByRole("button", { name: "View attendance", exact: true })
    .first()
    .click();
  await page
    .getByRole("heading", { name: "[TU-TEST] Evening class attendance" })
    .waitFor();
  await page
    .getByText("1 saved attendance records.", { exact: false })
    .waitFor();
  assert.equal(
    await page.getByText("unhydrated-person", { exact: true }).count(),
    0,
  );

  await page
    .locator(width >= 1024 ? ".operator-rail" : ".workspace-header")
    .getByRole("link", { name: "More", exact: true })
    .click();
  await page.getByRole("button", { name: "Date filters" }).click();
  await page.getByLabel("Start date", { exact: true }).fill("2026-01-01");
  await page.getByLabel("End date", { exact: true }).fill("2026-12-31");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await page
    .getByText("Applied dates: 2026-01-01 through 2026-12-31", { exact: false })
    .waitFor();

  for (const name of ["Today", "People", "Billing", "Classes", "More"]) {
    await page
      .locator(
        name === "More" && width < 1024
          ? ".workspace-header"
          : width >= 1024
            ? ".operator-rail"
            : ".bottom-nav",
      )
      .getByRole("link", { name, exact: true })
      .click();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    assert.equal(overflow, false, `${name} overflows at ${width}px`);
  }
  await page.goBack();
  assert.equal(
    await input.inputValue(),
    "Casey",
    "Search state survives browser Back",
  );
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  if (
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    )
  )
    console.log(
      await page.evaluate(() =>
        [...document.querySelectorAll("body *")]
          .filter(
            (el) =>
              el.getClientRects().length &&
              el.getBoundingClientRect().right > innerWidth + 1,
          )
          .map((el) => ({
            tag: el.tagName,
            class: el.className,
            right: el.getBoundingClientRect().right,
            text: el.textContent.slice(0, 80),
          }))
          .slice(0, 15),
      ),
    );
  if (output)
    await page.screenshot({
      path: `${output}/zoom-${width}.png`,
      fullPage: true,
    });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
    "200% text zoom must reflow",
  );
  assert.equal(
    await page.evaluate(() => localStorage.length + sessionStorage.length),
    0,
  );
  await page.getByRole("button", { name: "Lock / Sign out" }).click();
  await page.getByRole("button", { name: "Unlock workspace" }).waitFor();
  assert.equal(
    await page.getByLabel("Staff key", { exact: true }).inputValue(),
    "",
  );
  assert.equal(await page.locator(".person-result").count(), 0);
  await browser.close();
  console.log(
    `PASS ${width}px: lookup, stale search, explicit payer, waivers/retry, local-day agenda, attendance, filters, Back, lock, and reflow at 200% text zoom`,
  );
}
try {
  for (const width of [1440, 390, 320]) await verify(width);
  assert.deepEqual(errors, []);
  console.log(
    `PASS ${requests.length} synthetic GET requests; no production traffic or writes; no runtime page errors`,
  );
} finally {
  await browser.close();
  await server.close();
}
