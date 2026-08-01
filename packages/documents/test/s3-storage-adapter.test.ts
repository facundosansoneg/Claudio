import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// s3rver no publica tipos; se tipa mínimamente acá.
// eslint-disable-next-line @typescript-eslint/no-var-requires
import S3rver from "s3rver";
import { S3StorageAdapter } from "../src/s3-storage-adapter";

const PORT = 14569;
const BUCKET = "farfalla-documents-test";
let server: InstanceType<typeof S3rver>;
let dataDir: string;
let adapter: S3StorageAdapter;

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "farfalla-s3rver-"));
  server = new S3rver({
    port: PORT,
    address: "localhost",
    silent: true,
    directory: dataDir,
    configureBuckets: [{ name: BUCKET }],
  });
  await new Promise<void>((resolve, reject) => {
    server.run((err: unknown) => (err ? reject(err) : resolve()));
  });

  adapter = new S3StorageAdapter({
    endpoint: `http://localhost:${PORT}`,
    region: "us-east-1",
    bucket: BUCKET,
    accessKeyId: "S3RVER",
    secretAccessKey: "S3RVER",
    forcePathStyle: true,
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err: unknown) => (err ? reject(err) : resolve()));
  });
  rmSync(dataDir, { recursive: true, force: true });
});

describe("S3StorageAdapter (contra s3rver, sin Docker)", () => {
  it("sube un objeto, calcula su hash, y permite descargarlo vía URL firmada", async () => {
    const body = Buffer.from("contrato de prueba en PDF (contenido simulado)");
    const expectedHash = createHash("sha256").update(body).digest("hex");

    const result = await adapter.putObject({
      key: "leases/lease-123/contract-v1.pdf",
      body,
      contentType: "application/pdf",
    });

    expect(result.key).toBe("leases/lease-123/contract-v1.pdf");
    expect(result.contentHash).toBe(expectedHash);

    const url = await adapter.getSignedDownloadUrl(result.key, 60);
    expect(url).toContain("leases/lease-123/contract-v1.pdf");
    expect(url).toContain("X-Amz-Signature");

    const response = await fetch(url);
    expect(response.status).toBe(200);
    const downloaded = Buffer.from(await response.arrayBuffer());
    expect(downloaded.equals(body)).toBe(true);
  });

  it("elimina un objeto", async () => {
    await adapter.putObject({
      key: "tmp/to-delete.txt",
      body: Buffer.from("borrame"),
      contentType: "text/plain",
    });

    await adapter.deleteObject("tmp/to-delete.txt");

    const url = await adapter.getSignedDownloadUrl("tmp/to-delete.txt", 60);
    const response = await fetch(url);
    expect(response.status).toBe(404);
  });
});
