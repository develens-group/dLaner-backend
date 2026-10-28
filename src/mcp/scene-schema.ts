import { z } from 'zod';

const coordinate = z.number().finite().min(-1_000_000).max(1_000_000);
const dimension = z.number().finite().positive().max(100_000);
const binding = z
  .object({
    elementId: z.string().uuid(),
    focus: z.number().finite().optional(),
    gap: z.number().finite().optional(),
  })
  .strict();
export const elementSchema = z
  .object({
    id: z.string().uuid(),
    type: z.enum([
      'rectangle',
      'ellipse',
      'diamond',
      'text',
      'line',
      'arrow',
      'frame',
    ]),
    x: coordinate,
    y: coordinate,
    width: dimension.optional(),
    height: dimension.optional(),
    angle: z.number().finite().optional(),
    backgroundColor: z.string().max(2000).optional(),
    backgroundGradient: z.string().max(2000).optional(),
    backgroundSolid: z.string().max(200).optional(),
    strokeColor: z.string().max(2000).optional(),
    strokeGradient: z.string().max(2000).optional(),
    strokeSolid: z.string().max(200).optional(),
    strokeWidth: z.number().finite().min(0).max(1000).optional(),
    strokeStyle: z.enum(['solid', 'dashed', 'dotted']).optional(),
    fillStyle: z.enum(['solid', 'hachure', 'cross-hatch', 'zigzag']).optional(),
    roughness: z.number().int().min(0).max(2).optional(),
    hachureGap: z.number().finite().positive().optional(),
    hachureAngle: z.number().finite().optional(),
    fillWeight: z.number().finite().nonnegative().optional(),
    opacity: z.number().min(0).max(100).optional(),
    borderRadius: z
      .union([
        z.number().nonnegative().max(100000),
        z.tuple([
          z.number().nonnegative(),
          z.number().nonnegative(),
          z.number().nonnegative(),
          z.number().nonnegative(),
        ]),
      ])
      .optional(),
    hasShadow: z.boolean().optional(),
    shadowColor: z.string().max(2000).optional(),
    shadowGradient: z.string().max(2000).optional(),
    offsetShadowX: coordinate.optional(),
    offsetShadowY: coordinate.optional(),
    shadowBlur: z.number().nonnegative().max(1000).optional(),
    groupIds: z.array(z.string().uuid()).max(100).optional(),
    frameId: z.string().uuid().nullable().optional(),
    link: z
      .string()
      .url()
      .max(2048)
      .refine((v) => /^https?:\/\//i.test(v), 'Only HTTP(S) links are allowed')
      .optional(),
    text: z.string().max(50000).optional(),
    fontSize: z.number().positive().max(10000).optional(),
    fontFamily: z.number().int().positive().optional(),
    fontWeight: z.union([z.string().max(32), z.number().finite()]).optional(),
    fontStyle: z.string().max(32).optional(),
    textAlign: z.enum(['left', 'center', 'right']).optional(),
    verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
    lineHeight: z.number().positive().max(10).optional(),
    letterspace: z.number().finite().min(-100).max(1000).optional(),
    autoResize: z.boolean().optional(),
    icon: z.boolean().optional(),
    containerId: z.string().uuid().nullable().optional(),
    heading: z.enum(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']).optional(),
    elbowed: z.boolean().optional(),
    name: z.string().max(500).optional(),
    points: z
      .array(z.tuple([coordinate, coordinate]))
      .min(2)
      .max(1000)
      .optional(),
    dlanderType: z
      .enum([
        'cube',
        'heart',
        'home',
        'user',
        'mail',
        'leaf',
        'tree',
        'filter',
        'hashtag',
        'rocket',
        'heartbeat',
        'rightTriangle',
        'b2',
        'dlanderArrow',
        'dlanderArrow2',
        'dlanderArrow4',
        'parallelogram',
        'trapezoid',
        'polygonCustom',
      ])
      .optional(),
    startArrowhead: z
      .enum([
        'arrow',
        'bar',
        'dot',
        'triangle',
        'circle',
        'circle_outline',
        'triangle_outline',
        'diamond',
        'diamond_outline',
        'crowfoot_one',
        'crowfoot_many',
        'crowfoot_one_or_many',
      ])
      .nullable()
      .optional(),
    endArrowhead: z
      .enum([
        'arrow',
        'bar',
        'dot',
        'triangle',
        'circle',
        'circle_outline',
        'triangle_outline',
        'diamond',
        'diamond_outline',
        'crowfoot_one',
        'crowfoot_many',
        'crowfoot_one_or_many',
      ])
      .nullable()
      .optional(),
    startBinding: binding.nullable().optional(),
    endBinding: binding.nullable().optional(),
  })
  .strict();

export const sceneShape = {
  type: z.literal('dlander/clipboard'),
  elements: z.array(elementSchema).min(1).max(2000),
  files: z.object({}).strict().default({}),
};
export const sceneSchema = z
  .object(sceneShape)
  .strict()
  .superRefine((scene, ctx) => {
    const fail = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    const ids = new Map(scene.elements.map((e) => [e.id, e]));
    if (ids.size !== scene.elements.length) fail('Element IDs must be unique');
    const shapes = new Set(['rectangle', 'ellipse', 'diamond']);
    for (const e of scene.elements) {
      if (
        ['rectangle', 'ellipse', 'diamond', 'frame'].includes(e.type) &&
        !e.dlanderType &&
        (!e.width || !e.height)
      )
        fail(`${e.id}: width and height are required`);
      if (
        e.type === 'text' &&
        (e.text === undefined ||
          !e.fontSize ||
          !e.fontFamily ||
          !e.backgroundColor)
      )
        fail(
          `${e.id}: text, fontSize, fontFamily and backgroundColor are required`,
        );
      if (
        (e.type === 'line' || e.type === 'arrow' || e.dlanderType) &&
        !e.points
      )
        fail(`${e.id}: points are required`);
      if (
        e.frameId &&
        (e.frameId === e.id ||
          ids.get(e.frameId)?.type !== 'frame' ||
          e.type === 'frame')
      )
        fail(`${e.id}: invalid frameId`);
      if (
        e.containerId &&
        (e.type !== 'text' ||
          e.containerId === e.id ||
          !shapes.has(ids.get(e.containerId)?.type ?? ''))
      )
        fail(`${e.id}: invalid text containerId`);
      for (const b of [e.startBinding, e.endBinding])
        if (
          b &&
          (e.type !== 'arrow' ||
            b.elementId === e.id ||
            !shapes.has(ids.get(b.elementId)?.type ?? ''))
        )
          fail(`${e.id}: invalid arrow binding`);
      for (const group of e.groupIds ?? [])
        if (ids.has(group))
          fail(`${e.id}: group IDs must differ from element IDs`);
      if (e.backgroundGradient && !e.backgroundSolid)
        fail(`${e.id}: backgroundSolid required with gradient`);
      if (e.strokeGradient && !e.strokeSolid)
        fail(`${e.id}: strokeSolid required with gradient`);
      if (e.shadowGradient && !e.shadowColor)
        fail(`${e.id}: shadowColor required with gradient`);
    }
  });
export type CompactScene = z.infer<typeof sceneSchema>;
