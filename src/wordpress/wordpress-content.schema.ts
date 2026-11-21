import { z } from 'zod';
const short = z.string().max(2000);
const httpUrl = z
  .string()
  .max(4096)
  .url()
  .refine((value) => /^https?:\/\//i.test(value), 'Use HTTP(S) URLs');
export const contentBody = z
  .object({
    title: z.string().max(1000),
    slug: short.optional(),
    url: httpUrl.optional(),
    contentHtml: z.string().max(300000).optional(),
    contentText: z.string().max(300000).optional(),
    excerpt: z.string().max(20000).optional(),
    description: z.string().max(20000).optional(),
    mediaUrl: httpUrl.optional(),
    mimeType: short.optional(),
    parentId: short.optional(),
    modifiedAt: short.optional(),
    price: z.string().max(64).optional(),
    currency: z.string().max(16).optional(),
    categories: z.array(short).max(200).optional(),
    menuItems: z
      .array(
        z
          .object({
            label: short,
            url: httpUrl.optional(),
            parentId: short.optional(),
            objectId: short.optional(),
          })
          .strict(),
      )
      .max(500)
      .optional(),
    themeName: short.optional(),
    colors: z.array(z.string().max(100)).max(100).optional(),
    fonts: z.array(short).max(100).optional(),
  })
  .strict();
export const contentItem = z
  .object({
    kind: z.enum([
      'page',
      'post',
      'product',
      'media',
      'menu',
      'taxonomy',
      'appearance',
    ]),
    externalId: z.string().min(1).max(120),
    status: z
      .enum(['publish', 'draft', 'pending', 'private', 'future'])
      .default('publish'),
    data: contentBody,
  })
  .strict();
export const startSync = z
  .object({
    expectedItems: z.number().int().min(0).max(5000),
    includeUnpublished: z.boolean().default(false),
    siteInfo: z
      .object({
        title: z.string().max(1000),
        description: z.string().max(5000).optional(),
        homeUrl: httpUrl,
        locale: short.optional(),
        themeName: short.optional(),
      })
      .strict(),
  })
  .strict();
export const syncBatch = z
  .object({ items: z.array(contentItem).min(1).max(50) })
  .strict();
