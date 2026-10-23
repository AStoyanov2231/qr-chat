const ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
const decode = (text: string) => text.replace(/&(?:#(\d+)|#x([\da-f]+)|(\w+));/giu, (whole, dec, hex, name) =>
  dec ? String.fromCodePoint(Number(dec)) : hex ? String.fromCodePoint(parseInt(hex, 16)) : ENTITIES[name.toLowerCase()] ?? whole);

/** Title and preview image of an HTML page: Open Graph first, then Twitter card, then <title>. */
export function pageMeta(html: string): { title: string | null; image: string | null } {
  const tags: Record<string, string> = {};
  for (const [tag] of html.matchAll(/<meta\s[^>]*>/giu)) {
    const attrs = new Map(Array.from(tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu), (m) => [m[1]!.toLowerCase(), m[2] ?? m[3]!]));
    const key = (attrs.get("property") ?? attrs.get("name"))?.toLowerCase();
    const content = attrs.get("content");
    if (key && content) tags[key] ??= content;
  }
  const title = tags["og:title"] ?? tags["twitter:title"] ?? /<title[^>]*>([^<]*)/iu.exec(html)?.[1];
  const image = tags["og:image"] ?? tags["twitter:image"];
  return {
    title: title ? decode(title).replace(/\s+/gu, " ").trim().slice(0, 100).trim() || null : null,
    image: image ? decode(image).trim() : null,
  };
}

/** False for loopback, private, link-local, CGNAT and other non-public addresses (IPv4 or IPv6). */
export function isPublicAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/iu.exec(address);
  const ip = mapped ? mapped[1]! : address.toLowerCase();
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.\d+$/u.exec(ip);
  if (v4) {
    const [a, b, c] = [Number(v4[1]), Number(v4[2]), Number(v4[3])];
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0 && c === 0) || (a === 198 && (b === 18 || b === 19)));
  }
  return !/^(::1?|f[cd]|fe[89ab]|ff|64:ff9b|2001:db8)/u.test(ip);
}
