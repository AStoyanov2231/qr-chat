import { Resolver } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";
import { resolveQrPageName, type QrPageNameMetadata } from "@qr-chat/domain";
import ipaddr from "ipaddr.js";
import { parse, parseFragment, type DefaultTreeAdapterTypes as Html } from "parse5";

const MAX_HTML_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;
const TOTAL_TIMEOUT_MS = 3_500;
const LOCAL_HOST_SUFFIXES = [
  ".localhost", ".local", ".internal", ".test", ".invalid", ".example", ".onion", ".home.arpa",
];
export type PinnedAddress = { address: string; family: 4 | 6 };
export type MetadataResponse = {
  status: number;
  location: string | null;
  contentType: string | null;
  contentEncoding: string | null;
  body: string;
};
export type MetadataLookupDependencies = {
  timeoutMs?: number;
  resolve(hostname: string, signal: AbortSignal): Promise<readonly PinnedAddress[]>;
  request(url: URL, address: PinnedAddress, signal: AbortSignal): Promise<MetadataResponse>;
};

function textContent(node: Html.Node): string {
  if (node.nodeName === "#text" && "value" in node) return node.value;
  if (!("childNodes" in node)) return "";
  const children = node.nodeName === "template" && "content" in node
    ? node.content.childNodes
    : node.childNodes;
  return children.map(textContent).join("");
}

function walk(node: Html.Node, visit: (element: Html.Element) => void): void {
  if ("tagName" in node) visit(node);
  if (!("childNodes" in node)) return;
  for (const child of node.childNodes) walk(child, visit);
  if (node.nodeName === "template" && "content" in node) {
    for (const child of node.content.childNodes) walk(child, visit);
  }
}

function attribute(element: Html.Element, name: string): string | null {
  return element.attrs.find((item) => item.name.toLowerCase() === name)?.value ?? null;
}

function plainText(value: string): string {
  const fragment = parseFragment(value);
  return textContent(fragment)
    .replace(/\p{Cc}/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function structuredDataCandidates(value: unknown, metadata: QrPageNameMetadata, depth = 0): void {
  if (depth > 12) return;
  if (Array.isArray(value)) {
    for (const item of value) structuredDataCandidates(item, metadata, depth + 1);
    return;
  }
  if (!isRecord(value)) return;
  const record = value;
  const rawType = record["@type"];
  const types = (Array.isArray(rawType) ? rawType : [rawType])
    .filter((item): item is string => typeof item === "string");
  const rawName = record.name;
  const names = typeof rawName === "string"
    ? [rawName]
    : Array.isArray(rawName)
      ? rawName.filter((item): item is string => typeof item === "string")
      : isRecord(rawName) && typeof rawName["@value"] === "string"
        ? [rawName["@value"]]
        : [];
  if (types.length && names.length) metadata.structuredData.push({ types, names: names.map(plainText) });
  for (const [key, child] of Object.entries(record)) {
    if (key === "@graph" || key === "mainEntity" || key === "itemListElement") {
      structuredDataCandidates(child, metadata, depth + 1);
    }
  }
}

/** Extract a conservative venue name from public business and page-title metadata. */
export function extractVenueName(html: string): string | null {
  const document = parse(html);
  const metadata: QrPageNameMetadata = {
    structuredData: [],
    openGraphTitles: [],
    pageTitles: [],
    siteNames: [],
  };
  const jsonLd: string[] = [];

  walk(document, (element) => {
    if (element.tagName === "meta") {
      const key = (attribute(element, "property") ?? attribute(element, "name") ?? "").toLowerCase();
      const content = attribute(element, "content");
      if (!content) return;
      if (key === "og:title") metadata.openGraphTitles.push(plainText(content));
      if (key === "og:site_name") metadata.siteNames.push(plainText(content));
    } else if (element.tagName === "title") {
      metadata.pageTitles.push(plainText(textContent(element)));
    } else if (element.tagName === "script" && attribute(element, "type")?.toLowerCase().split(";")[0]?.trim() === "application/ld+json") {
      jsonLd.push(textContent(element));
    }
  });

  for (const script of jsonLd) {
    if (script.length > 128 * 1024) continue;
    try { structuredDataCandidates(JSON.parse(script) as unknown, metadata); } catch { /* malformed JSON-LD is not a name source */ }
  }
  return resolveQrPageName(metadata);
}

export function isPublicIpAddress(value: string): boolean {
  if (!ipaddr.isValid(value)) return false;
  let address = ipaddr.parse(value);
  if (address instanceof ipaddr.IPv6 && address.isIPv4MappedAddress()) address = address.toIPv4Address();
  return address.range() === "unicast";
}

function hostnameForRequest(url: URL): string | null {
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password || (url.port && url.port !== (url.protocol === "http:" ? "80" : "443"))) return null;
  const host = url.hostname.replace(/^\[|\]$/gu, "").replace(/\.$/u, "").toLowerCase();
  if (!host || host.includes("%") || LOCAL_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return null;
  if (ipaddr.isValid(host)) return isPublicIpAddress(host) ? host : null;
  const labels = host.split(".");
  if (labels.length < 2 || labels.some((label) => !/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/u.test(label))) return null;
  return host;
}

function isExpectedNoAnswer(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && ["ENODATA", "ENOTFOUND", "EAI_NODATA"].includes(String(error.code));
}

function abortable<T>(operation: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = () => finish(() => reject(signal.reason ?? new Error("Metadata lookup timed out")));
    const finish = (action: () => void) => {
      signal.removeEventListener("abort", onAbort);
      action();
    };
    if (signal.aborted) {
      reject(signal.reason ?? new Error("Metadata lookup timed out"));
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(operation).then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

async function resolvePublicAddresses(hostname: string, signal: AbortSignal): Promise<readonly PinnedAddress[]> {
  if (ipaddr.isValid(hostname)) {
    return [{ address: hostname, family: hostname.includes(":") ? 6 : 4 }];
  }
  const resolver = new Resolver();
  const cancel = () => resolver.cancel();
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const results = await Promise.allSettled([
      resolver.resolve4(hostname),
      resolver.resolve6(hostname),
    ]);
    if (signal.aborted) throw new Error("Metadata lookup timed out");
    const addresses: PinnedAddress[] = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        for (const address of result.value) addresses.push({ address, family: index === 0 ? 4 : 6 });
      } else if (!isExpectedNoAnswer(result.reason)) {
        throw result.reason;
      }
    });
    if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIpAddress(address))) {
      throw new Error("The QR host does not resolve only to public addresses");
    }
    return addresses;
  } finally {
    signal.removeEventListener("abort", cancel);
    resolver.cancel();
  }
}

