import { createHash } from 'node:crypto';
import { ImageModelSetupDto } from './image-model-setup.dto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { formatCreditAmount, parseCreditAmount } from '../credits/credit-units';
import {
  CreateOperationTypeDto,
  CreateProviderVariantDto,
  UpdateOperationTypeDto,
  UpdateProviderVariantDto,
} from './ai-operations.dto';
import { isByokImageProvider } from './ai-byok-image';
import {
  REPLICATE_PRESETS,
  pricedPreset,
  inputSelection,
} from './replicate-presets';

const BUILTIN_PROVIDERS = [
  { id: 'replicate', label: 'Replicate', implemented: true },
  { id: 'openai', label: 'OpenAI', implemented: true },
  { id: 'google', label: 'Google Gemini', implemented: true },
  { id: 'xai', label: 'xAI Grok', implemented: true },
  { id: 'stability', label: 'Stability', implemented: false },
] as const;

@Injectable()
export class AiOperationsCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async importImageModel(dto: ImageModelSetupDto) {
    const model = dto.model.trim();
    if (
      !model ||
      !dto.label.trim() ||
      !/^(?:generate|edit)-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(dto.slug)
    ) {
      throw new BadRequestException(
        'A model ID, label and generate-/edit- slug are required',
      );
    }
    if (!['replicate', 'openai', 'google', 'xai'].includes(dto.provider)) {
      throw new BadRequestException('Unsupported image provider');
    }
    if (
      dto.provider === 'replicate' &&
      !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(model)
    ) {
      throw new BadRequestException('Replicate model must be owner/model-name');
    }
    const values = new Set<string>();
    const entries = dto.tiers.map((tier) => {
      const value = tier.value.trim();
      if (!value || values.has(value))
        throw new BadRequestException(
          'Option values must be non-empty and unique',
        );
      values.add(value);
      let cost: Prisma.Decimal;
      try {
        cost = parseCreditAmount(tier.creditCost);
        if (!cost.isFinite() || cost.lte(0) || cost.gte('1000000000000000000'))
          throw new Error('Invalid price');
      } catch {
        throw new BadRequestException(
          `Set a positive decimal credit price for ${value}`,
        );
      }
      const hash = createHash('sha256')
        .update(`image-model:${dto.slug}:${dto.provider}:${model}:${value}`)
        .digest('hex');
      const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
      const defaults = {
        ...dto.defaults,
        ...tier.parameters,
        ...(dto.selectorName ? { [dto.selectorName]: value } : {}),
      };
      return { value, cost, id, defaults };
    });
    if (!entries.length)
      throw new BadRequestException('Price at least one option');
    return this.prisma.$transaction(async (tx) => {
      const type = await tx.aiOperationType.upsert({
        where: { slug: dto.slug },
        create: {
          slug: dto.slug,
          label: dto.label.trim(),
          description: dto.description.trim(),
          isActive: true,
          sortOrder: 30,
        },
        update: {
          label: dto.label.trim(),
          description: dto.description.trim(),
          isActive: true,
        },
      });
      await tx.aiProviderVariant.updateMany({
        where: { typeId: type.id, isDefault: true },
        data: { isDefault: false },
      });
      for (const [index, entry] of entries.entries()) {
        const data = {
          typeId: type.id,
          provider: dto.provider,
          externalModel: model,
          label: entry.value,
          creditCost: entry.cost,
          priority: index,
          isDefault: index === 0,
          isActive: true,
          configJson: {
            managedImageModel: true,
            requiresPrompt: dto.requiresPrompt,
            defaults: entry.defaults,
            input: { image: dto.imageField, prompt: dto.promptField },
            imageArray: dto.imageArray,
            modelEndpoint: dto.modelEndpoint,
            selection: {
              name: dto.selectorName || 'option',
              value: entry.value,
            },
          } as Prisma.InputJsonObject,
        };
        await tx.aiProviderVariant.upsert({
          where: { id: entry.id },
          create: { id: entry.id, ...data },
          update: data,
        });
      }
      const saved = await tx.aiOperationType.findUniqueOrThrow({
        where: { id: type.id },
        include: { variants: true },
      });
      return this.serializeType(saved);
    });
  }

  listModelPresets() {
    return REPLICATE_PRESETS;
  }

  async importModelPreset(id: string, prices: Record<string, unknown>) {
    const { preset, entries } = pricedPreset(id, prices);
    await this.prisma.$transaction(async (tx) => {
      const type = await tx.aiOperationType.upsert({
        where: { slug: preset.slug },
        create: {
          slug: preset.slug,
          label: preset.label,
          description: preset.description,
          isActive: true,
          sortOrder: 30,
        },
        update: { isActive: true },
      });
      await tx.aiProviderVariant.updateMany({
        where: { typeId: type.id, isDefault: true },
        data: { isDefault: false },
      });
      for (const [index, entry] of entries.entries()) {
        const data = {
          typeId: type.id,
          provider: 'replicate',
          externalModel: preset.model,
          label: entry.value,
          creditCost: entry.cost,
          priority: preset.options.indexOf(entry.value as never),
          isDefault: index === 0,
          isActive: true,
          configJson: {
            defaults: {
              [preset.parameter]: entry.value,
              aspect_ratio: '1:1',
              ...(preset.parameter === 'quality'
                ? { number_of_images: 1 }
                : {}),
            },
            selection: { name: preset.parameter, value: entry.value },
          },
        };
        await tx.aiProviderVariant.upsert({
          where: { id: entry.variantId },
          create: { id: entry.variantId, ...data },
          update: data,
        });
      }
    });
    const type = await this.prisma.aiOperationType.findUniqueOrThrow({
      where: { slug: preset.slug },
    });
    return this.getType(type.id, true);
  }

  listProviders() {
    return BUILTIN_PROVIDERS;
  }

  listTypes(admin = false) {
    return this.prisma.aiOperationType
      .findMany({
        where: admin ? {} : { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          variants: {
            where: admin ? {} : { isActive: true },
            orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
          },
        },
      })
      .then((rows) => rows.map((t) => this.serializeType(t)));
  }

  async getType(id: string, admin = false) {
    const type = await this.prisma.aiOperationType.findFirst({
      where: admin ? { id } : { id, isActive: true },
      include: {
        variants: {
          where: admin ? {} : { isActive: true },
          orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!type) throw new NotFoundException('Operation type not found');
    return this.serializeType(type);
  }

  async createType(dto: CreateOperationTypeDto) {
    try {
      const created = await this.prisma.aiOperationType.create({
        data: {
          slug: dto.slug.trim().toLowerCase(),
          label: dto.label.trim(),
          description: dto.description?.trim(),
          isActive: dto.isActive ?? true,
          sortOrder: dto.sortOrder ?? 0,
        },
        include: { variants: true },
      });
      return this.serializeType(created);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        throw new ConflictException('Operation type slug already exists');
      throw e;
    }
  }

  async updateType(id: string, dto: UpdateOperationTypeDto) {
    await this.requireType(id);
    try {
      const updated = await this.prisma.aiOperationType.update({
        where: { id },
        data: {
          ...(dto.slug !== undefined
            ? { slug: dto.slug.trim().toLowerCase() }
            : {}),
          ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description?.trim() }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
        include: {
          variants: { orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] },
        },
      });
      return this.serializeType(updated);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        throw new ConflictException('Operation type slug already exists');
      throw e;
    }
  }

  async deleteType(id: string) {
    await this.requireType(id);
    const updated = await this.prisma.aiOperationType.update({
      where: { id },
      data: { isActive: false },
      include: { variants: true },
    });
    return this.serializeType(updated);
  }

  listVariants(typeId?: string) {
    return this.prisma.aiProviderVariant
      .findMany({
        where: typeId ? { typeId } : {},
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
        include: { type: true },
      })
      .then((rows) => rows.map((v) => this.serializeVariant(v)));
  }

  async createVariant(dto: CreateProviderVariantDto) {
    await this.requireType(dto.typeId);
    this.assertKnownProvider(dto.provider);
    const creditCost = parseCreditAmount(dto.creditCost);
    const created = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.aiProviderVariant.updateMany({
          where: { typeId: dto.typeId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.aiProviderVariant.create({
        data: {
          typeId: dto.typeId,
          provider: dto.provider.trim().toLowerCase(),
          externalModel: dto.externalModel.trim(),
          label: dto.label.trim(),
          creditCost,
          priority: dto.priority ?? 100,
          isDefault: dto.isDefault ?? false,
          isActive: dto.isActive ?? true,
          configJson:
            dto.configJson === undefined
              ? undefined
              : (dto.configJson as Prisma.InputJsonValue),
        },
        include: { type: true },
      });
    });
    return this.serializeVariant(created);
  }

  async updateVariant(id: string, dto: UpdateProviderVariantDto) {
    const existing = await this.requireVariant(id);
    if (dto.provider) this.assertKnownProvider(dto.provider);
    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true) {
        await tx.aiProviderVariant.updateMany({
          where: {
            typeId: existing.typeId,
            isDefault: true,
            NOT: { id },
          },
          data: { isDefault: false },
        });
      }
      return tx.aiProviderVariant.update({
        where: { id },
        data: {
          ...(dto.provider !== undefined
            ? { provider: dto.provider.trim().toLowerCase() }
            : {}),
          ...(dto.externalModel !== undefined
            ? { externalModel: dto.externalModel.trim() }
            : {}),
          ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
          ...(dto.creditCost !== undefined
            ? { creditCost: parseCreditAmount(dto.creditCost) }
            : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.configJson !== undefined
            ? { configJson: dto.configJson as Prisma.InputJsonValue }
            : {}),
        },
        include: { type: true },
      });
    });
    return this.serializeVariant(updated);
  }

  async setDefault(id: string) {
    const existing = await this.requireVariant(id);
    if (!existing.isActive)
      throw new BadRequestException('Cannot default an inactive variant');
    await this.prisma.$transaction(async (tx) => {
      await tx.aiProviderVariant.updateMany({
        where: { typeId: existing.typeId, isDefault: true },
        data: { isDefault: false },
      });
      await tx.aiProviderVariant.update({
        where: { id },
        data: { isDefault: true },
      });
    });
    return this.serializeVariant(await this.requireVariant(id));
  }

  async deleteVariant(id: string) {
    await this.requireVariant(id);
    const updated = await this.prisma.aiProviderVariant.update({
      where: { id },
      data: { isActive: false, isDefault: false },
      include: { type: true },
    });
    return this.serializeVariant(updated);
  }

  async resolveVariant(typeSlug: string, variantId?: string) {
    const type = await this.prisma.aiOperationType.findFirst({
      where: { slug: typeSlug, isActive: true },
    });
    if (!type)
      throw new NotFoundException({
        code: 'AI_TYPE_NOT_FOUND',
        message: 'Operation type not found',
      });
    if (variantId) {
      const variant = await this.prisma.aiProviderVariant.findFirst({
        where: { id: variantId, typeId: type.id, isActive: true },
        include: { type: true },
      });
      if (!variant)
        throw new NotFoundException({
          code: 'AI_VARIANT_NOT_FOUND',
          message: 'Provider variant not found',
        });
      return variant;
    }
    const def = await this.prisma.aiProviderVariant.findFirst({
      where: { typeId: type.id, isActive: true, isDefault: true },
      include: { type: true },
    });
    if (!def)
      throw new BadRequestException({
        code: 'AI_NO_DEFAULT_VARIANT',
        message: 'No default variant configured for this type',
      });
    return def;
  }

  private async requireType(id: string) {
    const type = await this.prisma.aiOperationType.findUnique({
      where: { id },
    });
    if (!type) throw new NotFoundException('Operation type not found');
    return type;
  }

  private async requireVariant(id: string) {
    const variant = await this.prisma.aiProviderVariant.findUnique({
      where: { id },
      include: { type: true },
    });
    if (!variant) throw new NotFoundException('Provider variant not found');
    return variant;
  }

  private assertKnownProvider(provider: string) {
    const id = provider.trim().toLowerCase();
    if (!BUILTIN_PROVIDERS.some((p) => p.id === id))
      throw new BadRequestException(`Unknown provider: ${provider}`);
  }

  private serializeType<
    T extends { variants?: Array<{ creditCost: unknown }> },
  >(type: T) {
    return {
      ...type,
      variants: (type.variants ?? []).map((v) => this.serializeVariant(v)),
    };
  }

  private serializeVariant<
    T extends { creditCost: unknown; provider?: string; configJson?: unknown },
  >(variant: T) {
    const provider =
      typeof variant.provider === 'string' ? variant.provider : '';
    return {
      ...variant,
      creditCost: formatCreditAmount(variant.creditCost as never),
      supportsUserKey: isByokImageProvider(provider),
      inputSelection: inputSelection(variant.configJson),
    };
  }
}
