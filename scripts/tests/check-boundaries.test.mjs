import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { checkBoundaries } from "../check-boundaries.mjs";

async function makeFixture({ files = {}, manifests = {} } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "qr-chat-boundaries-"));
  const workspaces = {
    "apps/mobile": { name: "mobile", dependencies: { "@qr-chat/api": "workspace:*" } },
    "apps/web": {
      name: "web",
      dependencies: {
        "@qr-chat/api": "workspace:*",
        "@qr-chat/domain": "workspace:*",
        "@qr-chat/types": "workspace:*",
        "@qr-chat/validation": "workspace:*",
      },
    },
    "packages/api": {
      name: "@qr-chat/api",
      exports: { ".": "./src/index.ts" },
      dependencies: {
        "@qr-chat/domain": "workspace:*",
        "@qr-chat/types": "workspace:*",
        "@qr-chat/validation": "workspace:*",
        "@supabase/supabase-js": "2.0.0",
      },
    },
    "packages/domain": { name: "@qr-chat/domain", exports: { ".": "./src/index.ts" } },
    "packages/types": { name: "@qr-chat/types", exports: { ".": "./src/index.ts" } },
    "packages/validation": {
      name: "@qr-chat/validation",
      exports: { ".": "./src/index.ts" },
      dependencies: { zod: "4.0.0" },
    },
  };

  for (const [relative, defaults] of Object.entries(workspaces)) {
    const directory = path.join(root, relative);
    await mkdir(path.join(directory, "src"), { recursive: true });
    await writeFile(path.join(directory, "package.json"), JSON.stringify({ ...defaults, ...manifests[relative] }), "utf8");
    await writeFile(path.join(directory, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        moduleResolution: "Bundler",
        paths: { "@/*": ["./src/*"] },
      },
    }), "utf8");
  }
  for (const [relative, content] of Object.entries(files)) {
    const destination = path.join(root, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content, "utf8");
  }

  return {
    root,
    async check() { return checkBoundaries(root); },
    async dispose() { await rm(root, { recursive: true, force: true }); },
  };
}

async function withFixture(options, action) {
  const fixture = await makeFixture(options);
  try {
    await action(fixture);
  } finally {
    await fixture.dispose();
  }
}

test("allows declared public package imports and local imports", async () => {
  await withFixture({
    manifests: { "packages/domain": { dependencies: { "@qr-chat/validation": "workspace:*" } } },
    files: {
      "apps/web/src/local.ts": "export const local = true;\n",
      "apps/web/src/index.ts": [
        'import { messageAge } from "@qr-chat/domain";',
        'export { messageAge as exportedMessageAge } from "@qr-chat/domain";',
        'import { local } from "./local.ts";',
        'const api = await import("@qr-chat/api");',
        "void [messageAge, local, api];",
      ].join("\n"),
      "packages/domain/src/index.ts": 'import { codeKeySchema } from "@qr-chat/validation";\nvoid codeKeySchema;\n',
    },
  }, async (fixture) => {
    assert.deepEqual(await fixture.check(), []);
  });
});

test("rejects imports from private workspace package paths", async () => {
  await withFixture({
    files: {
      "apps/web/src/index.ts": [
        'import "@qr-chat/domain/src/internal.ts";',
        'export * from "@qr-chat/domain/src/private.ts";',
      ].join("\n"),
    },
  }, async (fixture) => {
    const diagnostics = await fixture.check();
    assert.ok(diagnostics.some((diagnostic) => diagnostic.includes("[public-import]") && diagnostic.includes("@qr-chat/domain/src/internal.ts")));
  });
});

test("rejects package imports that are missing from the app manifest", async () => {
  await withFixture({
    manifests: { "apps/mobile": { dependencies: { "@qr-chat/api": "workspace:*" } } },
    files: { "apps/mobile/src/index.ts": 'import "@qr-chat/domain";\n' },
  }, async (fixture) => {
    const diagnostics = await fixture.check();
    assert.ok(diagnostics.some((diagnostic) => diagnostic.includes("[undeclared-workspace-import]") && diagnostic.includes("@qr-chat/domain")));
  });
});

test("requires shared packages to declare their imported workspace packages", async () => {
  await withFixture({
    manifests: {
      "packages/api": {
        dependencies: {
          "@qr-chat/types": "workspace:*",
          "@qr-chat/validation": "workspace:*",
          "@supabase/supabase-js": "2.0.0",
        },
      },
    },
    files: { "packages/api/src/index.ts": 'import "@qr-chat/domain";\n' },
  }, async (fixture) => {
    const diagnostics = await fixture.check();
    assert.ok(diagnostics.some((diagnostic) => diagnostic.includes("[undeclared-workspace-import]") && diagnostic.includes("@qr-chat/domain")));
  });
});

test("rejects relative imports between client apps and packages into an app", async () => {
  await withFixture({
    files: {
      "apps/web/src/page.ts": "export const page = true;\n",
      "apps/mobile/src/index.ts": [
        'import "../../web/src/page.ts";',
        'import "../../web/src/missing.ts";',
        'import "web";',
        'import "@web/page";',
        'import "@web/missing";',
      ].join("\n"),
      "apps/mobile/tsconfig.json": JSON.stringify({
        compilerOptions: {
          moduleResolution: "Bundler",
          paths: { "@/*": ["./src/*"], "@web/*": ["../web/src/*"] },
        },
      }),
      "packages/domain/src/index.ts": 'import "../../../apps/web/src/page.ts";\n',
    },
  }, async (fixture) => {
    const diagnostics = await fixture.check();
    assert.ok(diagnostics.some((diagnostic) => diagnostic.includes("[app-import]") && diagnostic.includes("apps/mobile/src/index.ts")));
    assert.ok(diagnostics.filter((diagnostic) => diagnostic.includes("[app-import]") && diagnostic.includes("apps/mobile/src/index.ts")).length >= 5);
    assert.ok(diagnostics.some((diagnostic) => diagnostic.includes("[app-import]") && diagnostic.includes("packages/domain/src/index.ts")));
  });
});

