import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt, randomUUID } from 'node:crypto';
import { CreditService } from '../credits/credit.service';
import {
  FakeAiTypeDefinition,
  FakeAiTypeId,
  buildLoremFlickrUrl,
  getFakeAiType,
  listFakeAiTypes,
} from './fake-ai.catalog';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 10 * 1024 * 1024;

export interface FakeAiExecuteInput {
  type: string;
  prompt?: string;
  style?: string;
  strength?: string;
  scale?: string;
  width?: string;
  height?: string;
  image?: Express.Multer.File;
}

export interface FakeAiResult {
  type: FakeAiTypeId;
  imageUrl: string;
  width: number;
  height: number;
  creditCost: number;
}

@Injectable()
export class FakeAiService {
  constructor(
    private readonly credits: CreditService,
    private readonly config: ConfigService,
  ) {}

  listTypes(): FakeAiTypeDefinition[] {
    return listFakeAiTypes();
  }

  async execute(
    userId: string,
    input: FakeAiExecuteInput,
  ): Promise<FakeAiResult> {
    const def = getFakeAiType(input.type);
    if (!def)
      throw new BadRequestException(`Unknown fake AI type: ${input.type}`);
    this.validate(def, input);

    const chargingEnabled =
      this.config.get('AI_CREDIT_CHARGING_ENABLED', 'true') !== 'false';
    const { width, height } = this.resolveSize(def, input);
    const operationKey = `fake-ai:${userId}:${randomUUID()}`;

    const creditCost = def.creditCost;
    const reservation = chargingEnabled
      ? await this.credits.reserveCredits(
          userId,
          creditCost,
          `${operationKey}:reserve`,
          'FAKE_AI_REQUEST',
          operationKey,
        )
      : undefined;

    try {
      const imageUrl = buildLoremFlickrUrl(
        width,
        height,
        randomInt(1, 1_000_000_000),
      );
      if (reservation) {
        await this.credits.captureReservation(
          userId,
          reservation.id,
          creditCost,
          `${operationKey}:capture`,
        );
      }
      return {
        type: def.id,
        imageUrl,
        width,
        height,
        creditCost: def.creditCost,
      };
    } catch (error) {
      if (reservation) {
        await this.credits
          .releaseReservation(userId, reservation.id, `${operationKey}:release`)
          .catch(() => undefined);
      }
      throw error;
    }
  }

  private validate(def: FakeAiTypeDefinition, input: FakeAiExecuteInput) {
    for (const field of def.fields) {
      if (field.name === 'image') {
        if (field.required && !input.image)
          throw new BadRequestException('image file is required');
        if (input.image) this.assertImage(input.image);
        continue;
      }
      const raw = (input as unknown as Record<string, unknown>)[field.name];
      if (field.required && (raw === undefined || raw === null || raw === ''))
        throw new BadRequestException(`${field.name} is required`);
      if (raw === undefined || raw === null || raw === '') continue;
      if (field.type === 'string') {
        if (typeof raw !== 'string' || !raw.trim())
          throw new BadRequestException(
            `${field.name} must be a non-empty string`,
          );
        continue;
      }
      if (field.type === 'number') {
        const num = Number(raw);
        if (!Number.isFinite(num))
          throw new BadRequestException(`${field.name} must be a number`);
        if (field.enum && !field.enum.includes(num))
          throw new BadRequestException(
            `${field.name} must be one of: ${field.enum.join(', ')}`,
          );
        if (field.minimum !== undefined && num < field.minimum)
          throw new BadRequestException(
            `${field.name} must be >= ${field.minimum}`,
          );
        if (field.maximum !== undefined && num > field.maximum)
          throw new BadRequestException(
            `${field.name} must be <= ${field.maximum}`,
          );
      }
    }
  }

  private assertImage(file: Express.Multer.File) {
    if (!ALLOWED_MIME.has(file.mimetype))
      throw new BadRequestException(
        'image must be image/jpeg, image/png, or image/webp',
      );
    if (file.size > MAX_BYTES)
      throw new BadRequestException('image must be at most 10MB');
  }

  private resolveSize(
    def: FakeAiTypeDefinition,
    input: FakeAiExecuteInput,
  ): { width: number; height: number } {
    let width = def.defaultWidth;
    let height = def.defaultHeight;
    if (input.width !== undefined && input.width !== '') {
      const w = Number(input.width);
      if (!Number.isFinite(w))
        throw new BadRequestException('width must be a number');
      width = w;
    }
    if (input.height !== undefined && input.height !== '') {
      const h = Number(input.height);
      if (!Number.isFinite(h))
        throw new BadRequestException('height must be a number');
      height = h;
    }
    return { width, height };
  }
}
