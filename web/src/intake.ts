interface InspectionEvents {
  start(label: string): void;
  complete(files: File[], current: () => boolean): void | Promise<void>;
  error(label: string, error: unknown): void;
}

/** One error boundary and identity cover traversal, payload reads, and rendering. */
export class Inspection {
  private version = 0;
  private events: InspectionEvents;
  constructor(events: InspectionEvents) { this.events = events; }
  cancel(): void { this.version++; }
  async run(label: string, read: (current: () => boolean) => Promise<File[]>): Promise<void> {
    const version = ++this.version;
    const current = () => version === this.version;
    this.events.start(label);
    try {
      const files = await read(current);
      if (current()) await this.events.complete(files, current);
    } catch (error) {
      if (current()) this.events.error(label, error);
    }
  }
}

/** File picker paths always include the selected root; strip it exactly once. */
export function selectedPath(file: File): string {
  return file.webkitRelativePath ? file.webkitRelativePath.split("/").slice(1).join("/") : file.name;
}

export async function readDrop(dataTransfer: DataTransfer | null, current: () => boolean): Promise<File[]> {
  if (!dataTransfer) return [];
  const entries = [...dataTransfer.items].map(item => item.webkitGetAsEntry?.()).filter((entry): entry is FileSystemEntry => entry != null);
  if (!entries.length) return [...dataTransfer.files];
  const files: File[] = [];
  // A single dropped directory is the selected root. Multiple entries retain their names.
  const rootDirectory = entries.length === 1 && entries[0]!.isDirectory;
  for (const entry of entries) {
    if (!current()) break;
    await readEntry(entry, rootDirectory ? "" : "selection/", files, current);
  }
  return files;
}

async function readEntry(entry: FileSystemEntry, parent: string, files: File[], current: () => boolean): Promise<void> {
  if (!current() || entry.name.startsWith(".")) return;
  if (entry.isFile) {
    // Callback bridge retains the app's ES2023 browser support.
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    if (!current()) return;
    Object.defineProperty(file, "webkitRelativePath", { configurable: true, value: `${parent}${file.name}` });
    files.push(file);
    return;
  }
  if (!entry.isDirectory) return;
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  while (current()) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!current() || !batch.length) return;
    for (const child of batch) {
      if (!current()) return;
      await readEntry(child, `${parent}${entry.name}/`, files, current);
    }
  }
}
