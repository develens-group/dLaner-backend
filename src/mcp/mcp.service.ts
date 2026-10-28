import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { CompactScene, sceneSchema } from './scene-schema';

@Injectable()
export class McpService {
  private guidePromise?: Promise<string>;
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  assertEnabled() {
    if (this.config.get('MCP_ENABLED', 'false') !== 'true')
      throw new ServiceUnavailableException('MCP is disabled');
  }

  async guide() {
    this.assertEnabled();
    this.guidePromise ??= readFile(
      join(__dirname, 'design-guide.txt'),
      'utf8',
    ).catch((error) => {
      this.guidePromise = undefined;
      throw error;
    });
    return `MCP transport rules: Call get_design_guide before the first design in a conversation. Reuse this guide while it remains in context. Submit the scene as structured arguments to create_design, not as a JSON string. This transport supports vector shapes and text only: files must be {}, no image elements. Maximum 2000 elements and 1 MB serialized JSON. User designs expire after 24 hours. Return the openUrl to the user. Never request an AI API key.\n\n${await this.guidePromise}\n\nMCP FINAL STEP: The JSON-only output rules above describe the create_design tool arguments. In this connected workflow, call create_design with that scene instead of printing JSON as the final answer. After success, give the user its openUrl and mention that the link expires in 24 hours.`;
  }

  async create(input: unknown) {
    this.assertEnabled();
    const parsed = sceneSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException(
        parsed.error.issues
          .slice(0, 10)
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; '),
      );
    const json = JSON.stringify(parsed.data);
    if (Buffer.byteLength(json, 'utf8') > 1_000_000)
      throw new BadRequestException('Design exceeds 1 MB');
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 86_400_000);
    await this.prisma.mcpDesign.create({
      data: {
        tokenHash: this.hash(token),
        payload: parsed.data,
        sizeBytes: Buffer.byteLength(json),
        expiresAt,
      },
    });
    const openUrl = new URL(this.config.getOrThrow<string>('MCP_EDITOR_URL'));
    // Fragment tokens are not sent to web-host access logs or Referer headers.
    openUrl.hash = `mcp=${token}`;
    return {
      openUrl: openUrl.toString(),
      expiresAt: expiresAt.toISOString(),
      elementCount: parsed.data.elements.length,
    };
  }

  async get(token: string): Promise<CompactScene> {
    this.assertEnabled();
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new NotFoundException('Design not found or expired');
    const record = await this.prisma.mcpDesign.findUnique({
      where: { tokenHash: this.hash(token) },
    });
    if (!record || record.expiresAt <= new Date())
      throw new NotFoundException('Design not found or expired');
    return record.payload as unknown as CompactScene;
  }

  cleanup() {
    return this.prisma.mcpDesign.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
  }
  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
