import { BadRequestException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { BlockList } from 'node:net';
import { request } from 'node:https';

const blocked = new BlockList();
const blockedV6 = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blocked.addSubnet(address, prefix, 'ipv4');
blockedV6.addSubnet('::', 3, 'ipv6');
blockedV6.addSubnet('fc00::', 7, 'ipv6');
blockedV6.addSubnet('fe80::', 10, 'ipv6');
blockedV6.addSubnet('ff00::', 8, 'ipv6');
blockedV6.addSubnet('2001:db8::', 32, 'ipv6');
export const publicImageAddress = (address: string, family: number) =>
  !(family === 6 ? blockedV6 : blocked).check(
    address,
    family === 6 ? 'ipv6' : 'ipv4',
  );
/** HTTPS only, DNS pinned per request, every redirect revalidated, bounded bytes/time. */
export async function downloadAssistantImage(
  raw: string,
  redirects = 0,
  deadline = Date.now() + 20000,
): Promise<Buffer> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BadRequestException('Invalid image download URL.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    redirects > 3 ||
    Date.now() >= deadline
  )
    throw new BadRequestException(
      'Use a temporary public HTTPS file download link. Local/sandbox paths cannot be downloaded.',
    );
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = await lookup(hostname, { all: true });
  if (
    !addresses.length ||
    addresses.some((a) => !publicImageAddress(a.address, a.family))
  )
    throw new BadRequestException(
      'Private network image URLs are not allowed.',
    );
  const selected = addresses[0];
  return new Promise<Buffer>((resolve, reject) => {
    const req = request(
      url,
      {
        method: 'GET',
        family: selected.family,
        headers: { Accept: 'image/png,image/jpeg,image/webp,image/gif' },
        lookup: (_host, _options, callback) =>
          callback(null, selected.address, selected.family),
      },
      (res) => {
        if (
          [301, 302, 303, 307, 308].includes(res.statusCode ?? 0) &&
          res.headers.location
        ) {
          res.destroy();
          void downloadAssistantImage(
            new URL(res.headers.location, url).href,
            redirects + 1,
            deadline,
          ).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.destroy();
          reject(
            new BadRequestException(
              'Image file could not be downloaded. Its temporary link may have expired; attach it again.',
            ),
          );
          return;
        }
        if (Number(res.headers['content-length'] ?? 0) > 8_000_000) {
          res.destroy();
          reject(new BadRequestException('Image exceeds 8 MB.'));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > 8_000_000) {
            res.destroy(new BadRequestException('Image exceeds 8 MB.'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      },
    );
    const timer = setTimeout(
      () => req.destroy(new BadRequestException('Image download timed out.')),
      Math.max(1, deadline - Date.now()),
    );
    req.on('close', () => clearTimeout(timer));
    req.on('error', reject);
    req.end();
  });
}
export function imageMime(bytes: Buffer) {
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')))
    return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return 'image/jpeg';
  if (['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString()))
    return 'image/gif';
  if (
    bytes.subarray(0, 4).toString() === 'RIFF' &&
    bytes.subarray(8, 12).toString() === 'WEBP'
  )
    return 'image/webp';
  throw new BadRequestException(
    'Only PNG, JPEG, WebP and GIF images are supported.',
  );
}

/** Bound decoded pixel count before allocating a raster preview. */
export function assertImageDimensions(bytes: Buffer, mimeType: string) {
  let width = 0;
  let height = 0;
  if (mimeType === 'image/png' && bytes.length >= 24) {
    width = bytes.readUInt32BE(16);
    height = bytes.readUInt32BE(20);
  }
  if (mimeType === 'image/gif' && bytes.length >= 10) {
    width = bytes.readUInt16LE(6);
    height = bytes.readUInt16LE(8);
  }
  if (mimeType === 'image/webp' && bytes.length >= 30) {
    const mode = bytes.subarray(12, 16).toString();
    if (mode === 'VP8X') {
      width = bytes.readUIntLE(24, 3) + 1;
      height = bytes.readUIntLE(27, 3) + 1;
    }
    if (mode === 'VP8 ') {
      width = bytes.readUInt16LE(26) & 16383;
      height = bytes.readUInt16LE(28) & 16383;
    }
    if (mode === 'VP8L' && bytes[20] === 47) {
      width = 1 + bytes[21] + ((bytes[22] & 63) << 8);
      height =
        1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 15) << 10);
    }
  }
  if (mimeType === 'image/jpeg') {
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset] !== 255) break;
      while (bytes[offset + 1] === 255) offset++;
      const marker = bytes[offset + 1];
      const length = bytes.readUInt16BE(offset + 2);
      if (length < 2 || offset + length + 2 > bytes.length) break;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker) &&
        length >= 7
      ) {
        height = bytes.readUInt16BE(offset + 5);
        width = bytes.readUInt16BE(offset + 7);
        break;
      }
      offset += length + 2;
    }
  }
  if (
    !width ||
    !height ||
    width > 8192 ||
    height > 8192 ||
    width * height > 20_000_000
  )
    throw new BadRequestException(
      'Image dimensions are invalid or exceed 8192px / 20 megapixels. Resize it and attach it again.',
    );
  return { width, height };
}
