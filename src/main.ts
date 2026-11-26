import { questionById, questions, topicById, type Question } from "./questions.ts";
import {
  countConflicts, emptyEntry, isCorrect, isStudyStatus, maxBackupBytes, mergeBackup, parseBackup,
  serializeBackup, storageKey, StudyStore, withEntry,
  type DraftField, type StorageIssue, type StudyData,
} from "./study.ts";
import {
  backupDialog, emptyQuestion, footer, header, notes, overview, pageTitles, practiceFrame,
  questionNeighbors, questionPanel, questionQueue, roadmap, writing,
  type Filters, type Page,
} from "./views.ts";

function required<T extends HTMLElement>(selector: string, root: ParentNode = document): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error("Missing element " + selector);
  return element;
}

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const siteHeader = required("#site-header");
const main = required("#workspace");
const dialog = required<HTMLDialogElement>("#backup-dialog");
const store = new StudyStore(browserStorage());

const defaultFilters: Filters = { topic: "all", kind: "all", status: "all", search: "" };
let filters = { ...defaultFilters };
let page: Page = "practice";
let currentQuestion = questionById.get(store.data.lastQuestionId ?? "") ?? questions[0];
let draftField: DraftField = "answer";
let listOpen = false;
let linkIntent: { hash: string; topic: Filters["topic"] | null; field: DraftField } | null = null;

siteHeader.innerHTML = header();
required("#site-footer").innerHTML = footer();
dialog.innerHTML = backupDialog();

const issueMessages: Record<StorageIssue, string> = {
  unavailable: "這個瀏覽器沒開放本機儲存。關閉頁面前，請先匯出目前的回答與筆記。",
  invalid: "瀏覽器內有無法讀取的舊紀錄。請先匯出這次練習的資料。",
  write: "這次的變更沒有寫入瀏覽器。請先到「資料備份」匯出，避免關頁後遺失。",
};

function showStorageStatus(): void {
  const warning = required("#storage-warning", main);
  warning.hidden = store.issue === null;
  warning.textContent = store.issue ? issueMessages[store.issue] : "";
  const saveHint = main.querySelector("#save-hint span");
  if (saveHint) saveHint.textContent = store.issue ? "目前只保留在此頁" : "自動儲存在此瀏覽器";
}

function filteredQuestions(): readonly Question[] {
  const terms = filters.search.normalize("NFKC").toLowerCase().trim().split(/\s+/).filter(Boolean);
  return questions.filter((question) => {
    if (filters.topic !== "all" && question.topicId !== filters.topic) return false;
    if (filters.kind !== "all" && question.kind !== filters.kind) return false;
    if (filters.status !== "all" && (store.data.entries[question.id]?.status ?? "new") !== filters.status) return false;
    if (!terms.length) return true;
    const searchable = [question.title, question.prompt, question.keywords, topicById.get(question.topicId)?.title]
      .join(" ").normalize("NFKC").toLowerCase();
    return terms.every((term) => searchable.includes(term));
  });
}

function refreshQueue(queue: readonly Question[]): void {
  const list = required("#question-list", main);
  const offset = list.scrollTop;
  list.innerHTML = questionQueue(queue, currentQuestion.id, store.data);
  list.scrollTop = offset;
  required("#bank-count", main).textContent = queue.length + " 題";
  required("#overview", main).innerHTML = overview(store.data);
}

function refreshNeighbors(queue: readonly Question[]): void {
  const neighbors = main.querySelector("#neighbors");
  if (!neighbors) return;
  const index = queue.indexOf(currentQuestion);
  if (index >= 0) {
    neighbors.innerHTML = questionNeighbors(queue[index - 1], queue[index + 1]);
    return;
  }
  const position = questions.indexOf(currentQuestion);
  neighbors.innerHTML = questionNeighbors(
    queue.filter((question) => questions.indexOf(question) < position).at(-1),
    queue.find((question) => questions.indexOf(question) > position),
  );
}

