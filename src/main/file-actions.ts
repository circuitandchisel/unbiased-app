import { constants, statSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { isAbsolute } from "node:path";

export function localFileForAction(path: unknown): string {
  if (typeof path !== "string" || !isAbsolute(path)) throw new Error("A local file path is required.");
  if (!statSync(path).isFile()) throw new Error("Not a file.");
  return path;
}

export async function saveLocalFileCopy(source: unknown, destination: unknown): Promise<void> {
  const file = localFileForAction(source);
  if (typeof destination !== "string" || !isAbsolute(destination)) {
    throw new Error("A destination is required.");
  }
  await copyFile(file, destination, constants.COPYFILE_EXCL);
}

export function fileActionError(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  if (code === "EEXIST") return "A file with that name already exists. Choose another name.";
  if (code === "ENOENT") return "The file or destination is no longer available.";
  if (code === "EACCES" || code === "EPERM") return "Permission denied for this file or location.";
  if (error instanceof Error && (error.message === "Not a file." || error.message === "A local file path is required.")) {
    return error.message;
  }
  return "Could not complete the file action.";
}
