export function ab2hex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(ab) {
  const digest = await crypto.subtle.digest('SHA-256', ab);
  return ab2hex(digest);
}

export function mimeFromExt(ext) {
  const normalized = (ext || '').toLowerCase();
  if (normalized === 'jpg' || normalized === 'jpeg') return 'image/jpeg';
  if (normalized === 'png') return 'image/png';
  if (normalized === 'gif') return 'image/gif';
  if (normalized === 'webp') return 'image/webp';
  if (normalized === 'avif') return 'image/avif';
  if (normalized === 'tif' || normalized === 'tiff') return 'image/tiff';
  if (normalized === 'heic') return 'image/heic';
  if (normalized === 'heif') return 'image/heif';
  if (normalized === 'bmp') return 'image/bmp';
  if (normalized === 'md') return 'text/markdown';
  if (normalized === 'json') return 'application/json';
  if (normalized === 'pdf') return 'application/pdf';
  if (normalized === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (normalized === 'doc') return 'application/msword';
  if (normalized === 'pptx') return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  if (normalized === 'ppt') return 'application/vnd.ms-powerpoint';
  if (normalized === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (normalized === 'csv') return 'text/csv';
  if (normalized === 'txt') return 'text/plain';
  if (normalized === 'epub') return 'application/epub+zip';
  if (normalized === 'xml') return 'application/xml';
  if (normalized === 'rtf') return 'application/rtf';
  if (normalized === 'odt') return 'application/vnd.oasis.opendocument.text';
  if (normalized === 'ipynb') return 'application/x-ipynb+json';
  if (normalized === 'tex') return 'application/x-tex';
  return 'application/octet-stream';
}

export function guessImageMime(url, contentType) {
  if (contentType && contentType.startsWith('image/')) return contentType.split(';')[0];
  try {
    const parsed = new URL(url);
    const ext = (parsed.pathname.split('.').pop() || '').toLowerCase();
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    if (ext === 'gif') return 'image/gif';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'avif') return 'image/avif';
    if (ext === 'tif' || ext === 'tiff') return 'image/tiff';
    if (ext === 'heic') return 'image/heic';
    if (ext === 'heif') return 'image/heif';
    if (ext === 'bmp') return 'image/bmp';
  } catch {}
  return 'image/jpeg';
}

export function arrayBufferToBase64(ab) {
  const bytes = new Uint8Array(ab);
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function normalizeBase64Payload(value) {
  if (!value) return '';
  let normalized = String(value).trim();
  const commaIndex = normalized.indexOf(',');
  if (normalized.startsWith('data:') && commaIndex >= 0) {
    normalized = normalized.slice(commaIndex + 1);
  }
  normalized = normalized.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const remainder = normalized.length % 4;
  if (remainder) normalized += '='.repeat(4 - remainder);
  return normalized;
}

export function base64ToBytes(b64) {
  const normalized = normalizeBase64Payload(b64);
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function base64ToArrayBuffer(b64) {
  return base64ToBytes(b64).buffer;
}

export function base64ToDataUrl(base64OrDataUrl, fallbackName = 'image.jpeg') {
  if (base64OrDataUrl.startsWith('data:')) return base64OrDataUrl;
  const ext = fallbackName.split('.').pop() || 'jpeg';
  return `data:${mimeFromExt(ext)};base64,${base64OrDataUrl}`;
}

export function dataUrlFromText(text, type = 'text/plain') {
  return `data:${type};charset=utf-8,${encodeURIComponent(text)}`;
}

export function extractMarkdownImageNames(markdown) {
  const names = [];
  const re = /!\[[^\]]*\]\(([^)]+)\)/g;
  let match;
  while ((match = re.exec(markdown)) !== null) names.push(match[1]);
  return names;
}

export function pickImageFileName(index, page, namesFromMd, imageObj) {
  if (namesFromMd[index]) return namesFromMd[index];
  if (imageObj?.id) return imageObj.id;
  return `img-${page.index}-${index}.jpeg`;
}

export function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function sanitizeFileName(name, fallback = 'document') {
  const cleaned = (name || fallback)
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  return cleaned || fallback;
}

export function stripFileExtension(name) {
  const safeName = sanitizeFileName(name, 'document');
  return safeName.replace(/\.[A-Za-z0-9]{1,8}$/, '') || 'document';
}

export function unescapePdfLiteral(str) {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char !== '\\') {
      out += char;
      continue;
    }
    const next = str[++i];
    if (!next) break;
    if (next === 'n') out += '\n';
    else if (next === 'r') out += '\r';
    else if (next === 't') out += '\t';
    else if (next === 'b') out += '\b';
    else if (next === 'f') out += '\f';
    else if (next === '(') out += '(';
    else if (next === ')') out += ')';
    else if (next === '\\') out += '\\';
    else if (/[0-7]/.test(next)) {
      let octal = next;
      for (let k = 0; k < 2 && i + 1 < str.length && /[0-7]/.test(str[i + 1]); k++) {
        octal += str[++i];
      }
      out += String.fromCharCode(parseInt(octal, 8));
    } else {
      out += next;
    }
  }
  return out;
}