function renderQuizFeedback(): void {
  const question = currentQuestion;
  if (question.kind === "short") return;
  const form = main.querySelector<HTMLFormElement>("#quiz");
  if (!form) return;
  const entry = store.data.entries[question.id] ?? emptyEntry;
  const selection = entry.selection.filter((id) => question.choices.some((choice) => choice.id === id));
  const checked = entry.checked && selection.length === entry.selection.length;
  for (const input of form.querySelectorAll<HTMLInputElement>('input[name="choice"]')) {
    const selected = selection.includes(input.value);
    const correct = checked && question.correct.includes(input.value);
    const incorrect = checked && selected && !correct;
    const label = input.closest("label");
    input.checked = selected;
    label?.classList.toggle("is-selected", selected);
    label?.classList.toggle("is-correct", correct);
    label?.classList.toggle("is-incorrect", incorrect);
    const result = label?.querySelector(".option-result");
    if (result) result.textContent = correct ? "正確選項" : (incorrect ? "選錯" : "");
  }
  required<HTMLButtonElement>("#check-answer", form).disabled = selection.length === 0;
  const feedback = required("#quiz-feedback", form);
  const passed = checked && isCorrect(question, selection);
  feedback.className = checked ? (passed ? "feedback-correct" : "feedback-incorrect") : "";
  feedback.textContent = checked ? (passed ? "答對了" : "答案有誤，可以看看標示的正確選項。") : "";
}

function refreshQuestion(queue: readonly Question[]): void {
  required("#active-question", main).innerHTML = queue.length
    ? questionPanel(currentQuestion, store.data, draftField) : emptyQuestion();
  refreshNeighbors(queue);
  renderQuizFeedback();
  showStorageStatus();
}

function renderPage(): void {
  for (const link of siteHeader.querySelectorAll<HTMLElement>("[data-page]")) {
    if (link.dataset.page === page) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  document.title = page === "practice" ? "Interview Path｜工程師面試題庫" : pageTitles[page] + "｜Interview Path";

  const content = page === "practice" ? practiceFrame(filters, listOpen)
    : page === "roadmap" ? roadmap(store.data) : notes(store.data);
  main.innerHTML = '<p id="storage-warning" class="storage-warning" role="status" hidden></p>' + content;
  if (page === "practice") {
    const queue = filteredQuestions();
    refreshQueue(queue);
    refreshQuestion(queue);
  }
  showStorageStatus();
}

function setCurrent(question: Question): void {
  if (currentQuestion !== question) draftField = "answer";
  currentQuestion = question;
  if (store.data.lastQuestionId !== question.id) {
    store.update((data) => ({ ...data, lastQuestionId: question.id }));
  }
}

function showList(open: boolean): void {
  listOpen = open;
  const content = main.querySelector<HTMLElement>("#bank-content");
  if (!content) return;
  content.dataset.open = String(open);
  required("#toggle-bank", main).setAttribute("aria-expanded", String(open));
  required("#toggle-bank-label", main).textContent = open ? "收合" : "瀏覽題目";
}

function focusQuestion(): void {
  const title = main.querySelector<HTMLElement>("#question-title");
  if (!title) return;
  title.focus({ preventScroll: true });
  const bounds = title.getBoundingClientRect();
  if (bounds.top < 104 || bounds.bottom > window.innerHeight - 130) {
    title.scrollIntoView({ block: "start" });
  }
}

function handleRoute(initial = false): void {
  const hash = location.hash;
  if (!initial && hash === "#workspace") return;
  const intent = linkIntent?.hash === hash ? linkIntent : null;
  linkIntent = null;
  const previousPage = page;
  page = hash === "#roadmap" ? "roadmap" : hash === "#notes" ? "notes" : "practice";
  const question = hash.startsWith("#q/") ? questionById.get(hash.slice(3)) : undefined;
  let filtersChanged = false;
  if (question) {
    if (intent?.topic && filters.topic !== intent.topic) {
      filters = { ...defaultFilters, topic: intent.topic };
      filtersChanged = true;
    } else if (!filteredQuestions().includes(question)) {
      filters = { ...defaultFilters };
      filtersChanged = true;
    }
    setCurrent(question);
    if (intent) draftField = intent.field;
    showList(false);
  } else if (page === "practice" && previousPage !== "practice") {
    const [first] = filteredQuestions();
    if (first && !filteredQuestions().includes(currentQuestion)) setCurrent(first);
  }

  if (initial || previousPage !== "practice" || page !== "practice" || filtersChanged) {
    renderPage();
  } else {
    const queue = filteredQuestions();
    refreshQueue(queue);
    refreshQuestion(queue);
  }
  if (intent && page === "practice") focusQuestion();
  if (!initial && !intent && previousPage !== page) window.scrollTo(0, 0);
}

function applyFilters(): void {
  const queue = filteredQuestions();
  const hadQuestion = Boolean(main.querySelector("#question-title"));
  const previous = currentQuestion;
  if (queue.length && !queue.includes(currentQuestion)) {
    setCurrent(queue[0]);
    history.replaceState(null, "", "#q/" + currentQuestion.id);
  }
  refreshQueue(queue);
  if (previous !== currentQuestion || hadQuestion !== Boolean(queue.length)) refreshQuestion(queue);
  else refreshNeighbors(queue);
}

function refreshStatusButtons(): void {
  const status = store.data.entries[currentQuestion.id]?.status ?? "new";
  for (const button of main.querySelectorAll<HTMLElement>("[data-status]")) {
    button.setAttribute("aria-pressed", String(button.dataset.status === status));
  }
}

main.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const questionLink = event.target.closest<HTMLAnchorElement>("a[data-question-link]");
  if (questionLink && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
    const topicId = questionLink.dataset.startTopic;
    linkIntent = {
      hash: questionLink.hash,
      topic: topicById.get(topicId ?? "")?.id ?? null,
      field: questionLink.dataset.openDraft === "note" ? "note" : "answer",
    };
    if (questionLink.hash === location.hash) {
      event.preventDefault();
      handleRoute();
    }
    return;
  }
  const button = event.target.closest("button");
  if (!button) return;
  const { topic, status, draftTab } = button.dataset;
  if (button.id === "toggle-bank") {
    showList(!listOpen);
  } else if (button.id === "reset-filters") {
    filters = { ...defaultFilters };
    renderPage();
    focusQuestion();
  } else if (topic === "all" || topicById.has(topic ?? "")) {
    filters.topic = topicById.get(topic ?? "")?.id ?? "all";
    for (const filter of main.querySelectorAll<HTMLElement>("[data-topic]")) {
      filter.setAttribute("aria-pressed", String(filter.dataset.topic === filters.topic));
    }
    applyFilters();
  } else if (isStudyStatus(status)) {
    store.update((data) => withEntry(data, currentQuestion.id, { status }));
    const queue = filteredQuestions();
    refreshQueue(queue);
    refreshStatusButtons();
    refreshNeighbors(queue);
    showStorageStatus();
  } else if ((draftTab === "answer" || draftTab === "note") && draftTab !== draftField) {
    draftField = draftTab;
    required("#writing-area", main).innerHTML = writing(store.data.entries[currentQuestion.id] ?? emptyEntry, draftField);
    required("#draft-text", main).focus({ preventScroll: true });
    showStorageStatus();
  }
});

