import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { McpService } from './mcp.service';
import { PrismaService } from '../prisma/prisma.service';
import { sceneSchema } from './scene-schema';

const scene = () => ({
  type: 'dlander/clipboard',
  elements: [
    { id: randomUUID(), type: 'rectangle', x: 0, y: 0, width: 120, height: 80 },
  ],
  files: {},
});
describe('guest MCP designs', () => {
  const create = jest.fn<Promise<unknown>, [Prisma.McpDesignCreateArgs]>();
  const findUnique = jest.fn();
  const deleteMany = jest.fn<
    Promise<{ count: number }>,
    [Prisma.McpDesignDeleteManyArgs]
  >();
  let service: McpService;
  beforeEach(() => {
    jest.resetAllMocks();
    create.mockResolvedValue({});
    service = new McpService(
      {
        mcpDesign: { create, findUnique, deleteMany },
      } as unknown as PrismaService,
      new ConfigService({
        MCP_ENABLED: 'true',
        MCP_EDITOR_URL: 'https://example.com/land',
      }),
    );
  });
  it('returns a canvas URL, stores only a hash of the random access token, and sets expiry', async () => {
    const result = await service.create(scene());
    const url = new URL(result.openUrl);
    const token = url.hash.slice(5);
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(url.pathname).toBe('/land');
    expect(create.mock.calls[0][0].data.tokenHash).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
    expect(create.mock.calls[0][0].data).not.toHaveProperty('token');
    expect(Date.parse(result.expiresAt) - Date.now()).toBeGreaterThan(
      86_390_000,
    );
  });
  it('loads an unexpired design without any user account', async () => {
    const payload = scene();
    findUnique.mockResolvedValue({
      payload,
      expiresAt: new Date(Date.now() + 10000),
    });
    expect(await service.get('a'.repeat(64))).toEqual(payload);
  });
  it('rejects malformed, missing and expired tokens', async () => {
    await expect(service.get('../secret')).rejects.toThrow('not found');
    expect(findUnique).not.toHaveBeenCalled();
    findUnique.mockResolvedValue(null);
    await expect(service.get('a'.repeat(64))).rejects.toThrow('not found');
    findUnique.mockResolvedValue({ expiresAt: new Date(0) });
    await expect(service.get('a'.repeat(64))).rejects.toThrow('expired');
  });
  it('rejects duplicate IDs, missing frames, unsupported types, unsafe links and unknown fields', async () => {
    const input = scene();
    for (const invalid of [
      { ...input, elements: [input.elements[0], input.elements[0]] },
      { ...input, elements: [{ ...input.elements[0], frameId: randomUUID() }] },
      { ...input, elements: [{ ...input.elements[0], type: 'embeddable' }] },
      {
        ...input,
        elements: [{ ...input.elements[0], link: 'javascript:alert(1)' }],
      },
      { ...input, elements: [{ ...input.elements[0], html: '<script />' }] },
    ])
      await expect(service.create(invalid)).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
  it('rejects a valid structure larger than the serialized size budget', async () => {
    const input = scene();
    const elements = Array.from({ length: 25 }, () => ({
      id: randomUUID(),
      type: 'text',
      x: 0,
      y: 0,
      text: 'x'.repeat(45000),
      fontSize: 16,
      fontFamily: 1,
      backgroundColor: '#000',
    }));
    await expect(service.create({ ...input, elements })).rejects.toThrow(
      'exceeds 1 MB',
    );
  });
  it('validates bound text and arrow relationships', () => {
    const input = scene();
    expect(
      sceneSchema.safeParse({
        ...input,
        elements: [
          ...input.elements,
          {
            id: randomUUID(),
            type: 'text',
            x: 0,
            y: 0,
            text: 'Title',
            fontSize: 16,
            fontFamily: 1,
            backgroundColor: '#000',
            containerId: input.elements[0].id,
          },
        ],
      }).success,
    ).toBe(true);
  });
  it('deletes expired records through retention cleanup', async () => {
    deleteMany.mockResolvedValue({ count: 4 });
    expect(await service.cleanup()).toEqual({ count: 4 });
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(deleteMany.mock.calls[0][0].where).toHaveProperty('expiresAt.lte');
  });
  it('can be disabled independently of existing AI features', async () => {
    const disabled = new McpService(
      {} as PrismaService,
      new ConfigService({ MCP_ENABLED: 'false' }),
    );
    await expect(disabled.create(scene())).rejects.toThrow('disabled');
  });
});
