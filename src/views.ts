import { icon } from "./icons.ts";
import {
  difficultyLabels, kindLabels, questions, topicById, topics,
  type Question, type QuestionKind, type TopicId,
} from "./questions.ts";
import {
  emptyEntry, hasDraft, maxDraftLength, statusLabels,
  type DraftField, type StudyData, type StudyEntry, type StudyStatus,
} from "./study.ts";

export type Page = "practice" | "roadmap" | "notes";
export type Filters = {
  topic: TopicId | "all";
  kind: QuestionKind | "all";
  status: StudyStatus | "all";
  search: string;
};

const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => entities[character]);
}

export const pageTitles: Record<Page, string> = {
  practice: "題庫練習",
  roadmap: "練習路線",
  notes: "我的筆記",
};

const navIcons = { practice: "book", roadmap: "route", notes: "notebook" } as const;
export function header(): string {
  return '<div class="header-inner shell">'
    + '<a class="brand" href="#practice"><span class="brand-icon">' + icon("brand") + '</span><span>Interview Path</span></a>'
    + '<nav class="main-nav" aria-label="主要導覽">'
    + (["practice", "roadmap", "notes"] as const).map((page) =>
      '<a href="#' + page + '" data-page="' + page + '">' + icon(navIcons[page]) + '<span>' + pageTitles[page] + '</span></a>',
    ).join("")
    + '</nav><button class="button button-outline backup-button" type="button" id="open-backup">'
    + icon("archive") + '<span>資料備份</span></button></div>';
}

export function progress(data: StudyData, scope: readonly Question[] = questions) {
  const progress = { new: 0, review: 0, mastered: 0 };
  for (const question of scope) progress[data.entries[question.id]?.status ?? "new"]++;
  return progress;
}

export function overview(data: StudyData): string {
  const counts = progress(data);
  const percent = Math.round(counts.mastered / questions.length * 100);
  return '<div class="overview-progress-top"><span>整體進度</span><span>' + percent + '%</span></div>'
    + '<progress aria-label="題庫練熟進度" value="' + counts.mastered + '" max="' + questions.length + '"></progress>'
    + '<div class="overview-progress-bottom"><span><strong>' + counts.mastered + '</strong> / ' + questions.length
    + ' 題已練熟</span><span>' + counts.review + ' 題待複習</span></div>';
}

function topicButtons(selected: Filters["topic"]): string {
  return '<button type="button" class="topic-button" data-topic="all" aria-pressed="' + (selected === "all") + '">'
    + icon("grid") + '全部主題</button>'
    + topics.map((topic) => '<button type="button" class="topic-button" data-topic="' + topic.id
      + '" aria-pressed="' + (selected === topic.id) + '">' + icon(topic.icon) + escapeHtml(topic.title) + '</button>').join("");
}

function selectOptions<T extends string>(values: Record<T, string>, allLabel: string, selected: T | "all"): string {
  return '<option value="all">' + allLabel + '</option>'
    + Object.entries(values).map(([value, label]) =>
      '<option value="' + value + '"' + (selected === value ? ' selected' : '') + '>' + label + '</option>',
    ).join("");
}

export function practiceFrame(filters: Filters, listOpen: boolean): string {
  return '<section class="cover" aria-labelledby="practice-title">'
    + '<div class="cover-heading"><div class="cover-meta"><span>' + questions.length + ' 道面試題</span>'
    + '<span>' + topics.length + ' 個主題</span></div>'
    + '<h1 id="practice-title">全端工程師面試題庫</h1>'
    + '<p>先寫自己的回答，再看詳解、對照答題重點。</p></div>'
    + '<div class="overview" id="overview"></div></section>'
    + '<section class="topic-bar" aria-label="依主題篩選">' + topicButtons(filters.topic) + '</section>'
    + '<div class="practice-layout"><aside class="bank panel" aria-labelledby="bank-title">'
    + '<div class="bank-heading"><h2 id="bank-title">題目列表</h2><span class="count" id="bank-count"></span>'
    + '<button type="button" class="mobile-bank-toggle button" id="toggle-bank" aria-label="切換題目列表" aria-controls="bank-content" aria-expanded="'
    + listOpen + '"><span id="toggle-bank-label">' + (listOpen ? '收合' : '瀏覽題目') + '</span>' + icon("chevronDown") + '</button></div>'
    + '<div class="bank-content" id="bank-content" data-open="' + listOpen + '">'
    + '<div class="filters"><label class="search-field">' + icon("search")
    + '<input id="search-questions" type="search" aria-label="搜尋題目" placeholder="搜尋題目或技術關鍵字" value="'
    + escapeHtml(filters.search) + '" autocomplete="off" /></label>'
    + '<div class="select-row"><label class="select-field"><select id="kind-filter" aria-label="題型">'
    + selectOptions(kindLabels, "所有題型", filters.kind) + '</select>' + icon("chevronDown") + '</label>'
    + '<label class="select-field"><select id="status-filter" aria-label="練習狀態">'
    + selectOptions(statusLabels, "所有狀態", filters.status) + '</select>' + icon("chevronDown") + '</label></div></div>'
    + '<div id="question-list" class="question-list"></div></div></aside>'
    + '<section id="active-question" class="question panel" aria-label="目前題目"></section></div>';
}

