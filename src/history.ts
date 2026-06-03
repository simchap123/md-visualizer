// Local-only markdown history, persisted in the browser's localStorage.
// Nothing leaves the device — entries store the file's name, size, contents
// and when it was last opened, so any past doc can be reopened instantly.

export type HistoryEntry = {
  id: string;
  name: string;
  size: number;
  content: string;
  savedAt: number;
};

const KEY = "md-visualizer-history";
const MAX_ENTRIES = 60;

function makeId(name: string, content: string): string {
  // Stable id from name + length + a cheap content hash, so reopening the
  // same file updates its entry instead of creating duplicates.
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = (hash * 31 + content.charCodeAt(i)) | 0;
  }
  return `${name}:${content.length}:${hash}`;
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(entries: HistoryEntry[]): HistoryEntry[] {
  const trimmed = entries.slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    // Likely quota exceeded — drop the oldest half and retry once.
    const half = trimmed.slice(0, Math.ceil(trimmed.length / 2));
    try {
      localStorage.setItem(KEY, JSON.stringify(half));
      return half;
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

export function addEntry(
  name: string,
  size: number,
  content: string
): { id: string; history: HistoryEntry[] } {
  const id = makeId(name, content);
  const existing = loadHistory().filter((e) => e.id !== id);
  const entry: HistoryEntry = { id, name, size, content, savedAt: Date.now() };
  const history = persist([entry, ...existing]);
  return { id, history };
}

export function removeEntry(id: string): HistoryEntry[] {
  return persist(loadHistory().filter((e) => e.id !== id));
}

export function clearHistory(): HistoryEntry[] {
  return persist([]);
}
