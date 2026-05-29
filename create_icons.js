// Generates PNG icons using only Node.js built-ins (zlib for deflate, fs for writing)
const fs = require('fs');
const zlib = require('zlib');

function uint32BE(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
}

function crc32(data) {
  if (!crc32.table) {
    crc32.table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crc32.table[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = crc32.table[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const body = Buffer.concat([t, data]);
  return Buffer.concat([uint32BE(data.length), body, uint32BE(crc32(body))]);
}

function createPNG(size, drawFn) {
  // RGBA raw image data with filter byte per row
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const off = y * (1 + size * 4) + 1 + x * 4;
      drawFn(x, y, size, raw, off);
    }
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = chunk('IHDR', Buffer.concat([
    uint32BE(size), uint32BE(size),
    Buffer.from([8, 6, 0, 0, 0]) // 8-bit RGBA
  ]));
  const idat = chunk('IDAT', zlib.deflateSync(raw, { level: 9 }));
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

function drawIcon(x, y, size, buf, off) {
  const cx = size / 2, cy = size / 2;
  const r = size / 2;
  // Outer circle radius, inner content area
  const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > r) {
    // Transparent background
    buf[off] = 0; buf[off + 1] = 0; buf[off + 2] = 0; buf[off + 3] = 0;
    return;
  }

  // Anti-aliased edge
  const alpha = Math.min(1, (r - dist) * 2);

  // Football pattern: dark patches on white
  // Simplified: red background with a white "足" character area
  // Use a simple pentagon/hexagon pattern like a football
  const normX = (x + 0.5 - cx) / r;
  const normY = (y + 0.5 - cy) / r;

  // Red background (中超 red: 215, 26, 30)
  let pr = 215, pg = 26, pb = 30;

  // Draw a simple white soccer ball pattern (pentagon approximation)
  // Central hexagon
  const absX = Math.abs(normX), absY = Math.abs(normY);
  const inCenter = absX < 0.35 && absY < 0.35;
  const inPatch = (
    (absX < 0.6 && normY < -0.2 && normY > -0.55) ||
    (normX > 0.15 && normX < 0.55 && normY > 0.1 && normY < 0.55) ||
    (normX < -0.15 && normX > -0.55 && normY > 0.1 && normY < 0.55)
  );

  if (size >= 48) {
    if (inCenter) { pr = 255; pg = 255; pb = 255; }
    else if (inPatch) { pr = 255; pg = 255; pb = 255; }
  }

  buf[off] = pr;
  buf[off + 1] = pg;
  buf[off + 2] = pb;
  buf[off + 3] = Math.round(alpha * 255);
}

const sizes = [16, 48, 128];
sizes.forEach(size => {
  const png = createPNG(size, drawIcon);
  fs.writeFileSync(`icons/icon${size}.png`, png);
  console.log(`Created icons/icon${size}.png (${png.length} bytes)`);
});