export function questionQueue(queue: readonly Question[], currentId: string, data: StudyData): string {
  if (!queue.length) return '<p class="queue-empty">找不到符合條件的題目。</p>';
  return '<ol class="queue">' + queue.map((question) => {
    const status = data.entries[question.id]?.status ?? "new";
    const active = question.id === currentId ? ' aria-current="true"' : "";
    return '<li><a class="queue-link" href="#q/' + question.id + '" data-question-link' + active + '>'
      + '<span class="queue-status status-' + status + '" aria-label="' + statusLabels[status] + '" role="img">'
      + (status === "mastered" ? icon("check") : '') + '</span>'
      + '<span><span class="queue-title">' + escapeHtml(question.title) + '</span><span class="queue-meta">'
      + kindLabels[question.kind] + '<span class="meta-divider"></span>' + difficultyLabels[question.difficulty]
      + (status === "new" ? "" : '<span class="meta-divider"></span>' + statusLabels[status]) + '</span></span></a></li>';
  }).join("") + '</ol>';
}

function quiz(question: Question): string {
  if (question.kind === "short") return "";
  const inputType = question.kind === "single" ? "radio" : "checkbox";
  return '<form class="quiz" id="quiz"><fieldset><legend>'
    + (inputType === "radio" ? "選出最適合的答案" : "選出所有符合的答案") + '</legend>'
    + question.choices.map((choice, index) =>
      '<label class="option"><input name="choice" type="' + inputType + '" value="' + choice.id
      + '"/><span class="option-letter" aria-hidden="true">' + String.fromCharCode(65 + index) + '</span>'
      + '<span class="option-text">' + escapeHtml(choice.text) + '</span><span class="option-result"></span></label>',
    ).join("")
    + '</fieldset><div class="quiz-actions"><button type="submit" class="button button-primary" id="check-answer" disabled>檢查答案</button>'
    + '<span id="quiz-feedback" role="status"></span></div></form>';
}

export function writing(entry: StudyEntry, field: DraftField): string {
  const title = field === "answer" ? "我的回答" : "我的筆記";
  const placeholder = field === "answer" ? "寫下你在面試時會怎麼回答…" : "記下還沒說清楚的地方、例子或下次複習的重點…";
  return '<div class="writing-tabs"><div class="draft-tabs" aria-label="作答與筆記" role="group">'
    + '<button type="button" data-draft-tab="answer" aria-pressed="' + (field === "answer") + '">' + icon("pencil") + '我的回答</button>'
    + '<button type="button" data-draft-tab="note" aria-pressed="' + (field === "note") + '">' + icon("notebook") + '我的筆記</button>'
    + '</div><span class="save-hint" id="save-hint">' + icon("lock") + '<span>自動儲存在此瀏覽器</span></span></div>'
    + '<textarea id="draft-text" autocomplete="off" data-draft-field="' + field + '" aria-label="' + title
    + '" maxlength="' + maxDraftLength + '" placeholder="' + placeholder + '">\n' + escapeHtml(entry[field]) + '</textarea>';
}