export function decodeHexStringToText(hex) {
  const clean = (hex || '').replace(/[\s<>]/g, '');
  if (clean.length < 2) return '';
  const bytes = new Uint8Array(Math.floor(clean.length / 2));
  for (let i = 0; i + 1 < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substr(i, 2), 16);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  try {
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return new TextDecoder('latin1').decode(bytes);
  }
}

export function normalizeTitleCandidate(title) {
  const normalized = (title || '')
    .replace(/[\u0000-\u001f]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 200);
  if (!normalized) return null;
  const lower = normalized.toLowerCase();
  if (lower === 'untitled' || lower === 'document' || lower === 'unknown') return null;
  return normalized;
}

export function extractPdfTitle(ab) {
  try {
    const bytes = new Uint8Array(ab);
    try {
      const utf8 = new TextDecoder('utf-8').decode(bytes);
      const xmpTitle = utf8.match(/<dc:title[\s\S]*?<rdf:Alt[\s\S]*?<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/i);
      if (xmpTitle) {
        const title = normalizeTitleCandidate(xmpTitle[1]);
        if (title) return title;
      }
    } catch {}

    try {
      const latin = new TextDecoder('latin1').decode(bytes);
      let infoTitle = latin.match(/\/Title\s*\(([\s\S]*?)\)/);
      if (infoTitle) {
        const title = normalizeTitleCandidate(unescapePdfLiteral(infoTitle[1]));
        if (title) return title;
      }
      infoTitle = latin.match(/\/Title\s*<([\s0-9A-Fa-f]+)>/);
      if (infoTitle) {
        const title = normalizeTitleCandidate(decodeHexStringToText(infoTitle[1]));
        if (title) return title;
      }
    } catch {}
  } catch {}
  return null;
}

export function parseContentDispositionFilename(contentDisposition) {
  if (!contentDisposition) return null;
  try {
    let match = contentDisposition.match(/filename\*\s*=\s*([^;]+)/i);
    if (match) {
      let value = (match[1] || '').trim().replace(/^"|"$/g, '');
      const extended = value.match(/^([^']*)'[^']*'(.*)$/);
      if (extended) {
        try {
          value = decodeURIComponent(extended[2] || '');
        } catch {
          value = extended[2] || '';
        }
      } else if (/^utf-8''/i.test(value)) {
        try {
          value = decodeURIComponent(value.slice(7));
        } catch {
          value = value.slice(7);
        }
      }
      return value.trim();
    }
    match = contentDisposition.match(/filename\s*=\s*("([^"]+)"|([^;]+))/i);
    if (match) return (match[2] || match[3] || '').trim();
  } catch {}
  return null;
}

export function filenameFromUrlHeuristics(url) {
  try {
    const parsed = new URL(url);
    const keys = ['filename', 'file', 'name', 'title', 'download', 'attname'];
    for (const key of keys) {
      const value = parsed.searchParams.get(key);
      if (value) return decodeURIComponent(value);
    }
    const last = decodeURIComponent((parsed.pathname.split('/').pop() || '').trim());
    return last || null;
  } catch {
    return null;
  }
}

export function looksLikePdfBuffer(ab) {
  const signature = new TextDecoder('ascii').decode(new Uint8Array(ab).subarray(0, 4));
  return signature === '%PDF';
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(view, offset, value) {
  view.setUint16(offset, value, true);
}

function writeUint32(view, offset, value) {
  view.setUint32(offset, value, true);
}

export function createZipFromFiles(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
    const crc = crc32(dataBytes);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, 0);
    writeUint16(localView, 8, 0);
    writeUint16(localView, 10, 0);
    writeUint16(localView, 12, 0);
    writeUint32(localView, 14, crc);
    writeUint32(localView, 18, dataBytes.length);
    writeUint32(localView, 22, dataBytes.length);
    writeUint16(localView, 26, nameBytes.length);
    writeUint16(localView, 28, 0);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, dataBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, 0);
    writeUint16(centralView, 10, 0);
    writeUint16(centralView, 12, 0);
    writeUint16(centralView, 14, 0);
    writeUint32(centralView, 16, crc);
    writeUint32(centralView, 20, dataBytes.length);
    writeUint32(centralView, 24, dataBytes.length);
    writeUint16(centralView, 28, nameBytes.length);
    writeUint16(centralView, 30, 0);
    writeUint16(centralView, 32, 0);
    writeUint16(centralView, 34, 0);
    writeUint16(centralView, 36, 0);
    writeUint32(centralView, 38, 0);
    writeUint32(centralView, 42, offset);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length + dataBytes.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, files.length);
  writeUint16(endView, 10, files.length);
  writeUint32(endView, 12, centralSize);
  writeUint32(endView, 16, offset);
  writeUint16(endView, 20, 0);

  const totalSize = offset + centralSize + endRecord.length;
  const zip = new Uint8Array(totalSize);
  let cursor = 0;
  for (const part of localParts) {
    zip.set(part, cursor);
    cursor += part.length;
  }
  for (const part of centralParts) {
    zip.set(part, cursor);
    cursor += part.length;
  }
  zip.set(endRecord, cursor);
  return zip;
}
