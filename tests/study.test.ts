import { describe, expect, test } from "bun:test";
import { questions, topics } from "../src/questions.ts";
import {
  countConflicts, emptyStudy, isCorrect, mergeBackup, parseBackup,
  serializeBackup, storageKey, StudyStore, withEntry,
} from "../src/study.ts";

const id = "js-event-loop";

describe("backup and local storage", () => {
  test("round-trips drafts, selected options, settings, and progress", () => {
    const draft = "\n同步工作 <A> & <E>\n💡";
    const original = withEntry({ ...emptyStudy(), openAnswers: true }, id, {
      answer: draft, note: "下次補充 queue 的行為", status: "review",
    });
    const data = withEntry(original, "js-promise-batch", { selection: ["c"], checked: true, status: "mastered" });
    expect(parseBackup(serializeBackup(data))).toEqual(data);
  });

  test("preserves complementary drafts and applies the user's choice to actual conflicts", () => {
    const local = withEntry(emptyStudy(), id, { answer: "我的回答", status: "review" });
    const backup = withEntry({ ...emptyStudy(), openAnswers: true }, id, { answer: "另一個回答", note: "補充", status: "mastered" });
    expect(countConflicts(local, backup)).toBe(1);
    expect(mergeBackup(local, backup, "local").entries[id]).toMatchObject({ answer: "我的回答", note: "補充", status: "review" });
    expect(mergeBackup(local, backup, "backup").entries[id]).toMatchObject({ answer: "另一個回答", note: "補充", status: "mastered" });
    expect(mergeBackup(local, backup, "local").openAnswers).toBe(true);
  });

  test("rejects broken, unrelated, unsafe-keyed, and unsupported backups", () => {
    expect(() => parseBackup("{")).toThrow("JSON");
    expect(() => parseBackup('{"version":1}')).toThrow("Interview Path");
    expect(() => parseBackup('{"format":"interview-path","version":2}')).toThrow("備份版本");
    expect(() => parseBackup('{"format":"interview-path","version":1,"data":{"entries":{"__proto__":{}},"openAnswers":false,"lastQuestionId":null}}')).toThrow("題目紀錄");
  });

  test("keeps edits from separate tabs and returns them after reloading", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const first = new StudyStore(storage);
    const second = new StudyStore(storage);
    first.update((data) => withEntry(data, id, { answer: "從第一個分頁儲存" }));
    second.update((data) => withEntry(data, id, { note: "從第二個分頁儲存" }));
    const reopened = new StudyStore(storage);
    expect(reopened.data.entries[id]).toMatchObject({
      answer: "從第一個分頁儲存", note: "從第二個分頁儲存",
    });
  });

  test("keeps editing in memory after a failed write and preserves unknown stored formats", () => {
    const blocked = new StudyStore({
      getItem: () => null,
      setItem: () => { throw new Error("Quota exceeded"); },
    });
    blocked.update((data) => withEntry(data, id, { answer: "需要匯出的回答" }));
    expect(blocked.issue).toBe("write");
    expect(parseBackup(serializeBackup(blocked.data)).entries[id].answer).toBe("需要匯出的回答");

    const outdated = new Map([[storageKey, '{"format":"interview-path","version":2}']]);
    const invalid = new StudyStore({
      getItem: (key) => outdated.get(key) ?? null,
      setItem: (key, value) => { outdated.set(key, value); },
    });
    invalid.update((data) => withEntry(data, id, { note: "新筆記" }));
    expect(invalid.issue).toBe("invalid");
    expect(outdated.get(storageKey)).toContain('"version":2');
    expect(invalid.data.entries[id].note).toBe("新筆記");
  });
});

describe("question bank", () => {
  test("keeps unique question IDs and full content across every topic", () => {
    expect(new Set(questions.map((question) => question.id)).size).toBe(questions.length);
    expect(topics.every((topic) => questions.some((question) => question.topicId === topic.id))).toBe(true);
    expect(questions.filter((question) => question.kind === "short").length).toBeGreaterThan(questions.length / 2);
    for (const question of questions) {
      expect(question.explanation.length).toBeGreaterThan(0);
      expect(question.points.length).toBeGreaterThan(0);
      expect(question.followUp.length).toBeGreaterThan(0);
    }
  });

  test("assembles valid single and multi-select answers and grades exact matches", () => {
    for (const question of questions) {
      if (question.kind === "short") continue;
      const allIds = question.choices.map((choice) => choice.id);
      if (question.kind === "single") expect(question.correct.length).toBe(1);
      else expect(question.correct.length).toBeGreaterThan(1);
      expect(question.correct.every((id) => allIds.includes(id))).toBe(true);
      expect(isCorrect(question, [...question.correct].reverse())).toBe(true);
      expect(isCorrect(question, question.correct.slice(1))).toBe(false);
      expect(isCorrect(question, allIds)).toBe(false);
    }
  });
});
