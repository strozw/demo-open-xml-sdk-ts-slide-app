/**
 * Minimal PNG iTXt chunk reader/writer (pure Uint8Array, browser + Node).
 *
 * Used to embed the editor's chart JSON inside exported chart images, the
 * same way Excalidraw / draw.io keep their source data in exported PNGs.
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const ITXT = "iTXt";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function ascii(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = text.charCodeAt(index);
  }
  return bytes;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) |
      (bytes[offset + 1]! << 16) |
      (bytes[offset + 2]! << 8) |
      bytes[offset + 3]!) >>>
    0
  );
}

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function assertPngSignature(png: Uint8Array): void {
  if (png.length < 8 + 12 || PNG_SIGNATURE.some((byte, index) => png[index] !== byte)) {
    throw new Error("Not a PNG file");
  }
}

/**
 * Returns a copy of the PNG with an uncompressed iTXt chunk
 * (`keyword\0 0 0 \0 \0 utf8-text`) inserted right after IHDR.
 */
export function insertPngTextChunk(png: Uint8Array, keyword: string, text: string): Uint8Array {
  assertPngSignature(png);
  // keyword + null + compression flag/method + empty language tag + null +
  // empty translated keyword + null + UTF-8 text
  const textBytes = new TextEncoder().encode(text);
  const keywordBytes = ascii(keyword);
  const data = new Uint8Array(keywordBytes.length + 5 + textBytes.length);
  data.set(keywordBytes, 0);
  // 5 zero bytes: keyword null, compression flag 0, compression method 0,
  // language-tag null, translated-keyword null.
  data.set(textBytes, keywordBytes.length + 5);

  const typeAndData = new Uint8Array(4 + data.length);
  typeAndData.set(ascii(ITXT), 0);
  typeAndData.set(data, 4);

  const chunk = new Uint8Array(4 + typeAndData.length + 4);
  writeUint32(chunk, 0, data.length);
  chunk.set(typeAndData, 4);
  writeUint32(chunk, 4 + typeAndData.length, crc32(typeAndData));

  // Insertion point: after the IHDR chunk (signature + length/type/data/crc).
  const ihdrLength = readUint32(png, 8);
  const insertAt = 8 + 4 + 4 + ihdrLength + 4;

  const result = new Uint8Array(png.length + chunk.length);
  result.set(png.subarray(0, insertAt), 0);
  result.set(chunk, insertAt);
  result.set(png.subarray(insertAt), insertAt + chunk.length);
  return result;
}

/**
 * Finds the first iTXt chunk with the given keyword and returns its text,
 * or undefined when absent (also on malformed input — reads never throw
 * past the signature check).
 */
export function readPngTextChunk(png: Uint8Array, keyword: string): string | undefined {
  assertPngSignature(png);
  let offset = 8;
  while (offset + 12 <= png.length) {
    const length = readUint32(png, offset);
    const type = String.fromCharCode(
      png[offset + 4]!,
      png[offset + 5]!,
      png[offset + 6]!,
      png[offset + 7]!,
    );
    const dataStart = offset + 8;
    if (dataStart + length + 4 > png.length) {
      return undefined;
    }
    if (type === ITXT) {
      const data = png.subarray(dataStart, dataStart + length);
      const nullIndex = data.indexOf(0);
      if (nullIndex >= 0) {
        const chunkKeyword = String.fromCharCode(...data.subarray(0, nullIndex));
        if (chunkKeyword === keyword) {
          // Skip compression flag/method, then language tag and translated
          // keyword (both null-terminated).
          let cursor = nullIndex + 3;
          for (let fields = 0; fields < 2 && cursor <= data.length; fields += 1) {
            const end = data.indexOf(0, cursor);
            if (end < 0) {
              return undefined;
            }
            cursor = end + 1;
          }
          return new TextDecoder().decode(data.subarray(cursor));
        }
      }
    }
    if (type === "IEND") {
      return undefined;
    }
    offset = dataStart + length + 4;
  }
  return undefined;
}
