// Signature images are canvas PNGs. Cropping to the ink keeps strokes inside the
// signature box instead of floating in a large transparent canvas.

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

type RgbaImage = { width: number; height: number; data: Uint8Array };

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return ~crc >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

async function pipeBytes(
  stream: CompressionStream | DecompressionStream,
  bytes: Uint8Array,
): Promise<Uint8Array> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const done = new Response(stream.readable).arrayBuffer();
  const writer = stream.writable.getWriter();
  await writer.write(copy);
  await writer.close();
  return new Uint8Array(await done);
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  return pipeBytes(new CompressionStream("deflate"), bytes);
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  return pipeBytes(new DecompressionStream("deflate"), bytes);
}

export async function encodeRgbaPng(
  width: number,
  height: number,
  rgba: Uint8Array,
): Promise<Uint8Array> {
  if (width < 1 || height < 1 || rgba.length !== width * height * 4) {
    throw new Error("Invalid RGBA image.");
  }
  const stride = width * 4;
  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const parts = [
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", await deflate(raw)),
    chunk("IEND", new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const diagonal = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= diagonal) return left;
  if (upDistance <= diagonal) return up;
  return upLeft;
}

function unfilter(
  raw: Uint8Array,
  width: number,
  height: number,
  channels: number,
): Uint8Array | null {
  const stride = width * channels;
  if (raw.length !== height * (stride + 1)) return null;
  const out = new Uint8Array(height * stride);
  let offset = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[offset++];
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const value = raw[offset++];
      const left = x >= channels ? out[row + x - channels] : 0;
      const up = y > 0 ? out[row - stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? out[row - stride + x - channels] : 0;
      let decoded = value;
      if (filter === 1) decoded = value + left;
      else if (filter === 2) decoded = value + up;
      else if (filter === 3) decoded = value + Math.floor((left + up) / 2);
      else if (filter === 4) decoded = value + paeth(left, up, upLeft);
      else if (filter !== 0) return null;
      out[row + x] = decoded & 255;
    }
  }
  return out;
}

async function decodePng(bytes: Uint8Array): Promise<RgbaImage | null> {
  if (bytes.length < 8 || !PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    return null;
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  const idat: Uint8Array[] = [];
  while (offset + 8 <= bytes.length) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7],
    );
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) return null;
    const data = bytes.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      if (data.length < 13) return null;
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      width = view.getUint32(0);
      height = view.getUint32(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) return null;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }
  if (width < 1 || height < 1 || bitDepth !== 8) return null;
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!channels) return null;
  const packed = new Uint8Array(idat.reduce((sum, part) => sum + part.length, 0));
  let packedOffset = 0;
  for (const part of idat) {
    packed.set(part, packedOffset);
    packedOffset += part.length;
  }
  let raw: Uint8Array;
  try {
    raw = await inflate(packed);
  } catch {
    return null;
  }
  const filtered = unfilter(raw, width, height, channels);
  if (!filtered) return null;
  if (channels === 4) return { width, height, data: filtered };
  const rgba = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel++) {
    rgba[pixel * 4] = filtered[pixel * 3];
    rgba[pixel * 4 + 1] = filtered[pixel * 3 + 1];
    rgba[pixel * 4 + 2] = filtered[pixel * 3 + 2];
    rgba[pixel * 4 + 3] = 255;
  }
  return { width, height, data: rgba };
}

function isInk(data: Uint8Array, index: number): boolean {
  const alpha = data[index + 3];
  if (alpha <= 16) return false;
  return data[index] < 245 || data[index + 1] < 245 || data[index + 2] < 245;
}

export async function cropSignaturePng(
  bytes: Uint8Array,
): Promise<{ png: Uint8Array; width: number; height: number } | null> {
  const image = await decodePng(bytes);
  if (!image) return null;
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (!isInk(image.data, (y * image.width + x) * 4)) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  minX = Math.max(0, minX - 1);
  minY = Math.max(0, minY - 1);
  maxX = Math.min(image.width - 1, maxX + 1);
  maxY = Math.min(image.height - 1, maxY + 1);
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const cropped = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const source = ((minY + y) * image.width + minX) * 4;
    cropped.set(image.data.subarray(source, source + width * 4), y * width * 4);
  }
  return { png: await encodeRgbaPng(width, height, cropped), width, height };
}
