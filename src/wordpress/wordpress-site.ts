import { BadRequestException } from '@nestjs/common';

export function normalizeWordPressDomain(input: string): string {
  let url: URL;
  try {
    url = new URL(input.includes('://') ? input : `https://${input}`);
  } catch {
    throw new BadRequestException('siteUrl must contain a valid domain');
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname)
    throw new BadRequestException('siteUrl must be an HTTP(S) URL');
  return url.hostname.toLowerCase().replace(/\.$/, '');
}
