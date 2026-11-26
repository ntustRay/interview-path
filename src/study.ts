import type { ChoiceQuestion } from "./questions.ts";

export const storageKey = "interview-path:study:v1";
export const maxDraftLength = 12_000;
export const maxBackupBytes = 10 * 1024 * 1024;
const version = 1;
const format = "interview-path";
const questionIdPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/;

export const statusLabels = {
  new: "未開始",
  review: "待複習",
  mastered: "已練熟",
} as const;

export type StudyStatus = keyof typeof statusLabels;
export type DraftField = "answer" | "note";
export type ConflictChoice = "local" | "backup";
export type StudyEntry = {
  answer: string;
  note: string;
  status: StudyStatus;
  selection: string[];
  checked: boolean;
  updatedAt: string;
};
export type StudyData = {
  entries: Record<string, StudyEntry>;
  openAnswers: boolean;
  lastQuestionId: string | null;
};

export const emptyEntry: Readonly<StudyEntry> = {
  answer: "",
  note: "",
  status: "new",
  selection: [],
  checked: false,
  updatedAt: "",
};

export function emptyStudy(): StudyData {
  return { entries: {}, openAnswers: false, lastQuestionId: null };
}

export function hasDraft(entry: StudyEntry): boolean {
  return Boolean(entry.answer.trim() || entry.note.trim());
}

export function withEntry(
  data: StudyData,
  id: string,
  patch: Partial<Omit<StudyEntry, "updatedAt">>,
): StudyData {
  const entry = { ...(data.entries[id] ?? emptyEntry), ...patch, updatedAt: new Date().toISOString() };
  const entries = { ...data.entries, [id]: entry };
  if (!entry.answer && !entry.note && entry.status === "new" && !entry.selection.length && !entry.checked) {
    delete entries[id];
  }
  return { ...data, entries, lastQuestionId: id };
}

export function isCorrect(question: ChoiceQuestion, selection: readonly string[]): boolean {
  return selection.length === question.correct.length && question.correct.every((id) => selection.includes(id));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isQuestionId(value: unknown): value is string {
  return typeof value === "string" && value.length <= 100 && questionIdPattern.test(value);
}

function isDraft(value: unknown): value is string {
  return typeof value === "string" && value.length <= maxDraftLength;
}

export function isStudyStatus(value: unknown): value is StudyStatus {
  return value === "new" || value === "review" || value === "mastered";
}

function isSelection(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 20
    && value.every((id) => typeof id === "string" && /^[a-z0-9-]{1,30}$/.test(id))
    && new Set(value).size === value.length;
}

function parseEntry(value: unknown): StudyEntry | null {
  if (!isRecord(value)) return null;
  const { answer, note, status, selection, checked, updatedAt } = value;
  if (
    !isDraft(answer) || !isDraft(note) || !isStudyStatus(status) || !isSelection(selection)
    || typeof checked !== "boolean" || (checked && selection.length === 0)
    || typeof updatedAt !== "string" || updatedAt.length > 30 || Number.isNaN(Date.parse(updatedAt))
  ) return null;
  return { answer, note, status, selection, checked, updatedAt };
}

export function parseBackup(text: string): StudyData {
  let backup: unknown;
  try {
    backup = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("這個檔案不是有效的 JSON。請選擇 Interview Path 匯出的備份。");
  }
  if (!isRecord(backup) || backup.format !== format) {
    throw new Error("這個檔案不是 Interview Path 的備份。");
  }
  if (backup.version !== version) {
    throw new Error("目前無法讀取這個備份版本。");
  }
  const data = backup.data;
  if (!isRecord(data) || !isRecord(data.entries) || typeof data.openAnswers !== "boolean"
    || (data.lastQuestionId !== null && !isQuestionId(data.lastQuestionId))) {
    throw new Error("備份內的設定或題目資料格式有誤。");
  }
  const entries: Record<string, StudyEntry> = {};
  for (const [id, rawEntry] of Object.entries(data.entries)) {
    const entry = parseEntry(rawEntry);
    if (!isQuestionId(id) || !entry) {
      throw new Error("備份中有格式不符的題目紀錄。");
    }
    entries[id] = entry;
  }
  return { entries, openAnswers: data.openAnswers, lastQuestionId: data.lastQuestionId };
}

export function serializeBackup(data: StudyData): string {
  return JSON.stringify({ format, version, data });
}

function sameSelection(left: StudyEntry, right: StudyEntry): boolean {
  return left.checked === right.checked && left.selection.length === right.selection.length
    && left.selection.every((id) => right.selection.includes(id));
}

export function countConflicts(local: StudyData, backup: StudyData): number {
  return Object.entries(backup.entries).filter(([id, incoming]) => {
    const current = local.entries[id];
    return current && (
      (current.answer && incoming.answer && current.answer !== incoming.answer)
      || (current.note && incoming.note && current.note !== incoming.note)
      || (current.status !== "new" && incoming.status !== "new" && current.status !== incoming.status)
      || (current.selection.length && incoming.selection.length && !sameSelection(current, incoming))
    );
  }).length;
}

export function mergeBackup(local: StudyData, backup: StudyData, choice: ConflictChoice): StudyData {
  const entries = { ...local.entries };
  for (const [id, incoming] of Object.entries(backup.entries)) {
    const current = entries[id];
    if (!current) {
      entries[id] = incoming;
      continue;
    }
    const [preferred, other] = choice === "backup" ? [incoming, current] : [current, incoming];
    const choiceEntry = preferred.selection.length ? preferred : other;
    entries[id] = {
      answer: preferred.answer || other.answer,
      note: preferred.note || other.note,
      status: preferred.status === "new" ? other.status : preferred.status,
      selection: choiceEntry.selection,
      checked: choiceEntry.checked,
      updatedAt: Date.parse(current.updatedAt) > Date.parse(incoming.updatedAt)
        ? current.updatedAt : incoming.updatedAt,
    };
  }
  return {
    entries,
    openAnswers: backup.openAnswers,
    lastQuestionId: backup.lastQuestionId ?? local.lastQuestionId,
  };
}

export type StorageIssue = "unavailable" | "invalid" | "write";

export class StudyStore {
  data = emptyStudy();
  issue: StorageIssue | null = null;
  private raw: string | null = null;

  constructor(private readonly storage: Pick<Storage, "getItem" | "setItem"> | null) {
    this.sync();
  }

  sync(): boolean {
    if (!this.storage) {
      this.issue = "unavailable";
      return false;
    }
    // An unsuccessful write leaves the newest edits in memory.
    if (this.issue === "write") return false;
    let raw: string | null;
    try {
      raw = this.storage.getItem(storageKey);
    } catch {
      this.issue = "unavailable";
      return false;
    }
    if (raw === this.raw && this.issue === null) return false;
    try {
      this.data = raw === null ? emptyStudy() : parseBackup(raw);
      this.raw = raw;
      this.issue = null;
      return true;
    } catch {
      this.issue = "invalid";
      return false;
    }
  }

  update(change: (current: StudyData) => StudyData): void {
    this.sync();
    this.data = change(this.data);
    if (!this.storage || this.issue === "invalid") return;
    try {
      const raw = serializeBackup(this.data);
      this.storage.setItem(storageKey, raw);
      this.raw = raw;
      this.issue = null;
    } catch {
      this.issue = "write";
    }
  }
}
