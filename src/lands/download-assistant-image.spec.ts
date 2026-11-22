import {
  downloadAssistantImage,
  publicImageAddress,
  imageMime,
  assertImageDimensions,
} from './download-assistant-image';
it.each([
  '127.0.0.1',
  '10.0.0.1',
  '169.254.169.254',
  '172.16.0.1',
  '192.168.1.1',
  '100.64.0.1',
  '0.0.0.0',
])('blocks private/reserved IPv4 %s', (ip) =>
  expect(publicImageAddress(ip, 4)).toBe(false),
);
it.each([
  '::1',
  '::ffff:127.0.0.1',
  '::ffff:169.254.169.254',
  'fc00::1',
  'fe80::1',
])('blocks private IPv6 %s', (ip) =>
  expect(publicImageAddress(ip, 6)).toBe(false),
);
it('permits public addresses', () => {
  expect(publicImageAddress('8.8.8.8', 4)).toBe(true);
  expect(publicImageAddress('2606:4700:4700::1111', 6)).toBe(true);
});
it.each([
  'http://example.com/a.png',
  'file:///tmp/a.png',
  'sandbox:/mnt/data/car.png',
  'https://user:pass@example.com/a.png',
  'https://example.com:8443/a.png',
])(
  'rejects unsafe transfer input %s',
  async (url) => await expect(downloadAssistantImage(url)).rejects.toThrow(),
);
it('rejects an HTML page disguised as an image', () =>
  expect(() => imageMime(Buffer.from('<html>'))).toThrow());

it('rejects images whose decoded dimensions would exhaust memory', () => {
  const bytes = Buffer.alloc(24);
  bytes.writeUInt32BE(100000, 16);
  bytes.writeUInt32BE(100000, 20);
  expect(() => assertImageDimensions(bytes, 'image/png')).toThrow('dimensions');
});
