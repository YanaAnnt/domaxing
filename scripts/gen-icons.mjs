// Generates the PWA / iOS app icons as PNGs with no dependencies (pure Node + zlib).
// Usage: node scripts/gen-icons.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// Smoked black glass tile + frosted white "D" (the dark-theme look of components/logo.tsx).
const top = [59, 61, 69]; // #3B3D45
const bottom = [12, 13, 17]; // #0C0D11
const glyphTop = [255, 255, 255];
const glyphBottom = [214, 216, 222]; // #D6D8DE
const SHEEN = 0.16; // white specular sheen across the top
const RIM = 0.55; // bright top rim (rounded icons only; the OS draws the edge for the others)
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c, d, t) => [lerp(c[0], d[0], t), lerp(c[1], d[1], t), lerp(c[2], d[2], t)];
const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

// Glyph on a 32×32 grid, same geometry as components/logo.tsx:
// a "D" (left rect x∈[9,16], y∈[9,23] with 1-unit corners + right half-disc, center 16,16, r 7)
// with a check cut out of it.
function insideD(x, y) {
  if (y < 9 || y > 23 || x < 9) return false;
  if (x >= 16) return Math.hypot(x - 16, y - 16) <= 7;
  if (x < 10 && y < 10) return Math.hypot(x - 10, y - 10) <= 1;
  if (x < 10 && y > 22) return Math.hypot(x - 10, y - 22) <= 1;
  return true;
}
const checkDist = (x, y) => Math.min(segDist(x, y, 12.6, 16.3, 14.9, 18.6), segDist(x, y, 14.9, 18.6, 19.4, 14.1));

/** shape: "square" (iOS masks corners itself), "rounded" (any), "maskable" (safe-zone padding) */
function icon(size, shape) {
  const SS = 4; // supersampling
  const pad = shape === "rounded" ? 0.06 : 0;
  const radius = shape === "rounded" ? 0.22 : 0;
  const glyphScale = shape === "maskable" ? 0.78 : 1;
  return png(size, (x, y) => {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++)
      for (let sx = 0; sx < SS; sx++) {
        const u = (x + (sx + 0.5) / SS) / size;
        const v = (y + (sy + 0.5) / SS) / size;
        // tile shape (signed distance to the rounded rect; <= 0 is inside)
        let sd = -1;
        if (shape === "rounded") {
          const half = 0.5 - pad, rr = radius * (1 - 2 * pad);
          const qx = Math.abs(u - 0.5) - (half - rr), qy = Math.abs(v - 0.5) - (half - rr);
          sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr;
        }
        if (sd > 0) continue;
        // glass body
        let c = mix(top, bottom, v);
        // curved specular sheen (same curve as the SVG: y≈9 at the right edge, 15 at the left)
        const bx = u * 32, by = v * 32;
        const sheenEdge = 9 + 6 * Math.pow((32 - bx) / 32, 2.5);
        if (by < sheenEdge) c = mix(c, [255, 255, 255], SHEEN * (1 - by / 15));
        // bright rim, strongest at the top
        if (shape === "rounded" && sd > -0.012) {
          const rimT = v < 0.45 ? 1 - v / 0.45 : ((v - 0.45) / 0.55) * 0.25;
          c = mix(c, [255, 255, 255], RIM * rimT);
        }
        // frosted white "D" with the check cut out
        const s = glyphScale;
        const gx = 16 + ((u - 0.5) * 32) / s, gy = 16 + ((v - 0.5) * 32) / s;
        if (insideD(gx, gy) && checkDist(gx, gy) > 1.15) c = mix(glyphTop, glyphBottom, (gy - 9) / 14);
        r += c[0]; g += c[1]; b += c[2]; a += 255;
      }
    const n = SS * SS;
    return a ? [Math.round(r / (a / 255)), Math.round(g / (a / 255)), Math.round(b / (a / 255)), Math.round(a / n)] : [0, 0, 0, 0];
  });
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", icon(192, "rounded"));
writeFileSync("public/icons/icon-512.png", icon(512, "rounded"));
writeFileSync("public/icons/maskable-512.png", icon(512, "maskable"));
writeFileSync("public/icons/apple-touch-icon.png", icon(180, "square"));
writeFileSync("public/favicon.ico", icon(48, "rounded")); // PNG-in-ico is accepted by modern browsers
console.log("Icons written to public/icons");