main.addEventListener("input", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.id === "search-questions") {
    filters.search = target.value;
    applyFilters();
  } else if (target instanceof HTMLTextAreaElement && target.id === "draft-text") {
    store.update((data) => withEntry(data, currentQuestion.id, { [draftField]: target.value }));
    showStorageStatus();
  }
});

main.addEventListener("change", (event) => {
  const target = event.target;
  if (target instanceof HTMLSelectElement) {
    const value = target.value;
    if (target.id === "kind-filter" && (value === "all" || value === "short" || value === "single" || value === "multiple")) {
      filters.kind = value;
      applyFilters();
    } else if (target.id === "status-filter" && (value === "all" || isStudyStatus(value))) {
      filters.status = value;
      applyFilters();
    }
    return;
  }
  if (!(target instanceof HTMLInputElement)) return;
  if (target.id === "default-answer") {
    store.update((data) => ({ ...data, openAnswers: target.checked }));
    required<HTMLDetailsElement>("#reference-answer", main).open = target.checked;
    showStorageStatus();
  } else if (target.name === "choice") {
    const selection = Array.from(main.querySelectorAll<HTMLInputElement>('#quiz input[name="choice"]:checked'), (input) => input.value);
    store.update((data) => withEntry(data, currentQuestion.id, { selection, checked: false }));
    renderQuizFeedback();
    showStorageStatus();
  }
});

main.addEventListener("submit", (event) => {
  if (!(event.target instanceof HTMLFormElement) || event.target.id !== "quiz") return;
  event.preventDefault();
  if (!store.data.entries[currentQuestion.id]?.selection.length) return;
  store.update((data) => {
    if (!data.entries[currentQuestion.id]?.selection.length) return data;
    return withEntry(data, currentQuestion.id, { checked: true });
  });
  renderQuizFeedback();
  showStorageStatus();
});

const filePicker = required<HTMLInputElement>("#backup-file", dialog);
const confirmation = required<HTMLFormElement>("#import-confirmation", dialog);
const feedback = required("#backup-feedback", dialog);
let importSequence = 0;
let pendingBackup: StudyData | null = null;

function resetImport(): void {
  importSequence++;
  pendingBackup = null;
  filePicker.value = "";
  confirmation.hidden = true;
  confirmation.reset();
  feedback.textContent = "";
  feedback.classList.remove("feedback-incorrect");
}