export function questionNeighbors(previous: Question | undefined, next: Question | undefined): string {
  const link = (question: Question, label: string, direction: "next" | "previous") =>
    '<a class="button button-outline neighbor" href="#q/' + question.id
    + '" data-question-link aria-label="' + label + '，' + escapeHtml(question.title) + '">'
    + (direction === "previous" ? icon("chevronLeft") : '') + label + (direction === "next" ? icon("chevronRight") : '') + '</a>';
  return (previous ? link(previous, "上一題", "previous") : '') + (next ? link(next, "下一題", "next") : '');
}

function answer(question: Question, open: boolean): string {
  return '<div class="answer-block"><details id="reference-answer"' + (open ? ' open' : '') + '>'
    + '<summary class="answer-summary"><span class="answer-label">' + icon("eye") + '參考解答與追問</span>'
    + icon("chevronDown", "answer-chevron") + '</summary>'
    + '<div class="answer-content">' + question.explanation.map((part) => '<p>' + escapeHtml(part) + '</p>').join("")
    + '<h3>答題重點</h3><ul>' + question.points.map((point) => '<li>' + escapeHtml(point) + '</li>').join("") + '</ul>'
    + '<h3>面試官可能追問</h3><p>' + escapeHtml(question.followUp) + '</p></div></details>'
    + '<label class="answer-preference"><input type="checkbox" id="default-answer"' + (open ? ' checked' : '')
    + '/><span>預設展開</span></label></div>';
}

export function questionPanel(question: Question, data: StudyData, field: DraftField): string {
  const entry = data.entries[question.id] ?? emptyEntry;
  const topic = topicById.get(question.topicId);
  return '<article class="question-article">'
    + '<div class="question-meta"><span class="question-topic">' + (topic ? icon(topic.icon) + escapeHtml(topic.title) : "") + '</span>'
    + '<div class="question-tags"><span class="question-kind">' + kindLabels[question.kind] + '</span>'
    + '<span class="question-difficulty difficulty-' + question.difficulty + '">' + difficultyLabels[question.difficulty] + '</span></div></div>'
    + '<h2 class="question-title" id="question-title" tabindex="-1">' + escapeHtml(question.title) + '</h2>'
    + '<p class="question-prompt">' + escapeHtml(question.prompt) + '</p>'
    + (question.code ? '<pre class="code-block"><code>' + escapeHtml(question.code) + '</code></pre>' : '')
    + quiz(question)
    + '<div class="writing-area" id="writing-area">' + writing(entry, field) + '</div>'
    + answer(question, data.openAnswers)
    + '<div class="question-controls"><div class="status-field"><span class="status-label" id="progress-label">練習狀態</span>'
    + '<div class="status-buttons" role="group" aria-labelledby="progress-label">'
    + Object.entries(statusLabels).map(([status, label]) =>
      '<button type="button" data-status="' + status + '" aria-pressed="' + (entry.status === status) + '">' + label + '</button>',
    ).join("") + '</div></div><div class="next-prev" id="neighbors"></div></div></article>';
}

export function emptyQuestion(): string {
  return '<div class="empty-panel">' + icon("search")
    + '<h2>目前沒有符合條件的題目</h2><p>調整主題、題型或搜尋字串，繼續練習。</p>'
    + '<button type="button" class="button button-primary" id="reset-filters">清除篩選</button></div>';
}

export function roadmap(data: StudyData): string {
  const next = questions.find((question) => data.entries[question.id]?.status !== "mastered");
  return '<section class="page-heading"><div><h1>練習路線</h1>'
    + '<p>依主題練習。答得順了就標記已練熟，需要再練的先留在待複習。</p></div>'
    + (next ? '<a class="button button-primary" href="#q/' + next.id + '" data-question-link>練習下一個未練熟的題目</a>' : '')
    + '</section><div class="roadmap-overview">' + overview(data) + '</div>'
    + '<ol class="roadmap-list">' + topics.map((topic, index) => {
      const scoped = questions.filter((question) => question.topicId === topic.id);
      const counts = progress(data, scoped);
      const nextQuestion = scoped.find((question) => data.entries[question.id]?.status !== "mastered") ?? scoped[0];
      const isDone = counts.mastered === scoped.length;
      const label = isDone ? "回顧題目" : (counts.new === scoped.length ? "開始練習" : "繼續練習");
      return '<li class="roadmap-item"><span class="roadmap-step" aria-label="第 ' + (index + 1) + ' 站">' + (index + 1) + '</span>'
        + '<article class="roadmap-card panel"><div class="roadmap-topic"><span class="topic-icon">' + icon(topic.icon) + '</span>'
        + '<div><h2>' + escapeHtml(topic.title) + '</h2><p>' + escapeHtml(topic.description) + '</p></div></div>'
        + '<div class="roadmap-status"><span>' + counts.mastered + ' / ' + scoped.length + ' 題已練熟</span>'
        + '<progress aria-label="' + escapeHtml(topic.title) + ' 練熟進度" value="' + counts.mastered + '" max="' + scoped.length + '"></progress>'
        + '<span class="roadmap-status-detail">' + counts.new + ' 未開始 · ' + counts.review + ' 待複習</span></div>'
        + '<a class="button button-outline" href="#q/' + nextQuestion.id + '" data-question-link data-start-topic="' + topic.id + '">'
        + label + '</a></article></li>';
    }).join("") + '</ol>';
}

