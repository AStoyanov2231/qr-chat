import { readdir, readFile } from "node:fs/promises";
import { builtinModules, createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = path.resolve(path.dirname(scriptPath), "..");
// Root TypeScript 7 exposes version metadata only; reuse the existing web TypeScript compiler API.
const requireWebTypescript = createRequire(path.join(defaultRoot, "apps/web/package.json"));
const ts = requireWebTypescript("typescript");

const dependencySections = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
const excludedDirectoryNames = new Set([
  ".expo",
  ".next",
  "build",
  "coverage",
  "dist",
  "generated",
  "node_modules",
  "__generated__",
]);
const supportedSourceExtensions = new Set([".cjs", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);
const allowedPackageEdges = new Map([
  ["@qr-chat/api", new Set(["@qr-chat/domain", "@qr-chat/types", "@qr-chat/validation"])],
  ["@qr-chat/domain", new Set(["@qr-chat/types", "@qr-chat/validation"])],
  ["@qr-chat/types", new Set()],
  ["@qr-chat/validation", new Set(["@qr-chat/types"])],
]);
const builtins = new Set(builtinModules.map((name) => name.replace(/^node:/, "")));

function displayPath(root, target) {
  return path.relative(root, target).split(path.sep).join("/") || ".";
}

function packageRoot(specifier) {
  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    return scope && name ? `${scope}/${name}` : specifier;
  }
  return specifier.split("/")[0];
}

function isBuiltin(specifier) {
  const name = specifier.replace(/^node:/, "");
  if (builtins.has(name)) return true;
  const root = name.split("/")[0];
  return builtins.has(root);
}

function isFrameworkOrPlatformModule(specifier) {
  const root = packageRoot(specifier);
  return root === "react"
    || root === "react-dom"
    || root === "react-native"
    || root === "next"
    || root === "expo"
    || root.startsWith("expo-")
    || root.startsWith("@expo/")
    || root.startsWith("@react-navigation/")
    || root.startsWith("@react-native/")
    || root.startsWith("@react-native-")
    || root.startsWith("react-native-")
    || root === "expo-secure-store"
    || root === "react-native-mmkv"
    || root === "localforage"
    || root === "idb"
    || root === "@op-engineering/op-sqlite";
}

function packageImportProblem(workspace, specifier) {
  if (workspace.name === "@qr-chat/api" && specifier === "@supabase/supabase-js") return null;
  if (specifier.startsWith("@supabase/")) {
    return "Supabase SDK access belongs in packages/api or the platform client setup.";
  }
  if (isBuiltin(specifier)) {
    return "Shared packages cannot import Node built-in modules.";
  }
  if (isFrameworkOrPlatformModule(specifier)) {
    return "Shared packages cannot import UI frameworks or platform storage/runtime modules.";
  }
  return null;
}

function dependencyNames(manifest) {
  return new Set(dependencySections.flatMap((section) => Object.keys(manifest[section] ?? {})));
}

function dependencyEntries(manifest) {
  return dependencySections.flatMap((section) => Object.entries(manifest[section] ?? {}).map(([name, version]) => ({ section, name, version })));
}

async function discoverWorkspaces(root, diagnostics) {
  const workspaces = [];
  for (const kind of ["apps", "packages"]) {
    const parent = path.join(root, kind);
    let entries;
    try {
      entries = await readdir(parent, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      diagnostics.push(`${displayPath(root, parent)} [workspace-read] ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    for (const entry of entries.filter((candidate) => candidate.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      const directory = path.join(parent, entry.name);
      const manifestPath = path.join(directory, "package.json");
      let manifestText;
      try {
        manifestText = await readFile(manifestPath, "utf8");
      } catch (error) {
        if (error?.code === "ENOENT") continue;
        diagnostics.push(`${displayPath(root, manifestPath)} [manifest-read] ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      let manifest;
      try {
        manifest = JSON.parse(manifestText);
      } catch (error) {
        diagnostics.push(`${displayPath(root, manifestPath)} [manifest-json] ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      if (!manifest || typeof manifest !== "object" || Array.isArray(manifest) || typeof manifest.name !== "string" || manifest.name.length === 0) {
        diagnostics.push(`${displayPath(root, manifestPath)} [manifest-name] Workspace manifest requires a package name.`);
        continue;
      }
      workspaces.push({ kind: kind === "apps" ? "app" : "package", directory, manifestPath, manifest, name: manifest.name });
    }
  }

  const names = new Map();
  for (const workspace of workspaces) {
    const previous = names.get(workspace.name);
    if (previous) {
      diagnostics.push(`${displayPath(root, workspace.manifestPath)} [duplicate-workspace] Workspace name "${workspace.name}" is also used by ${displayPath(root, previous.manifestPath)}.`);
    } else {
      names.set(workspace.name, workspace);
    }
  }
  return { workspaces, names };
}

function isExportTarget(value) {
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.some(isExportTarget);
  if (value && typeof value === "object") return Object.values(value).some(isExportTarget);
  return false;
}

function hasRootExport(manifest) {
  const exports = manifest.exports;
  if (typeof exports === "string") return isExportTarget(exports);
  if (!exports || typeof exports !== "object") return false;
  const isSubpathMap = Object.keys(exports).some((key) => key.startsWith("."));
  return isExportTarget(isSubpathMap ? exports["."] : exports);
}

function hasPublicExport(manifest, subpath) {
  const exports = manifest.exports;
  if (subpath === ".") return hasRootExport(manifest);
  if (!exports || typeof exports !== "object") return false;
  if (Object.hasOwn(exports, subpath)) return isExportTarget(exports[subpath]);
  const patterns = Object.keys(exports).filter((key) => key.includes("*") && subpath.startsWith(key.split("*")[0]) && subpath.endsWith(key.split("*")[1] ?? ""));
  patterns.sort((a, b) => {
    const prefixDifference = b.split("*")[0].length - a.split("*")[0].length;
    return prefixDifference || (b.split("*")[1] ?? "").length - (a.split("*")[1] ?? "").length;
  });
  return patterns.length > 0 && isExportTarget(exports[patterns[0]]);
}

function readCompilerOptions(configPath) {
  if (!ts.sys.fileExists(configPath)) return {};
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) return {};
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath), {}, configPath);
  return parsed.options;
}

function matchesPathAlias(specifier, paths = {}) {
  return Object.keys(paths).some((pattern) => {
    const wildcard = pattern.indexOf("*");
    if (wildcard < 0) return pattern === specifier;
    const prefix = pattern.slice(0, wildcard);
    const suffix = pattern.slice(wildcard + 1);
    return specifier.startsWith(prefix) && specifier.endsWith(suffix);
  });
}

function resolveLocalImport(specifier, sourcePath, options) {
  const local = specifier.startsWith(".")
    || path.isAbsolute(specifier)
    || matchesPathAlias(specifier, options.paths);
  if (!local) return null;
  const result = ts.resolveModuleName(specifier, sourcePath, options, ts.sys).resolvedModule;
  return result ? path.resolve(result.resolvedFileName) : null;
}

function matchingPathAliases(specifier, options) {
  return Object.keys(options.paths ?? {}).filter((pattern) => {
    const wildcard = pattern.indexOf("*");
    if (wildcard < 0) return pattern === specifier;
    const prefix = pattern.slice(0, wildcard);
    const suffix = pattern.slice(wildcard + 1);
    return specifier.startsWith(prefix) && specifier.endsWith(suffix);
  }).sort((a, b) => {
    const aWildcard = a.indexOf("*");
    const bWildcard = b.indexOf("*");
    return b.slice(0, bWildcard).length - a.slice(0, aWildcard).length;
  });
}

function localImportCandidates(specifier, sourcePath, workspace, options) {
  const resolved = resolveLocalImport(specifier, sourcePath, options);
  if (resolved) return [resolved];
  if (specifier.startsWith(".") || path.isAbsolute(specifier)) {
    return [path.resolve(path.dirname(sourcePath), specifier)];
  }

  const candidates = [];
  for (const pattern of matchingPathAliases(specifier, options)) {
    const wildcardIndex = pattern.indexOf("*");
    const captured = wildcardIndex < 0
      ? ""
      : specifier.slice(wildcardIndex, specifier.length - (pattern.length - wildcardIndex - 1));
    const baseUrl = options.baseUrl
      ? path.resolve(workspace.directory, options.baseUrl)
      : workspace.directory;
    for (const target of options.paths[pattern] ?? []) {
      candidates.push(path.resolve(baseUrl, target.replace("*", captured)));
    }
  }
  return candidates;
}

function owningWorkspace(filePath, workspaces) {
  const absolute = path.resolve(filePath);
  return workspaces.find((workspace) => {
    const relative = path.relative(workspace.directory, absolute);
    return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  }) ?? null;
}

function literalModule(node) {
  return ts.isStringLiteralLike(node) ? node.text : null;
}

function collectModuleSpecifiers(sourceFile) {
  const found = [];
  function record(node, expression) {
    const specifier = literalModule(expression);
    if (specifier !== null) found.push({ specifier, node });
  }
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      record(node, node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      record(node, node.moduleReference.expression);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      record(node, node.argument.literal);
    } else if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      if (isDynamicImport || isRequire) record(node, node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

async function sourceFiles(directory, root, diagnostics) {
  const files = [];
  async function walk(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT" && current === directory) return;
      diagnostics.push(`${displayPath(root, current)} [source-directory] ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const child = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!excludedDirectoryNames.has(entry.name)) await walk(child);
      } else if (entry.isFile() && supportedSourceExtensions.has(path.extname(entry.name))) {
        files.push(child);
      }
    }
  }
  await walk(directory);
  return files;
}

function workspaceSpecifier(specifier, names) {
  const match = [...names.keys()].sort((a, b) => b.length - a.length)
    .find((name) => specifier === name || specifier.startsWith(`${name}/`));
  if (!match) return null;
  const suffix = specifier === match ? "." : `.${specifier.slice(match.length)}`;
  return { name: match, subpath: suffix };
}

function isDeclared(manifest, packageName) {
  return dependencyNames(manifest).has(packageName);
}

function checkManifest(workspace, names, root, diagnostics) {
  if (workspace.kind === "package" && !hasRootExport(workspace.manifest)) {
    diagnostics.push(`${displayPath(root, workspace.manifestPath)} [public-export] Shared packages must declare a public "." export.`);
  }

  for (const { section, name } of dependencyEntries(workspace.manifest)) {
    const target = names.get(name);
    if (target) {
      if (target.kind === "app") {
        diagnostics.push(`${displayPath(root, workspace.manifestPath)} [workspace-dependency] ${workspace.name} cannot depend on app ${name}.`);
      } else if (workspace.kind === "package" && !allowedPackageEdges.get(workspace.name)?.has(name)) {
        diagnostics.push(`${displayPath(root, workspace.manifestPath)} [package-dependency] ${workspace.name} cannot depend on shared package ${name} through ${section}.`);
      } else if (workspace.name === name) {
        diagnostics.push(`${displayPath(root, workspace.manifestPath)} [self-dependency] ${workspace.name} cannot depend on itself.`);
      }
      continue;
    }

    const moduleProblem = workspace.kind === "package" ? packageImportProblem(workspace, name) : null;
    if (moduleProblem) {
      diagnostics.push(`${displayPath(root, workspace.manifestPath)} [forbidden-dependency] ${workspace.name} declares "${name}" in ${section}. ${moduleProblem}`);
    }
  }
}

function checkImport(workspace, sourcePath, sourceFile, imported, context, root, diagnostics) {
  const { specifier, node } = imported;
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const location = `${displayPath(root, sourcePath)}:${position.line + 1}:${position.character + 1}`;
  const foundWorkspace = workspaceSpecifier(specifier, context.names);
  if (foundWorkspace) {
    const target = context.names.get(foundWorkspace.name);
    if (target.kind === "app") {
      diagnostics.push(`${location} [app-import] ${workspace.name} cannot import app ${target.name}.`);
      return;
    }
    if (!hasPublicExport(target.manifest, foundWorkspace.subpath)) {
      diagnostics.push(`${location} [public-import] Import "${specifier}" is not a public export of ${target.name}.`);
      return;
    }
    if (workspace.name === target.name) {
      diagnostics.push(`${location} [self-import] ${workspace.name} cannot import itself by package name.`);
      return;
    }
    if (!isDeclared(workspace.manifest, target.name)) {
      diagnostics.push(`${location} [undeclared-workspace-import] Declare ${target.name} in ${workspace.name}'s package.json before importing it.`);
      return;
    }
    if (workspace.kind === "package" && !allowedPackageEdges.get(workspace.name)?.has(target.name)) {
      diagnostics.push(`${location} [package-import] ${workspace.name} cannot import shared package ${target.name}.`);
    }
    return;
  }

  const candidates = localImportCandidates(specifier, sourcePath, workspace, context.compilerOptions);
  if (candidates.length > 0) {
    const target = candidates.map((candidate) => owningWorkspace(candidate, context.workspaces))
      .find((candidate) => candidate && candidate.name !== workspace.name);
    if (target && target.name !== workspace.name) {
      const rule = target.kind === "app"
        ? `[app-import] ${workspace.name} cannot import source from app ${target.name}.`
        : `[private-import] Imports between shared packages must use the declared public package export (${target.name}).`;
      diagnostics.push(`${location} ${rule}`);
    }
    if (specifier.startsWith(".") || path.isAbsolute(specifier) || matchesPathAlias(specifier, context.compilerOptions.paths)) return;
  }

  if (workspace.kind === "package") {
    const moduleProblem = packageImportProblem(workspace, specifier);
    if (moduleProblem) {
      diagnostics.push(`${location} [forbidden-import] ${workspace.name} imports "${specifier}". ${moduleProblem}`);
      return;
    }
  }

  if (specifier.startsWith(".") || path.isAbsolute(specifier) || specifier.startsWith("#") || matchesPathAlias(specifier, context.compilerOptions.paths)) return;
  if (isBuiltin(specifier)) return;

  const dependency = packageRoot(specifier);
  if (!isDeclared(workspace.manifest, dependency)) {
    diagnostics.push(`${location} [undeclared-import] Declare external dependency "${dependency}" in ${workspace.name}'s package.json.`);
  }
}

export async function checkBoundaries(root = defaultRoot) {
  const absoluteRoot = path.resolve(root);
  const diagnostics = [];
  const discovered = await discoverWorkspaces(absoluteRoot, diagnostics);
  if (discovered.workspaces.length === 0 && diagnostics.length === 0) {
    diagnostics.push(`${displayPath(absoluteRoot, absoluteRoot)} [workspace-root] No app or package workspaces were found.`);
  }
  const context = { ...discovered, compilerOptions: {} };

  for (const workspace of context.workspaces) {
    checkManifest(workspace, context.names, absoluteRoot, diagnostics);
    const compilerOptions = readCompilerOptions(path.join(workspace.directory, "tsconfig.json"));
    const srcDirectory = path.join(workspace.directory, "src");
    for (const sourcePath of await sourceFiles(srcDirectory, absoluteRoot, diagnostics)) {
      let text;
      try {
        text = await readFile(sourcePath, "utf8");
      } catch (error) {
        diagnostics.push(`${displayPath(absoluteRoot, sourcePath)} [source-read] ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      const extension = path.extname(sourcePath);
      const scriptKind = extension === ".tsx" ? ts.ScriptKind.TSX
        : extension === ".jsx" ? ts.ScriptKind.JSX
          : extension === ".js" || extension === ".mjs" || extension === ".cjs" ? ts.ScriptKind.JS
            : ts.ScriptKind.TS;
      const sourceFile = ts.createSourceFile(sourcePath, text, ts.ScriptTarget.Latest, true, scriptKind);
      const importsContext = { ...context, compilerOptions };
      for (const imported of collectModuleSpecifiers(sourceFile)) {
        checkImport(workspace, sourcePath, sourceFile, imported, importsContext, absoluteRoot, diagnostics);
      }
    }
  }

  return diagnostics.sort((a, b) => a.localeCompare(b));
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const diagnostics = await checkBoundaries(process.argv[2] ?? defaultRoot);
  if (diagnostics.length > 0) {
    console.error(diagnostics.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Workspace import boundaries pass.");
  }
}