function requestPinned(url: URL, address: PinnedAddress, signal: AbortSignal): Promise<MetadataResponse> {
  const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
    if (options.all) callback(null, [address satisfies LookupAddress]);
    else callback(null, address.address, address.family);
  };
  const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const request = transport(url, {
      method: "GET",
      agent: false,
      lookup: pinnedLookup,
      signal,
      headers: {
        accept: "text/html,application/xhtml+xml;q=0.9",
        "accept-encoding": "identity",
        "user-agent": "QRChatNameLookup/1.0",
      },
    }, (response) => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location ?? null;
      const contentType = response.headers["content-type"] ?? null;
      const contentEncoding = response.headers["content-encoding"] ?? null;
      if ([301, 302, 303, 307, 308].includes(status)) {
        response.destroy();
        resolve({ status, location, contentType, contentEncoding, body: "" });
        return;
      }

      const length = Number(response.headers["content-length"] ?? 0);
      if (Number.isFinite(length) && length > MAX_HTML_BYTES) {
        request.destroy(new Error("Metadata page is too large"));
        return;
      }

      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.byteLength;
        if (size > MAX_HTML_BYTES) {
          response.destroy(new Error("Metadata page is too large"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({ status, location, contentType, contentEncoding, body: Buffer.concat(chunks).toString("utf8") }));
      response.on("error", reject);
    });
    request.on("error", reject);
    request.end();
  });
}

const productionDependencies: MetadataLookupDependencies = {
  resolve: resolvePublicAddresses,
  request: requestPinned,
};

/** Fetch at most one small public HTML page chain, pinning each validated DNS result. */
export async function lookupQrPageName(
  input: string,
  dependencies: MetadataLookupDependencies = productionDependencies,
): Promise<string | null> {
  let url: URL;
  try { url = new URL(input); } catch { return null; }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), dependencies.timeoutMs ?? TOTAL_TIMEOUT_MS);
  try {
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      if (controller.signal.aborted) return null;
      const hostname = hostnameForRequest(url);
      if (!hostname) return null;
      const addresses = await abortable(dependencies.resolve(hostname, controller.signal), controller.signal);
      if (!addresses.length || addresses.some(({ address }) => !isPublicIpAddress(address))) return null;
      const response = await abortable(dependencies.request(url, addresses[0]!, controller.signal), controller.signal);
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (redirects === MAX_REDIRECTS || !response.location) return null;
        let next: URL;
        try { next = new URL(response.location, url); } catch { return null; }
        if (url.protocol === "https:" && next.protocol !== "https:") return null;
        url = next;
        continue;
      }
      if (response.status < 200 || response.status >= 300
          || !/^text\/html(?:\s*;|$)/iu.test(response.contentType ?? "")
          || (response.contentEncoding && response.contentEncoding.toLowerCase() !== "identity")) return null;
      if (Buffer.byteLength(response.body, "utf8") > MAX_HTML_BYTES) return null;
      return extractVenueName(response.body);
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
  return null;
}
