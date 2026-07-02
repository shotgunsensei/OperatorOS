import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

export interface StorageProvider {
  save(filename: string, buffer: Buffer, tenantId?: string): Promise<string>;
  read(filePath: string): Promise<Buffer>;
  delete(filePath: string): Promise<void>;
}

const BASE_DIR = path.join(process.cwd(), "data", "uploads");

export class LocalStorageProvider implements StorageProvider {
  constructor() {
    if (!fs.existsSync(BASE_DIR)) {
      fs.mkdirSync(BASE_DIR, { recursive: true });
    }
  }

  async save(filename: string, buffer: Buffer, tenantId?: string): Promise<string> {
    const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, "0");

    const dir = tenantId
      ? path.join(BASE_DIR, tenantId, yyyy, mm)
      : BASE_DIR;

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const uniqueName = `${randomUUID()}_${sanitized}`;
    const filePath = path.join(dir, uniqueName);
    await fs.promises.writeFile(filePath, buffer);
    return filePath;
  }

  async read(filePath: string): Promise<Buffer> {
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(BASE_DIR))) {
      const legacyDir = path.resolve(path.join(process.cwd(), "uploads"));
      if (!resolved.startsWith(legacyDir)) {
        throw new Error("Path traversal detected");
      }
    }
    return fs.promises.readFile(resolved);
  }

  async delete(filePath: string): Promise<void> {
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(BASE_DIR))) {
      const legacyDir = path.resolve(path.join(process.cwd(), "uploads"));
      if (!resolved.startsWith(legacyDir)) {
        throw new Error("Path traversal detected");
      }
    }
    try {
      await fs.promises.unlink(resolved);
    } catch (e) {
    }
  }
}

export const fileStorage = new LocalStorageProvider();
