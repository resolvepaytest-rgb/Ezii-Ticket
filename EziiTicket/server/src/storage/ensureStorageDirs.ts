import { promises as fs } from "node:fs";
import path from "node:path";

export async function ensureStorageDirs() {
  // We currently prepare for file uploads even if upload endpoints are not wired yet.
  const uploadsDir = path.resolve(process.cwd(), "src", "storage", "uploads");
  await fs.mkdir(uploadsDir, { recursive: true });
}

