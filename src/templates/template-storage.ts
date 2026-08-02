import { createReadStream, promises as fs } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');
export type StoredObject = {
  stream: Readable;
  size?: number;
  contentType?: string;
  etag?: string;
};
export interface ObjectStorageService {
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  streamObject(key: string): Promise<StoredObject>;
  deleteObject(key: string): Promise<void>;
  objectExists(key: string): Promise<boolean>;
  createSignedDownloadUrl(key: string, expiresIn?: number): Promise<string>;
}

@Injectable()
export class LocalTemplateStorage implements ObjectStorageService {
  private readonly root: string;
  constructor(private readonly config: ConfigService) {
    this.root = resolve(
      config.get('TEMPLATE_STORAGE_LOCAL_PATH', '.data/templates'),
    );
  }
  private path(key: string) {
    if (!/^[a-zA-Z0-9/_.-]+$/.test(key) || key.includes('..'))
      throw new Error('Unsafe storage key');
    const path = resolve(this.root, key);
    if (path !== this.root && !path.startsWith(this.root + sep))
      throw new Error('Unsafe storage key');
    return path;
  }
  async putObject(key: string, body: Buffer) {
    const path = this.path(key);
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, body, { flag: 'wx' });
  }
  async streamObject(key: string) {
    const path = this.path(key);
    const stat = await fs.stat(path);
    return { stream: createReadStream(path), size: stat.size };
  }
  async deleteObject(key: string) {
    await fs.rm(this.path(key), { force: true });
  }
  async objectExists(key: string) {
    try {
      await fs.access(this.path(key));
      return true;
    } catch {
      return false;
    }
  }
  createSignedDownloadUrl(key: string) {
    return Promise.resolve(
      `${this.config.get('TEMPLATE_STORAGE_PUBLIC_BASE_URL', '')}/${encodeURIComponent(key)}`,
    );
  }
}

@Injectable()
export class S3TemplateStorage implements ObjectStorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  constructor(private readonly config: ConfigService) {
    this.bucket = config.getOrThrow('TEMPLATE_STORAGE_BUCKET');
    this.client = new S3Client({
      region: config.get('TEMPLATE_STORAGE_REGION', 'auto'),
      endpoint: config.get('TEMPLATE_STORAGE_ENDPOINT'),
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.getOrThrow('TEMPLATE_STORAGE_ACCESS_KEY'),
        secretAccessKey: config.getOrThrow('TEMPLATE_STORAGE_SECRET_KEY'),
      },
    });
  }
  async putObject(Key: string, Body: Buffer, ContentType: string) {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key, Body, ContentType }),
    );
  }
  async streamObject(Key: string) {
    const out = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key }),
    );
    return {
      stream: out.Body as Readable,
      size: out.ContentLength,
      contentType: out.ContentType,
      etag: out.ETag,
    };
  }
  async deleteObject(Key: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key }),
    );
  }
  async objectExists(Key: string) {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key }),
      );
      return true;
    } catch {
      return false;
    }
  }
  createSignedDownloadUrl(Key: string, expiresIn = 300) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key }),
      { expiresIn },
    );
  }
}
