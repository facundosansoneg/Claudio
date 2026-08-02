import { createHash } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { PutObjectInput, PutObjectResult, StorageAdapter } from "./storage-adapter";

export interface S3StorageAdapterConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** true para MinIO/S3 compatibles que exigen path-style (ADR 0003). */
  forcePathStyle: boolean;
}

export class S3StorageAdapter implements StorageAdapter {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3StorageAdapterConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    const contentHash = createHash("sha256").update(input.body).digest("hex");
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
      }),
    );
    return { key: input.key, contentHash };
  }

  async getSignedDownloadUrl(key: string, expiresInSeconds = 300): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

export function s3ConfigFromEnv(env: NodeJS.ProcessEnv): S3StorageAdapterConfig {
  const required = (name: string): string => {
    const value = env[name];
    if (!value) throw new Error(`Falta la variable de entorno ${name}`);
    return value;
  };
  return {
    endpoint: required("STORAGE_ENDPOINT"),
    region: env.STORAGE_REGION ?? "us-east-1",
    bucket: required("STORAGE_BUCKET"),
    accessKeyId: required("STORAGE_ACCESS_KEY_ID"),
    secretAccessKey: required("STORAGE_SECRET_ACCESS_KEY"),
    forcePathStyle: env.STORAGE_FORCE_PATH_STYLE !== "false",
  };
}