test("rejects UI and platform imports in shared packages", async () => {
  await withFixture({
    files: {
      "packages/domain/src/index.ts": [
        'import React from "react";',
        'import { readFile } from "node:fs/promises";',
        'import "expo-camera";',
        'import "@react-navigation/native";',
        "void [React, readFile];",
      ].join("\n"),
      "packages/api/src/index.ts": [
        'import "expo-secure-store";',
        'import "react-native-reanimated";',
      ].join("\n"),
    },
  }, async (fixture) => {
    const diagnostics = await fixture.check();
    assert.ok(diagnostics.some((diagnostic) => diagnostic.includes("[forbidden-import]") && diagnostic.includes('"react"')));
    assert.ok(diagnostics.some((diagnostic) => diagnostic.includes("[forbidden-import]") && diagnostic.includes('"node:fs/promises"')));
    assert.ok(diagnostics.some((diagnostic) => diagnostic.includes("[forbidden-import]") && diagnostic.includes('"expo-secure-store"')));
    assert.ok(diagnostics.some((diagnostic) => diagnostic.includes("[forbidden-import]") && diagnostic.includes('"expo-camera"')));
    assert.ok(diagnostics.some((diagnostic) => diagnostic.includes("[forbidden-import]") && diagnostic.includes('"@react-navigation/native"')));
    assert.ok(diagnostics.some((diagnostic) => diagnostic.includes("[forbidden-import]") && diagnostic.includes('"react-native-reanimated"')));
  });
});

test("rejects unused forbidden package dependencies", async () => {
  await withFixture({
    manifests: { "packages/api": { devDependencies: { "react-native-mmkv": "1.0.0" } } },
  }, async (fixture) => {
    const diagnostics = await fixture.check();
    assert.ok(diagnostics.some((diagnostic) => diagnostic.includes("[forbidden-dependency]") && diagnostic.includes("react-native-mmkv")));
  });
});

test("accepts conditional public exports and rejects null export overrides", async () => {
  await withFixture({
    manifests: {
      "packages/domain": {
        exports: {
          ".": { types: "./src/index.d.ts", import: "./src/index.js" },
          "./*": "./src/*.ts",
          "./private": null,
        },
      },
    },
    files: {
      "apps/web/src/index.ts": 'import "@qr-chat/domain/private";\n',
    },
  }, async (fixture) => {
    const diagnostics = await fixture.check();
    assert.ok(diagnostics.some((diagnostic) => diagnostic.includes("[public-import]") && diagnostic.includes("@qr-chat/domain/private")));
  });
});

test("accepts a root conditional export object", async () => {
  await withFixture({
    manifests: {
      "packages/domain": {
        exports: { types: "./src/index.d.ts", import: "./src/index.js", require: "./src/index.cjs" },
      },
    },
    files: { "apps/web/src/index.ts": 'import "@qr-chat/domain";\n' },
  }, async (fixture) => {
    assert.deepEqual(await fixture.check(), []);
  });
});

test("parses type imports, literal require, and dynamic imports while ignoring comments", async () => {
  await withFixture({
    files: {
      "apps/web/src/index.ts": [
        '// import Unsupported from "react";',
        'type PrivateType = import("@qr-chat/domain/private").PrivateType;',
        'const privateValue = require("@qr-chat/domain/private");',
        'const domain = import("@qr-chat/domain");',
        "void [PrivateType, privateValue, domain];",
      ].join("\n"),
    },
  }, async (fixture) => {
    const diagnostics = await fixture.check();
    const privateImportErrors = diagnostics.filter((diagnostic) => diagnostic.includes("[public-import]") && diagnostic.includes("@qr-chat/domain/private"));
    assert.equal(privateImportErrors.length, 2);
    assert.ok(!diagnostics.some((diagnostic) => diagnostic.includes('"react"')));
    assert.ok(!diagnostics.some((diagnostic) => diagnostic.includes('"@qr-chat/domain"') && diagnostic.includes("[undeclared")));
  });
});

test("fails for missing or empty workspace roots", async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "qr-chat-empty-root-"));
  const emptyRoot = path.join(temporaryRoot, "empty");
  await mkdir(emptyRoot, { recursive: true });
  try {
    const missing = await checkBoundaries(path.join(temporaryRoot, "missing"));
    const empty = await checkBoundaries(emptyRoot);
    assert.ok(missing.some((diagnostic) => diagnostic.includes("[workspace-root]")));
    assert.ok(empty.some((diagnostic) => diagnostic.includes("[workspace-root]")));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("reports non-ENOENT manifest and source directory read errors", async () => {
  await withFixture({}, async (fixture) => {
    const manifestPath = path.join(fixture.root, "packages/api/package.json");
    await rm(manifestPath);
    await mkdir(manifestPath);

    const sourceDirectory = path.join(fixture.root, "apps/web/src");
    await rm(sourceDirectory, { recursive: true });
    await writeFile(sourceDirectory, "not a directory", "utf8");

    const diagnostics = await fixture.check();
    assert.ok(diagnostics.some((diagnostic) => diagnostic.includes("[manifest-read]") && diagnostic.includes("packages/api/package.json")));
    assert.ok(diagnostics.some((diagnostic) => diagnostic.includes("[source-directory]") && diagnostic.includes("apps/web/src")));
  });
});
