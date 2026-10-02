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
