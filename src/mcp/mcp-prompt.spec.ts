import { ConfigService } from '@nestjs/config';
import { McpService } from './mcp.service';
import { McpPromptController } from './mcp-prompt.controller';
import { UserRole } from '@prisma/client';
const fixture = () => {
  const prompts = {
    create: jest
      .fn()
      .mockImplementation(({ data }: { data: object }) =>
        Promise.resolve({ id: 1, ...data }),
      ),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
  };
  return {
    prompts,
    service: new McpService(
      { mcpPromptVersion: prompts } as never,
      new ConfigService({ MCP_ENABLED: 'true' }),
    ),
  };
};
describe('versioned MCP prompt', () => {
  it('stores immutable content and a fingerprint', async () => {
    const { service, prompts } = fixture();
    const result = await service.uploadPrompt(
      'actor',
      'guide.txt',
      String.fromCharCode(0xfeff) + 'New guide',
    );
    expect(result.content).toBe('New guide');
    expect(result.contentHash).toHaveLength(64);
    expect(result.createdById).toBe('actor');
    expect(prompts.create).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['bad.json', 'abc'],
    ['empty.txt', '   '],
    ['binary.txt', String.fromCharCode(0)],
    ['large.txt', 'x'.repeat(131073)],
  ])('rejects invalid upload %s', async (name, content) => {
    const { service, prompts } = fixture();
    await expect(
      service.uploadPrompt('actor', name, content),
    ).rejects.toThrow();
    expect(prompts.create).not.toHaveBeenCalled();
  });
  it('reads the latest guide for each call and retains account rules', async () => {
    const { service, prompts } = fixture();
    prompts.findFirst
      .mockResolvedValueOnce({ id: 1, content: 'first', contentHash: 'hash1' })
      .mockResolvedValueOnce({
        id: 2,
        content: 'second',
        contentHash: 'hash2',
      });
    expect(await service.accountGuide('preserve user data')).toContain('first');
    const next = await service.accountGuide('preserve user data');
    expect(next).toContain('second');
    expect(next).toContain('preserve user data');
    expect(next).toContain('save_land');
    expect(prompts.findFirst).toHaveBeenCalledTimes(2);
  });
  it('uses the built-in guide before first upload', async () => {
    const { service, prompts } = fixture();
    prompts.findFirst.mockResolvedValue(null);
    expect(await service.accountGuide('built-in')).toBe('built-in');
  });
  it('restricts the management endpoint to admin roles', () => {
    expect(Reflect.getMetadata('roles', McpPromptController)).toEqual([
      UserRole.ADMIN,
      UserRole.SUPER_ADMIN,
    ]);
    expect(
      Reflect.getMetadata('isPublic', McpPromptController),
    ).toBeUndefined();
  });
});
