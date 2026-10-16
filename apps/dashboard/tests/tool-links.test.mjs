import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "vite";
import {
  RECEIPTS_PRODUCTION_URL,
  WAIVER_VIEWER_PRODUCTION_URL,
  resolveToolLink,
  toolLinkLabel,
} from "../src/lib/tool-links.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("development keeps an explicit local tool and falls back to the dev server", () => {
  assert.equal(
    resolveToolLink(undefined, "http://localhost:5176", true),
    "http://localhost:5176",
  );
  assert.equal(
    resolveToolLink("http://127.0.0.1:4176/", "http://localhost:5176", true),
    "http://127.0.0.1:4176",
  );
});

test("production uses the deployed tools and drops loopback configuration", () => {
  assert.equal(
    resolveToolLink(undefined, RECEIPTS_PRODUCTION_URL, false),
    "https://finance.templeunderground.com",
  );
  assert.equal(
    resolveToolLink(undefined, WAIVER_VIEWER_PRODUCTION_URL, false),
    "https://waiverviewer.templeunderground.com",
  );
  assert.equal(
    resolveToolLink("http://localhost:5176", RECEIPTS_PRODUCTION_URL, false),
    "https://finance.templeunderground.com",
  );
  assert.equal(
    resolveToolLink(
      "http://127.0.0.1:5177",
      WAIVER_VIEWER_PRODUCTION_URL,
      false,
    ),
    "https://waiverviewer.templeunderground.com",
  );
  assert.equal(
    resolveToolLink("http://[::1]:5177", WAIVER_VIEWER_PRODUCTION_URL, false),
    "https://waiverviewer.templeunderground.com",
  );
  assert.equal(
    resolveToolLink(
      "https://finance.example.test/desk/",
      RECEIPTS_PRODUCTION_URL,
      false,
    ),
    "https://finance.example.test/desk",
  );
});

test("production has no link when every candidate is local or unsafe", () => {
  assert.equal(
    resolveToolLink("http://localhost:5176", "http://127.0.0.1:5177", false),
    null,
  );
  assert.equal(
    resolveToolLink("javascript:alert(1)", "notaurl", false),
    null,
  );
  assert.equal(
    resolveToolLink(
      "https://user:secret@finance.templeunderground.com",
      "http://0.0.0.0:5176",
      false,
    ),
    null,
  );
  assert.equal(toolLinkLabel("Receipts tool", null), "Receipts tool unavailable");
  assert.equal(
    toolLinkLabel("Waiver review tool", "https://waiverviewer.templeunderground.com"),
    "Waiver review tool ↗",
  );
});

test(
  "production build points both tools at the deployed hosts",
  { timeout: 120_000 },
  async () => {
    const previous = {
      receipts: process.env.VITE_RECEIPTS_APP_URL,
      viewer: process.env.VITE_WAIVER_VIEWER_APP_URL,
    };
    delete process.env.VITE_RECEIPTS_APP_URL;
    delete process.env.VITE_WAIVER_VIEWER_APP_URL;
    const outDir = await mkdtemp(path.join(tmpdir(), "dashboard-links-"));
    const envDir = await mkdtemp(path.join(tmpdir(), "dashboard-env-"));
    try {
      await build({
        root,
        configFile: path.join(root, "vite.config.ts"),
        envDir,
        mode: "production",
        logLevel: "error",
        build: { outDir, emptyOutDir: true },
      });
      const assets = path.join(outDir, "assets");
      const files = (await readdir(assets)).filter((name) => name.endsWith(".js"));
      assert.ok(files.length > 0);
      const source = (
        await Promise.all(files.map((name) => readFile(path.join(assets, name), "utf8")))
      ).join("\n");
      assert.match(source, /https:\/\/finance\.templeunderground\.com/);
      assert.match(source, /https:\/\/waiverviewer\.templeunderground\.com/);
      assert.equal(source.includes("localhost:5176"), false);
      assert.equal(source.includes("localhost:5177"), false);
      assert.equal(source.includes("127.0.0.1"), false);
    } finally {
      if (previous.receipts === undefined) delete process.env.VITE_RECEIPTS_APP_URL;
      else process.env.VITE_RECEIPTS_APP_URL = previous.receipts;
      if (previous.viewer === undefined) delete process.env.VITE_WAIVER_VIEWER_APP_URL;
      else process.env.VITE_WAIVER_VIEWER_APP_URL = previous.viewer;
      await rm(outDir, { recursive: true, force: true });
      await rm(envDir, { recursive: true, force: true });
    }
  },
);
