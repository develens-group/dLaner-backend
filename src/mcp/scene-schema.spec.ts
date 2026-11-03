import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js';
import { elementSchema, sceneShape } from './scene-schema';

// Test the actual conversion used by tools/list, not just Zod input parsing.
const tuplePaths = (value: unknown, path = '$'): string[] => {
  if (!value || typeof value !== 'object') return [];
  const object = value as Record<string, unknown>;
  return [
    ...(Array.isArray(object.items) ? [path + '.items'] : []),
    ...Object.entries(object).flatMap(([key, child]) =>
      tuplePaths(child, `${path}.${key}`),
    ),
  ];
};

describe('MCP tool schema compatibility', () => {
  it('publishes homogeneous array item schemas for OpenAI tool import', () => {
    const schema = toJsonSchemaCompat(z.object(sceneShape), {
      target: 'jsonSchema7',
      strictUnions: true,
    });
    expect(tuplePaths(schema)).toEqual([]);
  });

  const shape = {
    id: randomUUID(),
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 100,
    height: 80,
  };
  it('keeps exactly four numeric corner radii', () => {
    expect(
      elementSchema.safeParse({ ...shape, borderRadius: [1, 2, 3, 4] }).success,
    ).toBe(true);
    for (const borderRadius of [
      [1, 2, 3],
      [1, 2, 3, 4, 5],
      [1, 2, 3, -1],
      [1, 2, 3, '4'],
    ]) {
      expect(elementSchema.safeParse({ ...shape, borderRadius }).success).toBe(
        false,
      );
    }
  });
  it('keeps exactly two coordinates per point and coordinate bounds', () => {
    expect(
      elementSchema.safeParse({
        ...shape,
        type: 'line',
        points: [
          [0, 0],
          [50, 80],
        ],
      }).success,
    ).toBe(true);
    for (const point of [[1], [1, 2, 3], [1, '2'], [1, 1000001]]) {
      expect(
        elementSchema.safeParse({ ...shape, points: [[0, 0], point] }).success,
      ).toBe(false);
    }
  });
});
