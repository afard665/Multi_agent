import fs from "fs";
import path from "path";

export async function atomicWrite(filePath: string, data: string | Buffer): Promise<void> {
  const dir = path.dirname(filePath);
  const tempPath = path.join(dir, `.tmp-${Date.now()}-${Math.random()}`);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(tempPath, data);
  await fs.promises.rename(tempPath, filePath);
}
