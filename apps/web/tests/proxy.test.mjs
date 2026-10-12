import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import { safeAuthDestination, signInPath } from "../src/lib/auth/redirect.ts";

const require = createRequire(import.meta.url);
const { unstable_getResponseFromNextConfig, getRedirectUrl, getRewrittenUrl } = require("next/experimental/testing/server");
const configUrl = new URL("../next.config.ts", import.meta.url);
const { default: productionConfig } = await import(`${configUrl}?production`);
process.env.NODE_ENV = "development";
const { default: developmentConfig } = await import(`${configUrl}?development`);
const route = (nextConfig, url, host = "qr-chat.example") =>
  unstable_getResponseFromNextConfig({ url, nextConfig, headers: { host } });

test("no proxy runs, so page views and Analytics never invoke a function", () => {
  assert.equal(existsSync(new URL("../src/proxy.ts", import.meta.url)), false);
  assert.equal(existsSync(new URL("../src/middleware.ts", import.meta.url)), false);
});

test("legacy /chats links redirect at the routing layer and keep the QR code", async () => {
  const response = await route(productionConfig, "https://qr-chat.example/chats?code=Room%2B1");
  assert.equal(response.status, 307);
  assert.equal(getRedirectUrl(response), "https://qr-chat.example/?code=Room%2B1");
  assert.equal(getRedirectUrl(await route(productionConfig, "https://qr-chat.example/chats")), "https://qr-chat.example/");
});

test("signed-out visitors are sent to sign-in with their destination; signed-in visitors return safely", async () => {
  const source = await readFile(new URL("../src/hooks/use-chat-backend.tsx", import.meta.url), "utf8");
  assert.match(source, /signInPath\(window\.location\.pathname, window\.location\.search\)/);
  for (const path of ["/", "/profile", "/?code=Room%2B1"]) {
    const url = new URL(signInPath(...path.split(/(?=\?)/)), "https://qr-chat.example");
    assert.equal(url.pathname, "/sign-in");
    assert.equal(url.searchParams.get("next"), path);
  }
  assert.equal(safeAuthDestination(new URL(signInPath("/profile"), "https://x.example").searchParams.get("next")), "/profile");
  assert.equal(safeAuthDestination("https://evil.example"), "/");
});

test("the design preview is rewritten only on a local development host", async () => {
  for (const [path, view] of [["/", "chats"], ["/profile", "profile"], ["/sign-in", "chats"]]) {
    const local = await route(developmentConfig, `http://localhost:3000${path}`, "localhost:3000");
    assert.equal(getRewrittenUrl(local), `http://localhost:3000/design-preview?view=${view}`, path);
    assert.equal(getRewrittenUrl(await route(developmentConfig, `https://qr-chat.example${path}`)), null, path);
    assert.equal(getRewrittenUrl(await route(developmentConfig, `http://localhost.evil.example${path}`, "localhost.evil.example")), null, path);
    assert.equal(getRewrittenUrl(await route(productionConfig, `http://localhost:3000${path}`, "localhost:3000")), null, path);
  }
  const page = await readFile(new URL("../src/app/design-preview/page.dev.tsx", import.meta.url), "utf8");
  assert.match(page, /if \(!isLocalDesignPreviewHost\(host\)\) notFound\(\);/);
  assert.ok(developmentConfig.pageExtensions.includes("dev.tsx"), "the preview page builds on the dev server");
  assert.ok(!productionConfig.pageExtensions.some((extension) => extension.startsWith("dev")), "production has no preview route, so it is a static 404");
});
