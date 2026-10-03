import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInThisContext } from "node:vm";

const require = createRequire(import.meta.url);
const { unstable_doesMiddlewareMatch } = require("next/experimental/testing/server");
const typescript = require("typescript");
const sourceUrl = new URL("../src/proxy.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const output = typescript.transpileModule(source, {
  compilerOptions: {
    module: typescript.ModuleKind.CommonJS,
    target: typescript.ScriptTarget.ES2022,
  },
}).outputText;
const fixtureModule = { exports: {} };
const evaluate = runInThisContext(`(function (require, module, exports) { ${output}\n})`, {
  filename: sourceUrl.pathname,
});
evaluate((specifier) => specifier.startsWith("@/") ? {} : require(specifier), fixtureModule, fixtureModule.exports);
const { config } = fixtureModule.exports;

test("Vercel Analytics requests bypass the authentication proxy", () => {
  for (const url of ["/_vercel/insights/script.js", "/_vercel/insights/view", "/_vercel/insights/event"]) {
    assert.equal(unstable_doesMiddlewareMatch({ config, url }), false, url);
  }
});

test("application pages and APIs still pass through the authentication proxy", () => {
  for (const url of ["/", "/profile", "/chats", "/api/chat", "/sign-in", "/auth/callback"]) {
    assert.equal(unstable_doesMiddlewareMatch({ config, url }), true, url);
  }
});

test("the public landing needs no session while application routes still enforce sign-in", async () => {
  let authCalls = 0;
  const { NextRequest, NextResponse } = require("next/server");
  const mockedModule = { exports: {} };
  evaluate((specifier) => {
    if (specifier === "@/lib/local-design-preview") return { isLocalDesignPreviewHost: () => false };
    if (specifier === "@/lib/qr-name-route") return { isRouteAuthenticatedApiPath: () => false };
    if (specifier === "@/lib/supabase/proxy") return { updateSession: async () => {
      authCalls++;
      return { response: NextResponse.next(), userId: null };
    } };
    if (specifier === "@/lib/auth/redirect") return { safeAuthDestination: () => "/" };
    return require(specifier);
  }, mockedModule, mockedModule.exports);

  const landing = await mockedModule.exports.proxy(new NextRequest("https://qr-chat.example/welcome"));
  assert.equal(landing.status, 200);
  assert.equal(authCalls, 0, "a backend outage must not prevent the public landing from loading");
  for (const path of ["/", "/profile", "/?code=Room%2B1"]) {
    const protectedPage = await mockedModule.exports.proxy(new NextRequest(`https://qr-chat.example${path}`));
    assert.equal(protectedPage.status, 307);
    const destination = new URL(protectedPage.headers.get("location"));
    assert.equal(destination.pathname, "/sign-in");
    assert.equal(destination.searchParams.get("next"), path);
  }
  assert.equal(authCalls, 3);
});
