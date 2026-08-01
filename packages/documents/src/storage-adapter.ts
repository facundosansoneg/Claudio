/**
 * Interfaz de almacenamiento (ADR 0003). Ningún paquete de dominio debe
 * importar un SDK de storage concreto directamente — siempre pasa por
 * acá, para poder cambiar de proveedor S3-compatible sin tocar lógica de
 * negocio.
 */
export interface StorageAdapter {
  putObject(input: PutObjectInput): Promise<PutObjectResult>;
  /** URL firmada de vida corta (spec, sección 18.1: nunca rutas públicas directas). */
  getSignedDownloadUrl(key: string, expiresInSeconds?: number): Promise<string>;
  deleteObject(key: string): Promise<void>;
}

export interface PutObjectInput {
  key: string;
  body: Uint8Array | Buffer;
  contentType: string;
}

export interface PutObjectResult {
  key: string;
  /** Hash de contenido (sha256) — se persiste en `documents.hash` (spec, sección 7.12). */
  contentHash: string;
}
