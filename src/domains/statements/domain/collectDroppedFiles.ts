/** Flatten a file-picker drop that may include folders. */

async function readAllEntries(
  reader: FileSystemDirectoryReader,
): Promise<FileSystemEntry[]> {
  const all: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (batch.length === 0) break;
    all.push(...batch);
  }
  return all;
}

async function collectEntry(entry: FileSystemEntry, into: File[]) {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      (entry as FileSystemFileEntry).file(resolve, reject);
    });
    into.push(file);
    return;
  }
  if (!entry.isDirectory) return;
  const children = await readAllEntries(
    (entry as FileSystemDirectoryEntry).createReader(),
  );
  for (const child of children) {
    await collectEntry(child, into);
  }
}

export async function filesFromDataTransfer(
  data: DataTransfer,
): Promise<File[]> {
  const items = [...data.items].filter((item) => item.kind === "file");
  const hasFolder = items.some((item) => {
    const entry = item.webkitGetAsEntry?.();
    return Boolean(entry?.isDirectory);
  });
  if (!hasFolder) return [...data.files];

  const files: File[] = [];
  for (const item of items) {
    const entry = item.webkitGetAsEntry?.();
    if (!entry) {
      const file = item.getAsFile();
      if (file) files.push(file);
      continue;
    }
    await collectEntry(entry, files);
  }
  return files;
}
