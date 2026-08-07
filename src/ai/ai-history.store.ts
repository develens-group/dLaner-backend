import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const AI_HISTORY_STORE = Symbol('AI_HISTORY_STORE');

export type AiHistoryPayload = {
  inputJson?: unknown;
  outputJson?: unknown;
};

export interface AiHistoryStore {
  create(id: string, userId: string, input: unknown): Promise<void>;
  complete(id: string, output: unknown): Promise<void>;
  getMany(ids: string[]): Promise<Map<string, AiHistoryPayload>>;
  cleanup?(): Promise<number>;
}

@Injectable()
export class NoopAiHistoryStore implements AiHistoryStore {
  create() {
    return Promise.resolve();
  }
  complete() {
    return Promise.resolve();
  }
  getMany() {
    return Promise.resolve(new Map<string, AiHistoryPayload>());
  }
}

type D1Result<T> = {
  success: boolean;
  result?: Array<{ results?: T[]; meta?: { changes?: number } }>;
  errors?: Array<{ message?: string }>;
};

@Injectable()
export class CloudflareD1AiHistoryStore implements AiHistoryStore {
  private readonly endpoint: string;
  private readonly token: string;
  private readonly retentionSeconds: number;

  constructor(config: ConfigService) {
    const accountId = config.getOrThrow<string>('AI_HISTORY_D1_ACCOUNT_ID');
    const databaseId = config.getOrThrow<string>('AI_HISTORY_D1_DATABASE_ID');
    this.token = config.getOrThrow<string>('AI_HISTORY_D1_API_TOKEN');
    this.endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
    this.retentionSeconds =
      config.get<number>('AI_HISTORY_RETENTION_DAYS', 90) * 86_400;
  }

  async create(id: string, userId: string, inputJson: unknown) {
    const now = Math.floor(Date.now() / 1000);
    await this.query(
      `INSERT INTO ai_history
       (id, user_id, input_json, created_at, updated_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        JSON.stringify(inputJson),
        new Date().toISOString(),
        new Date().toISOString(),
        now + this.retentionSeconds,
      ],
    );
  }

  async complete(id: string, outputJson: unknown) {
    await this.query(
      `UPDATE ai_history SET output_json = ?, updated_at = ? WHERE id = ?`,
      [JSON.stringify(outputJson), new Date().toISOString(), id],
    );
  }

  async getMany(ids: string[]) {
    const payloads = new Map<string, AiHistoryPayload>();
    for (let offset = 0; offset < ids.length; offset += 90) {
      const batch = ids.slice(offset, offset + 90);
      const rows = await this.query<{
        id: string;
        input_json: string | null;
        output_json: string | null;
      }>(
        `SELECT id, input_json, output_json FROM ai_history WHERE id IN (${batch.map(() => '?').join(',')})`,
        batch,
      );
      for (const row of rows)
        payloads.set(row.id, {
          inputJson: this.parseJson(row.input_json),
          outputJson: this.parseJson(row.output_json),
        });
    }
    return payloads;
  }

  async cleanup() {
    const response = await this.request<never>(
      'DELETE FROM ai_history WHERE expires_at < ?',
      [Math.floor(Date.now() / 1000)],
    );
    return response.result?.[0]?.meta?.changes ?? 0;
  }

  private async query<T = never>(sql: string, params: unknown[]) {
    const response = await this.request<T>(sql, params);
    return response.result?.[0]?.results ?? [];
  }

  private async request<T>(sql: string, params: unknown[]) {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await response.json()) as D1Result<T>;
    if (!response.ok || !body.success)
      throw new Error(
        body.errors?.map((error) => error.message).join('; ') ||
          `Cloudflare D1 returned HTTP ${response.status}`,
      );
    return body;
  }

  private parseJson(value: string | null) {
    return value === null ? undefined : (JSON.parse(value) as unknown);
  }
}