export function notes(data: StudyData): string {
  const saved = questions.filter((question) => data.entries[question.id] && hasDraft(data.entries[question.id]))
    .sort((left, right) => Date.parse(data.entries[right.id].updatedAt) - Date.parse(data.entries[left.id].updatedAt));
  const excerpt = (text: string) => text.length > 180 ? text.slice(0, 180).trimEnd() + "…" : text;
  return '<section class="page-heading"><div><h1>我的筆記</h1><p>從你寫過的回答和筆記接著複習。</p></div>'
    + '<span class="count notes-count">' + saved.length + ' 題有紀錄</span></section>'
    + (saved.length ? '<div class="notes-grid">' + saved.map((question) => {
      const entry = data.entries[question.id];
      const topic = topicById.get(question.topicId);
      return '<article class="note-card panel"><span class="question-topic">' + escapeHtml(topic?.title ?? "") + '</span>'
        + '<h2><a href="#q/' + question.id + '" data-question-link data-open-draft="' + (entry.note.trim() ? "note" : "answer") + '">'
        + escapeHtml(question.title) + '</a></h2>'
        + (entry.answer.trim() ? '<div><h3>我的回答</h3><p>' + escapeHtml(excerpt(entry.answer)) + '</p></div>' : '')
        + (entry.note.trim() ? '<div><h3>我的筆記</h3><p>' + escapeHtml(excerpt(entry.note)) + '</p></div>' : '')
        + '</article>';
    }).join("") + '</div>' : '<section class="panel empty-panel">' + icon("notebook")
      + '<h2>還沒有寫過的回答或筆記</h2><p>在題目下寫一段回答或筆記，就會出現在這裡。</p>'
      + '<a class="button button-primary" href="#practice">回到題庫練習</a></section>');
}

export function backupDialog(): string {
  return '<div class="dialog-header"><div><h2 id="backup-title">資料備份</h2>'
    + '<p>把自己的回答、筆記、選項、進度和解答顯示設定帶到另一個瀏覽器。</p></div>'
    + '<button type="button" class="icon-button" id="close-backup" aria-label="關閉資料備份" autofocus>'
    + icon("close") + '</button></div>'
    + '<div class="backup-actions"><button type="button" class="button button-primary" id="export-backup">'
    + icon("download") + '匯出 JSON</button><button type="button" class="button button-outline" id="select-backup">'
    + icon("upload") + '選擇備份檔</button><input hidden type="file" accept=".json,application/json" id="backup-file" /></div>'
    + '<p class="backup-feedback" id="backup-feedback" role="status"></p>'
    + '<form id="import-confirmation" class="import-confirmation" hidden>'
    + '<p id="import-summary"></p><fieldset id="import-conflicts" hidden><legend>同一欄位有不同內容時</legend>'
    + '<label><input type="radio" name="conflict" value="local" checked /> 保留目前的內容</label>'
    + '<label><input type="radio" name="conflict" value="backup" /> 使用備份的內容</label></fieldset>'
    + '<button class="button button-primary" type="submit">確認匯入</button></form>';
}

export function footer(): string {
  return '<p>' + icon("lock") + '回答、筆記和進度都存在這個瀏覽器。</p>'
    + '<a href="https://github.com/ntustRay/interview-path" rel="noreferrer" target="_blank">GitHub</a>';
}