required("#open-backup", siteHeader).addEventListener("click", () => dialog.showModal());
required("#close-backup", dialog).addEventListener("click", () => dialog.close());
dialog.addEventListener("close", resetImport);
required("#select-backup", dialog).addEventListener("click", () => filePicker.click());

required("#export-backup", dialog).addEventListener("click", () => {
  store.sync();
  const url = URL.createObjectURL(new Blob([serializeBackup(store.data)], { type: "application/json;charset=utf-8" }));
  const download = document.createElement("a");
  download.href = url;
  download.download = "interview-path-" + new Date().toISOString().slice(0, 10) + ".json";
  document.body.append(download);
  download.click();
  download.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5_000);
  feedback.classList.remove("feedback-incorrect");
  feedback.textContent = "已產生 JSON 備份檔。";
});

filePicker.addEventListener("change", async () => {
  const file = filePicker.files?.[0];
  if (!file) return;
  resetImport();
  const sequence = importSequence;
  try {
    if (file.size > maxBackupBytes) throw new Error("檔案大於 10 MB，請選擇較小的備份檔。");
    const backup = parseBackup(await file.text());
    if (sequence !== importSequence) return;
    pendingBackup = backup;
    store.sync();
    const conflicts = countConflicts(store.data, backup);
    required("#import-summary", dialog).textContent = "備份含 " + Object.keys(backup.entries).length
      + " 題紀錄。" + (conflicts ? " 其中 " + conflicts + " 題有不同的內容。" : "")
      + " 匯入會合併紀錄並套用備份的解答顯示設定。";
    required("#import-conflicts", dialog).hidden = conflicts === 0;
    confirmation.hidden = false;
  } catch (error) {
    if (sequence !== importSequence) return;
    feedback.classList.add("feedback-incorrect");
    feedback.textContent = error instanceof Error ? error.message : "讀不到備份檔案。";
  }
});

confirmation.addEventListener("submit", (event) => {
  event.preventDefault();
  const backup = pendingBackup;
  if (!backup) return;
  const choice = new FormData(confirmation).get("conflict") === "backup" ? "backup" : "local";
  const before = countConflicts(store.data, backup);
  store.sync();
  const conflicts = countConflicts(store.data, backup);
  if (conflicts > before && required("#import-conflicts", dialog).hidden) {
    required("#import-summary", dialog).textContent = "剛收到其他分頁的變更，有 " + conflicts + " 題的欄位需要選擇。";
    required("#import-conflicts", dialog).hidden = false;
    return;
  }
  store.update((data) => mergeBackup(data, backup, choice));
  const resumedQuestion = questionById.get(store.data.lastQuestionId ?? "");
  if (resumedQuestion) {
    currentQuestion = resumedQuestion;
    draftField = "answer";
    if (!filteredQuestions().includes(currentQuestion)) filters = { ...defaultFilters };
    if (page === "practice") history.replaceState(null, "", "#q/" + currentQuestion.id);
  }
  resetImport();
  feedback.classList.toggle("feedback-incorrect", store.issue !== null);
  feedback.textContent = store.issue ? "已匯入到此頁。瀏覽器未能儲存，請先匯出備份。" : "已匯入並合併備份。";
  renderPage();
});

window.addEventListener("storage", (event) => {
  if (event.key !== null && event.key !== storageKey) return;
  const previousPreference = store.data.openAnswers;
  if (!store.sync()) {
    showStorageStatus();
    return;
  }
  if (page !== "practice") {
    renderPage();
    return;
  }
  const queue = filteredQuestions();
  refreshQueue(queue);
  if (!main.querySelector("#question-title")) {
    if (queue.length && !queue.includes(currentQuestion)) currentQuestion = queue[0];
    refreshQuestion(queue);
    return;
  }
  refreshStatusButtons();
  refreshNeighbors(queue);
  renderQuizFeedback();
  const draft = main.querySelector<HTMLTextAreaElement>("#draft-text");
  if (draft && draft !== document.activeElement) {
    draft.value = (store.data.entries[currentQuestion.id] ?? emptyEntry)[draftField];
  }
  if (previousPreference !== store.data.openAnswers) {
    required<HTMLInputElement>("#default-answer", main).checked = store.data.openAnswers;
    required<HTMLDetailsElement>("#reference-answer", main).open = store.data.openAnswers;
  }
  showStorageStatus();
});

window.addEventListener("hashchange", () => handleRoute());
handleRoute(true);
