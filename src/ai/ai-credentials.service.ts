import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiCredentialStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AI_PROVIDER_ENV_KEYS } from './ai-platform.config';
import {
  decryptSecret,
  encryptSecret,
  keyHint,
} from './credential-crypto';
import {
  CreateAiCredentialDto,
  UpdateAiCredentialDto,
} from './ai-credentials.dto';

const BYOK_PROVIDERS = new Set(Object.keys(AI_PROVIDER_ENV_KEYS));

@Injectable()
export class AiCredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  list(userId: string) {
    return this.prisma.userAiCredential.findMany({
      where: { userId, status: { not: AiCredentialStatus.REVOKED } },
      orderBy: [{ provider: 'asc' }, { createdAt: 'desc' }],
      select: this.safeSelect,
    });
  }

  async create(userId: string, dto: CreateAiCredentialDto) {
    const provider = dto.provider.toLowerCase();
    this.assertByokProvider(provider);
    const apiKey = dto.apiKey.trim();
    if (apiKey.length < 16)
      throw new BadRequestException('API key is too short');
    const encryptionKey = this.encryptionKey();
    if (dto.isDefault) await this.clearDefaults(userId, provider);
    return this.prisma.userAiCredential.create({
      data: {
        userId,
        provider,
        label: dto.label?.trim() || null,
        apiKeyEnc: encryptSecret(apiKey, encryptionKey),
        keyHint: keyHint(apiKey),
        isDefault: dto.isDefault ?? false,
        status: AiCredentialStatus.ACTIVE,
      },
      select: this.safeSelect,
    });
  }

  async update(userId: string, id: string, dto: UpdateAiCredentialDto) {
    const existing = await this.owned(userId, id);
    if (dto.isDefault === true)
      await this.clearDefaults(userId, existing.provider);
    return this.prisma.userAiCredential.update({
      where: { id },
      data: {
        ...(dto.label !== undefined ? { label: dto.label?.trim() || null } : {}),
        ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
      },
      select: this.safeSelect,
    });
  }

  async remove(userId: string, id: string) {
    await this.owned(userId, id);
    await this.prisma.userAiCredential.delete({ where: { id } });
    return { deleted: true };
  }

  async resolveForRequest(userId: string, credentialId: string, provider: string) {
    const credential = await this.prisma.userAiCredential.findFirst({
      where: {
        id: credentialId,
        userId,
        status: AiCredentialStatus.ACTIVE,
      },
    });
    if (!credential)
      throw new NotFoundException('AI credential not found');
    if (credential.provider !== provider.toLowerCase())
      throw new BadRequestException(
        'Credential provider does not match request provider',
      );
    const apiKey = decryptSecret(credential.apiKeyEnc, this.encryptionKey());
    return { credential, apiKey };
  }

  async markUsed(id: string, error?: string) {
    await this.prisma.userAiCredential.update({
      where: { id },
      data: error
        ? {
            lastUsedAt: new Date(),
            lastError: error.slice(0, 500),
            status: AiCredentialStatus.INVALID,
          }
        : {
            lastUsedAt: new Date(),
            lastError: null,
            status: AiCredentialStatus.ACTIVE,
          },
    });
  }

  private async owned(userId: string, id: string) {
    const credential = await this.prisma.userAiCredential.findFirst({
      where: { id, userId, status: { not: AiCredentialStatus.REVOKED } },
    });
    if (!credential) throw new NotFoundException('AI credential not found');
    return credential;
  }

  private clearDefaults(userId: string, provider: string) {
    return this.prisma.userAiCredential.updateMany({
      where: { userId, provider, isDefault: true },
      data: { isDefault: false },
    });
  }

  private assertByokProvider(provider: string) {
    if (!BYOK_PROVIDERS.has(provider))
      throw new BadRequestException(
        `Provider "${provider}" does not support user API keys`,
      );
  }

  private encryptionKey() {
    const key = this.config.get<string>('AI_CREDENTIALS_ENCRYPTION_KEY')?.trim();
    if (!key)
      throw new BadRequestException(
        'AI credentials are not configured on the platform',
      );
    return key;
  }

  private readonly safeSelect = {
    id: true,
    provider: true,
    label: true,
    keyHint: true,
    isDefault: true,
    status: true,
    lastUsedAt: true,
    lastError: true,
    createdAt: true,
    updatedAt: true,
  } satisfies Prisma.UserAiCredentialSelect;
}
