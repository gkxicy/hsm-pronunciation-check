"use strict";

const API = "https://hsm-pronunciation-api.huangsm666.workers.dev";
const DATA_URL = "annual-language-data.json?v=20260927-compatible-core-1";
const DEVICE_KEY = "hsm-pronunciation-device-v1";
const LOCAL_PREFIX = "hsm-annual-language-draft:";
const $ = (selector) => document.querySelector(selector);

const state = {
  catalog: null,
  externalExercises: null,
  externalExercisesError: false,
  byDate: { ielts: new Map(), japanese: new Map() },
  viewedDate: "",
  sourceDate: "",
  plan: null,
  planInheritedFrom: "",
  planMissing: false,
  draft: null,
  deviceId: "",
  saveTimer: null,
  media: null,
  stream: null,
  chunks: [],
  recordingStarted: 0,
  recordingIndex: -1,
  recordingKey: "",
  recordingContext: null,
  recordingTarget: "",
  recordingStopping: false,
  recordingRequesting: false,
  recordingAssessing: false,
  dateLoading: false,
  submitting: false,
  audioUrl: "",
  audioTarget: "",
  audioKey: "",
  quiz: null,
  focusRemaining: 45 * 60,
  focusInterval: null,
};

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "class") node.className = value;
    else if (key === "checked") node.checked = Boolean(value);
    else if (key === "open") node.open = Boolean(value);
    else if (value !== undefined && value !== null) node.setAttribute(key, String(value));
  });
  children.flat(Infinity).forEach((child) => {
    if (child === undefined || child === null || child === false) return;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  });
  return node;
}

function validUrl(url) {
  try { return /^https?:$/.test(new URL(url).protocol); } catch { return false; }
}
function externalLink(label, url) {
  return validUrl(url) ? el("a", { class: "button-link secondary", href: url, target: "_blank", rel: "noopener noreferrer" }, label) : null;
}
function externalLinks(label, values) {
  const links = (Array.isArray(values) ? values : [values]).filter(validUrl);
  return links.map((url, index) => externalLink(links.length > 1 ? `${label} ${index + 1}` : label, url));
}
function setStatus(text, kind = "") {
  const box = $("#planStatus");
  box.textContent = text;
  box.className = `status ${kind}`.trim();
}
function isoLocalDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}
function makeDeviceId() {
  const existing = localStorage.getItem(DEVICE_KEY);
  if (existing && /^[a-zA-Z0-9_-]{16,100}$/.test(existing)) return existing;
  const value = (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(/[^a-zA-Z0-9_-]/g, "");
  localStorage.setItem(DEVICE_KEY, value);
  return value;
}
function blankDraft(date) {
  return {
    date, deviceId: state.deviceId, lessonTitle: "", language: "英语与日语", sentences: [], results: [],
    recordingEvidence: [], vocabularyProgress: [], languageExercises: [], sentencePractice: [], englishTasks: [], attempts: [],
    recordingSets: {
      "ja-JP": { sentences: [], results: [], recordingEvidence: [] },
      "en-US": { sentences: [], results: [], recordingEvidence: [] },
    }, updatedAt: "",
  };
}
function normalizeDraft(value, date) {
  const base = blankDraft(date);
  if (!value || typeof value !== "object") return base;
  for (const key of ["results", "recordingEvidence", "vocabularyProgress", "languageExercises", "sentencePractice", "englishTasks", "attempts"])
    base[key] = Array.isArray(value[key]) ? value[key] : [];
  base.recordingSets = value.recordingSets && typeof value.recordingSets === "object" ? value.recordingSets : base.recordingSets;
  base.updatedAt = value.updatedAt || "";
  return base;
}
function pronunciationStatus(result) {
  if (["passed", "failed", "inconclusive", "technical_error", "manual_confirmed"].includes(result?.status)) return result.status;
  if (result?.manualConfirmed === true) return "manual_confirmed";
  if (result?.errorType === "technical_error" || result?.result === "technical_error") return "technical_error";
  if (result?.assessmentInconclusive === true || result?.result === "inconclusive") return "inconclusive";
  if (result?.passed === true || result?.result === "correct") return "passed";
  if (result?.passed === false || result?.result === "knowledge_error") return "failed";
  return "technical_error";
}
function centralResult(status) {
  if (status === "passed") return "correct";
  if (status === "failed") return "knowledge_error";
  return status;
}
function resultMessage(result) {
  if (!result) return "尚未录音";
  const status = pronunciationStatus(result);
  const transcript = result.transcript ? `识别为「${result.transcript}」。` : "";
  if (status === "passed") return `${transcript}朗读内容与目标可靠匹配。`;
  if (status === "failed") return `${transcript}${result.reason || "读音存在明确差异，请重读。"}`;
  if (status === "inconclusive") return `${transcript}${result.reason || result.retryReason || "当前识别结果无法可靠判断，请重新朗读。"}`;
  if (status === "technical_error") return `${result.reason || "录音已保留，但识别服务暂时不可用。"} 这不是知识错误。`;
  if (status === "manual_confirmed") return "你已确认本次读音正确；该结果不会进入错题或补练。";
  return "本次结果暂不可用。";
}
function attemptId(context) {
  return `${state.sourceDate}:pronunciation:${context.language}:${context.source}:${context.index}`;
}
function savePronunciationAttempt(context, result) {
  const status = pronunciationStatus(result);
  const attempt = {
    question_id: attemptId(context),
    user_answer: result.transcript || "[audio recording]",
    result: centralResult(status),
    error_type: centralResult(status),
    timestamp: new Date().toISOString(),
    source: context.source,
    language: context.language,
    day: Number((state.byDate[context.language === "ja-JP" ? "japanese" : "ielts"].get(state.sourceDate)?.day || "").match(/\d+/)?.[0]) || null,
  };
  state.draft.attempts.push(attempt);
}
function saveLearningAttempt({ questionId, userAnswer, result = "inconclusive", source = "web" , language = "" }) {
  const safeResult = ["correct", "knowledge_error", "inconclusive", "technical_error", "manual_confirmed"].includes(result)
    ? result : "inconclusive";
  const inferredLanguage = language || (questionId.startsWith("ja-") || questionId.startsWith("japanese:") ? "ja-JP" : "en-US");
  const course = state.byDate[inferredLanguage === "ja-JP" ? "japanese" : "ielts"].get(state.sourceDate);
  const attempt = {
    question_id: questionId,
    user_answer: String(userAnswer || ""),
    result: safeResult,
    error_type: safeResult,
    timestamp: new Date().toISOString(),
    source,
    language: inferredLanguage,
    day: Number((course?.day || "").match(/\d+/)?.[0]) || null,
  };
  state.draft.attempts = state.draft.attempts.filter((item) => item.question_id !== questionId);
  state.draft.attempts.push(attempt);
}
function exercise(id, prompt = "") {
  let record = state.draft.languageExercises.find((item) => item.id === id);
  if (!record) {
    record = { id, kind: "lesson", prompt: String(prompt).slice(0, 300), response: "", answer: "" };
    state.draft.languageExercises.push(record);
  }
  return record;
}
function englishTask(title) {
  let record = state.draft.englishTasks.find((item) => item.title === title);
  if (!record) {
    record = { title, score: "", note: "", done: false, userAnswer: "", correctAnswer: "", evidence: "" };
    state.draft.englishTasks.push(record);
  }
  return record;
}
function vocabularyRecord(prefix, word) {
  const key = `${prefix}：${word}`;
  let record = state.draft.vocabularyProgress.find((item) => item.word === key);
  if (!record) {
    record = { word: key, done: false };
    state.draft.vocabularyProgress.push(record);
  }
  return record;
}
function localKey() { return `${LOCAL_PREFIX}${state.viewedDate}:${state.deviceId}`; }
function draftEvidenceCount(draft) {
  if (!draft) return 0;
  return (draft.attempts?.length || 0)
    + (draft.recordingEvidence?.length || 0)
    + (draft.vocabularyProgress?.filter((item) => item.done).length || 0)
    + (draft.languageExercises?.filter((item) => item.response?.trim()).length || 0)
    + (draft.englishTasks?.filter((item) => item.done || item.userAnswer?.trim() || item.score?.trim()).length || 0);
}
function localLearningHistory() {
  const records = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(LOCAL_PREFIX) || !key.endsWith(`:${state.deviceId}`)) continue;
    try {
      const draft = JSON.parse(localStorage.getItem(key));
      const count = draftEvidenceCount(draft);
      if (count) records.push({ date: draft.date || key.slice(LOCAL_PREFIX.length, LOCAL_PREFIX.length + 10), count });
    } catch { /* ignore damaged local drafts */ }
  }
  return records.sort((a, b) => b.date.localeCompare(a.date));
}
function updateFocusClock() {
  const node = $("#focusClock");
  if (!node) return;
  const minutes = Math.floor(state.focusRemaining / 60);
  const seconds = state.focusRemaining % 60;
  node.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  $("#focusToggle").textContent = state.focusInterval ? "暂停专注" : state.focusRemaining ? "开始 / 继续专注" : "本轮已完成";
}
function focusKey() { return `hsm-language-focus:${state.viewedDate}`; }
function loadFocusTimer() {
  clearInterval(state.focusInterval); state.focusInterval = null;
  const raw = localStorage.getItem(focusKey());
  const stored = raw === null || raw.trim() === "" ? NaN : Number(raw);
  state.focusRemaining = Number.isInteger(stored) && stored >= 0 && stored <= 45 * 60 ? stored : 45 * 60;
  updateFocusClock();
}
function toggleFocusTimer() {
  if (state.focusInterval) {
    clearInterval(state.focusInterval); state.focusInterval = null; updateFocusClock(); return;
  }
  if (state.focusRemaining <= 0) return;
  state.focusInterval = setInterval(() => {
    state.focusRemaining = Math.max(0, state.focusRemaining - 1);
    localStorage.setItem(focusKey(), String(state.focusRemaining));
    updateFocusClock();
    if (!state.focusRemaining) {
      clearInterval(state.focusInterval); state.focusInterval = null;
      updateFocusClock();
    }
  }, 1000);
  updateFocusClock();
}
function resetFocusTimer() {
  clearInterval(state.focusInterval); state.focusInterval = null; state.focusRemaining = 45 * 60;
  localStorage.setItem(focusKey(), String(state.focusRemaining)); updateFocusClock();
}
function updateDashboard() {
  if (!state.draft || !state.sourceDate) return;
  const history = localLearningHistory();
  const dates = new Set(history.map((item) => item.date));
  const todayCount = draftEvidenceCount(state.draft);
  const submitted = localStorage.getItem(`hsm-language-submitted:${state.viewedDate}`) === "true";
  $("#todayCompletion").textContent = submitted ? "已提交" : todayCount ? "进行中" : "未开始";
  $("#attemptCount").textContent = `${state.draft.attempts?.length || 0} 次`;
  let streak = 0, cursor = isoLocalDate();
  if (!dates.has(cursor)) cursor = addIsoDays(cursor, -1);
  while (dates.has(cursor)) { streak += 1; cursor = addIsoDays(cursor, -1); }
  $("#studyStreak").textContent = `${streak} 天`;
  let week = 0;
  for (let offset = 0; offset < 7; offset += 1) if (dates.has(addIsoDays(isoLocalDate(), -offset))) week += 1;
  $("#weekCompletion").textContent = `${week}/7`;
  const checklist = $("#todayChecklist"); checklist.replaceChildren();
  const ielts = state.byDate.ielts.get(state.sourceDate), japanese = state.byDate.japanese.get(state.sourceDate);
  const items = [
    ielts ? `雅思 ${ielts.day}：${ielts.focus}` : "雅思任务待发布",
    japanese ? `日语 ${japanese.day}：${japanese.task}` : "日语任务待发布",
    ...(state.plan?.carryover?.length ? [`定向补练 ${state.plan.carryover.length} 项（只补知识错误或未完成项）`] : []),
  ];
  items.forEach((item) => checklist.append(el("li", {}, item)));
  const historyRoot = $("#historyList"); historyRoot.replaceChildren();
  if (!history.length) historyRoot.append(el("p", { class: "prose" }, "还没有真实保存的学习记录。"));
  history.slice(0, 30).forEach((item) => historyRoot.append(el("div", { class: "history-item" }, el("span", {}, item.date), el("strong", {}, `${item.count} 条真实记录`))));
}
function markChanged() {
  localStorage.removeItem(`hsm-language-submitted:${state.viewedDate}`);
  state.draft.updatedAt = new Date().toISOString();
  localStorage.setItem(localKey(), JSON.stringify(state.draft));
  $("#saveState").textContent = "已暂存在本机；正在同步 Cloudflare…";
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(saveCloud, 750);
  updateDashboard();
}
async function saveCloud() {
  clearTimeout(state.saveTimer);
  state.saveTimer = null;
  const draft = state.draft;
  if (!draft) return;
  const savedVersion = draft.updatedAt;
  try {
    const { response, data } = await fetchWithTimeout(`${API}/draft`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) }, 15000, "云端保存超时，本机进度仍在，可稍后重试");
    if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
    if (state.draft === draft && draft.updatedAt === savedVersion) $("#saveState").textContent = "已保存到本机和 Cloudflare。";
  } catch (error) {
    if (state.draft === draft && draft.updatedAt === savedVersion) $("#saveState").textContent = `本机已保存；Cloudflare 暂存失败：${error.message}`;
  }
}
async function loadDraft() {
  let local = null, cloud = null;
  try { local = JSON.parse(localStorage.getItem(localKey()) || "null"); } catch { local = null; }
  try {
    const query = new URLSearchParams({ date: state.viewedDate, deviceId: state.deviceId });
    const response = await fetch(`${API}/draft?${query}`, { cache: "no-store" });
    const data = await response.json();
    if (response.ok && data.ok) cloud = data.draft;
  } catch { cloud = null; }
  const newest = [local, cloud].filter(Boolean).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0];
  state.draft = normalizeDraft(newest, state.viewedDate);
  if (newest) localStorage.setItem(localKey(), JSON.stringify(state.draft));
  $("#saveState").textContent = newest ? "已恢复此前暂存的进度。" : "尚无暂存进度；填写后会自动保存。";
}
function addIsoDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function usablePlan(plan) {
  return plan && state.byDate.ielts.has(plan.sourceDate) && state.byDate.japanese.has(plan.sourceDate);
}
async function requestPublishedPlan(date, inherit = false) {
  try {
    const query = new URLSearchParams(inherit ? { date, inherit: "1" } : { date });
    const response = await fetch(`${API}/plan?${query}`, { cache: "no-store" });
    const data = await response.json();
    return response.ok && data.ok ? data : null;
  } catch { return null; }
}
async function findPreviousPublishedPlan(date) {
  let cursor = addIsoDays(date, -1);
  while (cursor >= state.catalog.startDate) {
    const dates = [];
    for (let index = 0; index < 14 && cursor >= state.catalog.startDate; index += 1) {
      dates.push(cursor);
      cursor = addIsoDays(cursor, -1);
    }
    const attempts = await Promise.all(dates.map(async (candidate) => ({ candidate, data: await requestPublishedPlan(candidate) })));
    const found = attempts.find(({ data }) => usablePlan(data?.plan));
    if (found) return { plan: found.data.plan, inheritedFrom: found.candidate };
  }
  return null;
}
async function loadPlan() {
  state.plan = null;
  state.planInheritedFrom = "";
  state.planMissing = false;
  const current = await requestPublishedPlan(state.viewedDate, true);
  if (usablePlan(current?.plan)) {
    state.plan = current.plan;
    state.planInheritedFrom = current.inheritedFrom || (current.plan.date !== state.viewedDate ? current.plan.date : "");
  } else {
    const previous = await findPreviousPublishedPlan(state.viewedDate);
    if (previous) {
      state.plan = previous.plan;
      state.planInheritedFrom = previous.inheritedFrom;
    }
  }
  state.planMissing = !state.plan;
  state.sourceDate = state.plan?.sourceDate || state.catalog.startDate;
}
function section(title, content, links = []) {
  const wrap = el("section", { class: "section" }, el("h3", {}, title));
  if (content) wrap.append(el("p", { class: "prose" }, content));
  const usable = links.filter(Boolean);
  if (usable.length) wrap.append(el("div", { class: "links" }, usable));
  return wrap;
}
function answerDetails(text, title = "完成后查看参考答案与解析") {
  return text ? el("details", { class: "answer" }, el("summary", {}, title), el("p", { class: "prose" }, text)) : null;
}
function externalDataStatus({ hasLink, completed, userAnswer }) {
  if (userAnswer?.trim()) return "已收到你的作答；若要逐题分析，仍需可靠取得或由你粘贴真实题目。";
  if (completed) return "已完成，但暂无逐题题目和作答数据；系统不会据链接臆造内容。";
  if (hasLink) return "当前只有外部链接，尚未取得真实题目；完成后请粘贴题目或实际作答。";
  return "当前题目数据不可用，等待用户录入；系统不会伪造题目或答案。";
}
function renderExternalExercises(course, language) {
  const packs = globalThis.ExternalExercises?.packsForCourse(state.externalExercises, course, language) || [];
  const wrap = el("div", { class: "external-exercises" });
  if (!packs.length) {
    if (course.officialUrls?.length || course.officialUrl) wrap.append(el("p", { class: "prose" },
      state.externalExercisesError ? "已核验题目补充数据暂时加载失败，可刷新重试；原作业和课程不受影响。" : "此课程的外部题尚未逐题核验；目录不等于原题，暂不据此自动判错。若已做其他题，请在下面填写原题链接、题号及题干，保留你的原作答。"));
    return wrap;
  }
  for (const pack of packs) {
    wrap.append(el("h4", {}, `已核验具体练习：${pack.title}`), el("p", { class: "prose" }, pack.requirements),
      el("p", { class: "prose external-data-status" }, `原题及官方答案已取得（核验：${pack.verifiedAt}）。${pack.sourceLabel}`),
      el("div", { class: "links" }, externalLink("完整原题 / 官方 PDF", `${pack.questionUrl}${pack.questionPage ? `#page=${pack.questionPage}` : ""}`),
        externalLink("音频 / 视频 / 在线练习", pack.pageUrl)));
    const answerSources = el("details", { class: "answer" }, el("summary", {}, "完成后查看官方答案来源"),
      externalLink(`官方答案${pack.answerPage ? ` · 第${pack.answerPage}页` : ""}`, `${pack.answerUrl}${pack.answerPage ? `#page=${pack.answerPage}` : ""}`));
    wrap.append(answerSources);
    const questions = pack.questions.map((item) => {
      const id = globalThis.ExternalExercises.questionId(course.date, language, pack.id, item.id);
      return {
        id, prompt: `${pack.title}｜${item.locator}｜${item.prompt}`,
        stem: `${item.locator}：${item.prompt}`, options: [],
        answer: item.answer, answerStatus: "available", language,
        source: pack.questionUrl,
        explanation: `${item.explanation}\n核对依据：${pack.sourceLabel}`,
      };
    });
    // Reuse the existing question/attempt UI; never rewrite legacy official answers.
    wrap.append(renderStructuredPractice({date:course.date, questions, external:true}, "原题对应作答"));
    wrap.append(el("p", { class: "prose" }, "这里显示中文题意与已核验题号，完整英文/日文题干、选项和正文请打开官方原题。未讲解的题不冒充已有逐题解析。"));
  }
  return wrap;
}
function renderExternalMaterialInput(course, language) {
  const prefix = `external-input:${language}:${course.date}`;
  const box = el("details", {class:"answer"}, el("summary", {}, "做了其他外部题？补充准确原题（不覆盖旧作业）"));
  for (const [suffix, label, placeholder] of [
    ["url", "你实际做的原题链接及题号", "填写具体篇名、官方 URL、Task/页码/题号；不要只填目录"],
    ["question", "原题题干 / 选项 / 写作要求", "无法读取动态网页时粘贴真实题目；图表请记录数据和题目要求"],
    ["answer-source", "官方答案来源（可选）", "官方答案链接或原题中答案位置；你的猜测不是官方答案"],
  ]) box.append(responseField(`${prefix}:${suffix}`, label, `${course.officialTask}｜${label}`, placeholder));
  box.append(el("p", {class:"prose"}, "以上用于定位材料，不算完成新课或答题证据。你的作答仍填在对应答案框；未取得可靠答案时保留待核验状态。"));
  return box;
}
function responseField(id, label, prompt, placeholder = "先独立完成，再查看解析") {
  const record = exercise(id, prompt);
  const input = el("textarea", { placeholder }, record.response);
  input.value = record.response;
  input.addEventListener("input", () => {
    record.response = input.value;
    saveLearningAttempt({ questionId: id, userAnswer: input.value, source: "daily_course" });
    markChanged();
  });
  return el("div", { class: "field" }, el("label", {}, label, el("small", {}, "输入会自动暂存"), input));
}
function doneLine(id, prompt, label = "已完成") {
  const record = exercise(id, prompt);
  const input = el("input", { type: "checkbox", checked: record.response === "已完成" });
  input.addEventListener("change", () => { record.response = input.checked ? "已完成" : ""; markChanged(); });
  return el("label", { class: "checkline" }, input, label);
}
function renderStructuredPractice(course, title) {
  const questions = Array.isArray(course.questions) ? course.questions : [];
  const wrap = el("section", { class: "section structured-practice" }, el("h3", {}, title), el("p", { class: "prose" }, course.external ? "下面的题号、答案依据官方材料核验，中文题意是摘要；完整原题请查看上方官方入口。" : "系统已获得 Excel 中的真实题目。逐题答案仅在表格确实提供时显示。"));
  if (!questions.length) {
    wrap.append(responseField(`${course.date}:practice`, "你的答案", course.practice));
    wrap.append(answerDetails(course.explanation));
    return wrap;
  }
  questions.forEach((question, index) => {
    const record = exercise(question.id, question.prompt);
    record.kind = "quiz";
    const input = el("textarea", { placeholder: "先独立作答，再查看答案或解析" });
    input.value = record.response;
    input.addEventListener("input", () => {
      record.response = input.value;
      saveLearningAttempt({ questionId: question.id, userAnswer: input.value, source: question.source, language: question.language });
      markChanged();
    });
    const card = el("article", { class: "question-card" },
      el("h4", {}, `${index + 1}. ${question.stem || question.prompt}`));
    if (Array.isArray(question.options) && question.options.length) {
      card.append(el("ul", { class: "question-options" }, question.options.map((option) => el("li", {}, `${option.id} ${option.text}`))));
    }
    card.append(el("label", {}, "你的答案", input));
    if (question.answerStatus === "available") {
      card.append(answerDetails(`答案：${question.answer}${question.explanation ? `\n解析：${question.explanation}` : ""}`, "完成后查看本题答案与解析"));
      card.append(el("div", { class: "buttons" },
        el("button", { type: "button", class: "secondary", onclick: () => {
          if (!record.response?.trim()) { alert("请先填写你的实际答案，再核对结果。"); return; }
          saveLearningAttempt({ questionId: question.id, userAnswer: record.response, result: "correct", source: question.source, language: question.language });
          markChanged();
        } }, "核对后：答案正确"),
        el("button", { type: "button", class: "secondary", onclick: () => {
          if (!record.response?.trim()) { alert("请先填写你的实际答案，空白不记为知识错误。"); return; }
          saveLearningAttempt({ questionId: question.id, userAnswer: record.response, result: "knowledge_error", source: question.source, language: question.language });
          markChanged();
        } }, "核对后：需要复习")));
    } else {
      card.append(el("p", { class: "prose" }, "这一天没有可靠的逐题标准答案，系统不会伪造答案或自动判错；保留你的作答，等待人工批改。"));
    }
    wrap.append(card);
  });
  return wrap;
}
function renderVocabulary(course, language, prefix) {
  const wrap = el("section", { class: "section" }, el("h3", {}, `核心词汇 · ${course.vocabulary.length} 个`));
  wrap.append(el("div", { class: "links" },
    el("button", { type: "button", onclick: () => startQuiz(course.vocabulary, language, "meaning-to-word", prefix) }, "随机测试：看中文写词"),
    el("button", { type: "button", class: "secondary", onclick: () => startQuiz(course.vocabulary, language, "word-to-meaning", prefix) }, "随机测试：看词写中文")
  ));
  const grid = el("div", { class: "vocab" });
  course.vocabulary.forEach(([word, meaning]) => {
    const progress = vocabularyRecord(prefix, word);
    const check = el("input", { type: "checkbox", checked: progress.done });
    check.addEventListener("change", () => { progress.done = check.checked; markChanged(); });
    grid.append(el("div", { class: "word" }, el("b", {}, word), el("span", {}, meaning),
      el("div", { class: "word-actions" }, el("button", { type: "button", class: "secondary", onclick: () => speak(word, language) }, "听发音"), el("label", {}, check, " 已跟读"))));
  });
  wrap.append(grid);
  return wrap;
}
function renderIelts(course) {
  const root = $("#ielts"); root.replaceChildren();
  root.append(el("header", { class: "course-head" }, el("small", {}, `${course.day} · ${course.stage}`), el("h2", {}, `雅思英语 · ${course.focus}`), el("p", {}, `${course.duration}｜课程、原创练习和配套练习按表格顺序完成。`)));
  root.append(section("今日任务", course.task));
  root.append(section("中文课程 / 讲解", course.course, externalLinks("打开当天讲解", course.courseUrls?.length ? course.courseUrls : course.courseUrl)));
  root.append(renderVocabulary(course, "en-US", "英语"));
  root.append(renderSpeechPractice({ lines: englishLines(course), language: "en-US", title: "英语词汇朗读录音与回放" }));
  const check = section("5 分钟闭卷验收", course.check);
  check.append(responseField(`ielts:${course.date}:check`, "你的口头验收记录", course.check, "记下答不上来的点；不必重复抄题")); root.append(check);
  root.append(renderStructuredPractice(course, "今日原创练习"));
  const official = section("配套 / 官方练习", course.officialTask, externalLinks("打开原题或练习", course.officialUrls?.length ? course.officialUrls : course.officialUrl));
  official.append(renderExternalExercises(course, "en-US"), renderExternalMaterialInput(course, "en-US"));
  const task = englishTask(course.officialTask);
  const officialStatus = el("p", { class: "prose external-data-status" }, externalDataStatus({ hasLink: Boolean(course.officialUrls?.length || course.officialUrl), completed: task.done, userAnswer: task.userAnswer }));
  official.append(officialStatus);
  official.append(el("p", {class:"prose"}, "下方为原有整份作业记录，与上方新增逐题作答分开保存；旧答案不会自动绑定到新选篇目。"));
  const done = el("input", { type: "checkbox", checked: task.done });
  done.addEventListener("change", () => {
    task.done = done.checked;
    officialStatus.textContent = externalDataStatus({ hasLink: Boolean(course.officialUrls?.length || course.officialUrl), completed: task.done, userAnswer: task.userAnswer });
    markChanged();
  });
  const score = el("input", { placeholder: "例如 7/10", value: task.score }); score.value = task.score;
  score.addEventListener("input", () => { task.score = score.value; markChanged(); });
  const answer = el("textarea", { placeholder: "粘贴或填写你实际提交的答案" }); answer.value = task.userAnswer;
  answer.addEventListener("input", () => {
    task.userAnswer = answer.value;
    officialStatus.textContent = externalDataStatus({ hasLink: Boolean(course.officialUrls?.length || course.officialUrl), completed: task.done, userAnswer: task.userAnswer });
    saveLearningAttempt({ questionId: `en-${course.date}-official`, userAnswer: answer.value, source: course.officialUrl || "external_official", language: "en-US" });
    markChanged();
  });
  const evidence = el("textarea", { placeholder: "题号、原文/音频定位、错因；晚间复盘会根据你的实际答案批改" }); evidence.value = task.evidence;
  evidence.addEventListener("input", () => { task.evidence = evidence.value; markChanged(); });
  official.append(el("label", { class: "checkline" }, done, "已完成原题"), el("div", { class: "field" }, el("label", {}, "得分", score)), el("div", { class: "field" }, el("label", {}, "你的实际答案", answer)), el("div", { class: "field" }, el("label", {}, "错题定位 / 证据", evidence)));
  root.append(official, section("今日完成标准", course.standard));
}
function japaneseLines(course) {
  const kana = (course.pronunciation.match(/[ぁ-んァ-ヶー]{1,}/g) || []);
  return [...new Set([...kana, ...course.vocabulary.map(([word]) => word)])].slice(0, 20);
}
function englishLines(course) {
  return [...new Set(course.vocabulary.map(([word]) => String(word || "").trim()).filter(Boolean))].slice(0, 20);
}
function manuallyConfirmPronunciation(index, target, options = {}) {
  const context = {
    index,
    target,
    key: options.key || `daily:${index}`,
    source: options.source || "daily",
    language: options.language || "ja-JP",
  };
  const current = state.draft.results.find((item) => item.language === context.language && item.target === target) || {};
  const result = {
    ...current,
    target,
    language: context.language,
    status: "manual_confirmed",
    result: "manual_confirmed",
    errorType: "manual_confirmed",
    passed: true,
    manualConfirmed: true,
    manualConfirmedAt: new Date().toISOString(),
    assessmentInconclusive: false,
    retryRequired: false,
    reason: "用户确认自己读对了",
  };
  state.draft.results = state.draft.results.filter((item) => !(item.language === context.language && item.target === target));
  state.draft.results.push(result);
  state.draft.recordingSets[context.language] ||= { sentences: [], results: [], recordingEvidence: [] };
  const set = state.draft.recordingSets[context.language];
  set.results = set.results.filter((item) => item.target !== target);
  set.results.push(result);
  const evidence = set.recordingEvidence.find((item) => item.target === target);
  if (evidence) evidence.assessmentStatus = "manual_confirmed";
  const topEvidence = state.draft.recordingEvidence.find((item) => item.language === context.language && item.target === target);
  if (topEvidence) topEvidence.assessmentStatus = "manual_confirmed";
  if (context.source === "carryover") {
    const record = exercise(`carry:${state.viewedDate}:${index}`, target);
    record.response = "已重读并由本人确认读音正确；不进入错题或后续补练";
  }
  savePronunciationAttempt(context, result);
  markChanged();
  rerenderRecordingSurfaces();
}
function renderSpeechPractice({ lines, language, title }) {
  state.draft.recordingSets[language] ||= { sentences: [], results: [], recordingEvidence: [] };
  state.draft.recordingSets[language].sentences = lines;
  const sectionEl = el("section", { class: "section speech-practice", "data-language": language },
    el("h3", {}, title),
    el("p", { class: "prose" }, "先听参考音，再任选一项录音。你读完后手动停止，页面会立即提供自己的录音回放。当前只做可靠的朗读内容匹配与容错，不冒充专业音素评分。"));
  const statusText = state.recordingRequesting ? "正在请求麦克风权限，请在浏览器提示中允许录音…"
    : state.recordingAssessing ? "录音已完成，可立即回放；正在识别，请稍候（最多约 30 秒）…"
    : state.recordingStopping
    ? "正在结束录音并生成回放…"
    : state.media
      ? `正在录音：${state.recordingTarget}。读完后请点击当前句子的红色结束按钮。`
      : state.audioUrl
        ? "录音已完成，回放就在刚才录制的句子下面。"
        : "请选择任意一句，点击“开始录音”。";
  sectionEl.append(el("div", { id: `recordStatus-${language}`, class: `record-status ${state.media || state.recordingStopping ? "active" : ""}` }, statusText));
  const list = el("div", { class: "record-list" });
  lines.forEach((line, index) => {
    const key = `daily:${language}:${index}`;
    const result = state.draft.results.find((item) => item.language === language && item.target === line);
    const isCurrentRecording = Boolean(state.media) && state.recordingKey === key;
    const isCurrentStopping = state.recordingStopping && state.recordingKey === key;
    const recordButton = el("button", {
      type: "button",
      class: isCurrentRecording || isCurrentStopping ? "record-stop" : "",
      onclick: isCurrentRecording ? stopRecording : () => beginRecording(index, line, { key, source: "daily", language }),
    }, isCurrentStopping ? "正在生成回放…" : isCurrentRecording ? "■ 结束录音并生成回放" : "开始录音");
    recordButton.disabled = isCurrentStopping || (recordingBusy() && !isCurrentRecording);
    const listenButton = el("button", { type: "button", class: "secondary", onclick: () => speak(line, language) }, "听参考音");
    listenButton.disabled = recordingBusy();
    const resultText = resultMessage(result);
    const resultStatus = pronunciationStatus(result);
    const confirmButton = result && ["inconclusive", "technical_error"].includes(resultStatus)
      ? el("button", { type: "button", class: "secondary", onclick: () => manuallyConfirmPronunciation(index, line, { key, source: "daily", language }) }, "我确认自己读对了")
      : null;
    if (confirmButton) confirmButton.disabled = recordingBusy();
    const row = el("div", { class: `record-line ${state.recordingKey === key ? "current" : ""} ${isCurrentRecording || isCurrentStopping ? "recording" : ""}` },
      el("b", {}, `${index + 1}. ${line}`),
      el("div", {}, resultText),
      el("div", { class: "buttons" }, listenButton, recordButton, confirmButton));
    if (state.audioUrl && state.audioKey === key) row.append(el("div", { class: "record-playback" }, el("strong", {}, "你的录音回放"), el("audio", { controls: "", src: state.audioUrl })));
    list.append(row);
  });
  sectionEl.append(list);
  return sectionEl;
}
function renderJapanese(course) {
  const root = $("#japanese"); root.replaceChildren();
  root.append(el("header", { class: "course-head" }, el("small", {}, `${course.day} · ${course.stage}`), el("h2", {}, "日语 N2 路线"), el("p", {}, `${course.duration}｜从五十音开始，按年度表逐日推进。`)));
  root.append(section("今日假名 / 发音", course.pronunciation), section("今日学习任务", course.task), section("当天视频课程", course.course, externalLinks("打开当天视频", course.courseUrls?.length ? course.courseUrls : course.courseUrl)));
  root.append(renderVocabulary(course, "ja-JP", "日语"));
  const check = section("快速闭卷验收", course.check); check.append(responseField(`japanese:${course.date}:check`, "你的验收记录", course.check)); root.append(check);
  root.append(renderStructuredPractice(course, "今日原创练习题"));
  const official = section("JLPT / 官方题", course.officialTask, externalLinks("打开官方题", course.officialUrls?.length ? course.officialUrls : course.officialUrl));
  official.append(renderExternalExercises(course, "ja-JP"));
  if (course.officialUrls?.length) official.append(renderExternalMaterialInput(course, "ja-JP"));
  const officialDoneRecord = exercise(`japanese:${course.date}:official`, course.officialTask);
  const officialNotesRecord = exercise(`japanese:${course.date}:official-notes`, course.officialTask);
  official.append(
    el("p", { class: "prose external-data-status" }, externalDataStatus({ hasLink: Boolean(course.officialUrls?.length || course.officialUrl), completed: officialDoneRecord.response === "已完成", userAnswer: officialNotesRecord.response })),
    doneLine(`japanese:${course.date}:official`, course.officialTask),
    responseField(`japanese:${course.date}:official-notes`, "答案 / 错题记录", course.officialTask, "完成正式题后填写"),
    answerDetails(course.officialExplanation, "完成后查看官方正答 / 解析说明"),
  );
  root.append(official);
  const reading = section("阅读", course.reading, externalLinks("打开阅读材料", course.readingUrls?.length ? course.readingUrls : course.readingUrl)); reading.append(doneLine(`japanese:${course.date}:reading`, course.reading)); root.append(reading);
  const listeningLinks = [
    ...externalLinks("打开音频", course.audioUrls?.length ? course.audioUrls : course.audioUrl),
    ...externalLinks("打开听力题册", course.listeningBookUrls?.length ? course.listeningBookUrls : course.listeningBookUrl),
  ];
  const listening = section("听力", course.listening, listeningLinks);
  if (globalThis.ExternalExercises?.listeningMismatch(course)) listening.append(el("p", {class:"status warn"}, "材料待核验：表格里的音频与听力题册年份不同，不能直接套用题册答案；本次不做该音频的自动判错或逐题答案匹配。先核对同年份题册再作答。"));
  listening.append(doneLine(`japanese:${course.date}:listening`, course.listening)); root.append(listening);
  root.append(renderSpeechPractice({ lines: japaneseLines(course), language: "ja-JP", title: "日语跟读录音与回放" }));
}
function carryoverRecordingTarget(item) {
  if (item?.kind === "pronunciation" && item?.target) return String(item.target).trim();
  const text = `${item?.title || ""}\n${item?.feedback || ""}`;
  if (!/(?:日语|发音|朗读|重读|录音|读错)/.test(text)) return "";
  const quoted = [...text.matchAll(/[「『“\"`]([^」』”\"`\n]{1,300})[」』”\"`]/g)]
    .map((match) => match[1].trim())
    .find((value) => /[ぁ-んァ-ヶ一-龯]/.test(value));
  if (quoted) return quoted;
  const labelled = text.match(/(?:目标句|原句|重读(?:这一句|该句|句子)?|日语发音)[：:\s]+([^\n；。]{1,300})/);
  return labelled?.[1]?.trim() || "";
}
function renderCarryoverRecording(item, index, target) {
  const language = item.language === "en-US" ? "en-US" : "ja-JP";
  const key = `carryover:${index}`;
  const result = state.draft.results.find((entry) => entry.language === language && entry.target === target);
  const isCurrentRecording = Boolean(state.media) && state.recordingKey === key;
  const isCurrentStopping = state.recordingStopping && state.recordingKey === key;
  const listenButton = el("button", { type: "button", class: "secondary", onclick: () => speak(target, language) }, "听参考音");
  listenButton.disabled = recordingBusy();
  const recordButton = el("button", {
    type: "button",
    class: isCurrentRecording || isCurrentStopping ? "record-stop" : "",
    onclick: isCurrentRecording ? stopRecording : () => beginRecording(index, target, { key, source: "carryover", language }),
  }, isCurrentStopping ? "正在生成回放…" : isCurrentRecording ? "■ 结束重读并生成回放" : "开始重读录音");
  recordButton.disabled = isCurrentStopping || (recordingBusy() && !isCurrentRecording);
  const status = resultMessage(result);
  const resultStatus = pronunciationStatus(result);
  const confirmButton = result && ["inconclusive", "technical_error"].includes(resultStatus)
    ? el("button", { type: "button", class: "secondary", onclick: () => manuallyConfirmPronunciation(index, target, { key, source: "carryover", language }) }, "我确认自己读对了")
    : null;
  if (confirmButton) confirmButton.disabled = recordingBusy();
  const row = el("div", { class: `record-line ${state.recordingKey === key ? "current" : ""} ${isCurrentRecording || isCurrentStopping ? "recording" : ""}` },
    el("b", {}, target),
    el("div", {}, status),
    el("div", { class: "buttons" }, listenButton, recordButton, confirmButton));
  if (state.audioUrl && state.audioKey === key) row.append(el("div", { class: "record-playback" }, el("strong", {}, "你的本次重读回放"), el("audio", { controls: "", src: state.audioUrl })));
  return row;
}
function renderCarryover() {
  const items = Array.isArray(state.plan?.carryover) ? state.plan.carryover : [];
  const root = $("#carryover"), list = $("#carryList"); list.replaceChildren();
  root.classList.toggle("hidden", !items.length);
  items.forEach((item, index) => {
    const card = el("div", { class: "carry-card" }, el("h3", {}, item.title), el("p", { class: "prose" }, item.feedback));
    const target = carryoverRecordingTarget(item);
    if (target) {
      card.append(el("p", { class: "prose" }, "这是上一天未通过的读音。先听参考音，再开始录音；读完后由你手动结束，可立即回放并重新评分。"));
      card.append(renderCarryoverRecording(item, index, target));
    } else {
      card.append(responseField(`carry:${state.viewedDate}:${index}`, "本次补做答案 / 结果", item.title));
    }
    list.append(card);
  });
}
function render() {
  const ielts = state.byDate.ielts.get(state.sourceDate), japanese = state.byDate.japanese.get(state.sourceDate);
  const repeatOnly = state.plan?.action === "repeat" && !state.plan.fullDayRepeat && (state.plan.carryover?.length || 0) > 0;
  renderCarryover();
  $("#loading").classList.add("hidden"); $("#courses").classList.toggle("hidden", repeatOnly || !ielts || !japanese); $("#submitArea").classList.remove("hidden");
  if (!ielts || !japanese) {
    setStatus(`所选日期不在年度计划范围内（${state.catalog.startDate} 至 ${state.catalog.endDate}）。`, "bad"); return;
  }
  if (!repeatOnly) { renderIelts(ielts); renderJapanese(japanese); }
  state.draft.lessonTitle = `${state.sourceDate} · 雅思 ${ielts.day} + 日语 ${japanese.day}`;
  if (state.planMissing) setStatus(`没有读取到任何已发布的学习进度。为防止按日期跳级，页面已安全停在 ${state.sourceDate}，不会自动进入今天对应的日历课程。`, "warn");
  else if (state.planInheritedFrom) setStatus(`今天的云端计划尚未生成，已自动沿用 ${state.planInheritedFrom} 的有效进度：${state.sourceDate}。不会按日历日期跳级。`, "warn");
  else if (state.plan?.fullDayRepeat) setStatus(`今天继续 ${state.sourceDate} 的当前课程，不进入下一天；已完成内容和提交记录保留。\n原因：${state.plan.reason || "尚无当前新课已完成的可靠证据"}`, "warn");
  else if (repeatOnly) setStatus(`昨晚未通过项目较多：今天只重做列出的未通过项目；已经完成的作业不重做。\n原因：${state.plan.reason || "根据晚间复盘调整"}`, "warn");
  else if (state.plan?.carryover?.length) setStatus(`今天进入 ${state.sourceDate} 的新内容，并追加 ${state.plan.carryover.length} 个少量补练项目。已通过内容不重做。`, "warn");
  else setStatus(`正在学习年度计划 ${state.sourceDate}：雅思 ${ielts.day} + 日语 ${japanese.day}。页面内容来自两份 365 天表格。`);
  updateDashboard();
  loadFeedback();
}
async function changeDate(date) {
  if (recordingBusy() || state.dateLoading) { $("#date").value = state.viewedDate; return; }
  state.dateLoading = true;
  $("#date").disabled = true;
  // Flush the outgoing draft before changing the timer's destination.
  if (state.saveTimer) { clearTimeout(state.saveTimer); state.saveTimer = null; await saveCloud(); }
  try {
  if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
  state.viewedDate = date; state.sourceDate = state.catalog.startDate; state.audioUrl = ""; state.audioTarget = ""; state.audioKey = ""; state.recordingIndex = -1; state.recordingKey = ""; state.recordingContext = null;
  $("#loading").classList.remove("hidden"); $("#courses").classList.add("hidden"); $("#submitArea").classList.add("hidden");
  await Promise.all([loadPlan(), loadDraft()]); loadFocusTimer(); render();
  } finally { state.dateLoading = false; $("#date").disabled = false; }
}
function shuffled(items) { const copy = [...items]; for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; } return copy; }
function startQuiz(words, language, direction, prefix) {
  state.quiz = { items: shuffled(words), index: 0, correct: 0, language, direction, prefix, attempts: [] };
  $("#quiz").showModal(); showQuizQuestion();
}
function showQuizQuestion() {
  const quiz = state.quiz, pair = quiz.items[quiz.index];
  $("#quizTitle").textContent = `${quiz.prefix}随机词测`;
  $("#quizMeta").textContent = `第 ${quiz.index + 1}/${quiz.items.length} 题｜答案提交前不会显示`;
  $("#quizQuestion").textContent = quiz.direction === "meaning-to-word" ? pair[1] : pair[0];
  $("#quizAnswer").value = ""; $("#quizResult").textContent = ""; $("#checkQuiz").textContent = "提交答案"; $("#checkQuiz").onclick = checkQuiz;
  $("#quizAnswer").focus();
}
function normalizeAnswer(value) { return value.trim().toLocaleLowerCase().replace(/[\s.,，。!！?？]/g, ""); }
function checkQuiz() {
  const quiz = state.quiz, pair = quiz.items[quiz.index], expected = quiz.direction === "meaning-to-word" ? pair[0] : pair[1], actual = $("#quizAnswer").value.trim();
  if (!actual) { $("#quizResult").textContent = "请先填写答案。"; return; }
  const correct = normalizeAnswer(actual) === normalizeAnswer(expected); if (correct) quiz.correct++;
  quiz.attempts.push({ prompt: $("#quizQuestion").textContent, actual, expected, correct });
  $("#quizResult").textContent = `${correct ? "正确" : "需要复习"}\n正确答案：${expected}`;
  $("#checkQuiz").textContent = quiz.index + 1 < quiz.items.length ? "下一题" : "完成本轮";
  $("#checkQuiz").onclick = () => {
    if (++quiz.index < quiz.items.length) showQuizQuestion(); else finishQuiz();
  };
}
function finishQuiz() {
  const quiz = state.quiz, id = `quiz:${state.sourceDate}:${quiz.prefix}:${quiz.direction}`;
  const rec = exercise(id, `${quiz.prefix}${quiz.direction === "meaning-to-word" ? "中译词" : "词译中"}随机测试`);
  rec.kind = "quiz"; rec.response = `${quiz.correct}/${quiz.items.length}\n` + quiz.attempts.filter((x) => !x.correct).map((x) => `${x.prompt}：${x.actual} → ${x.expected}`).join("\n");
  quiz.attempts.forEach((item, index) => saveLearningAttempt({
    questionId: `${id}:${index + 1}:${normalizeAnswer(item.expected)}`,
    userAnswer: item.actual,
    result: item.correct ? "correct" : "knowledge_error",
    source: "vocabulary_quiz",
    language: quiz.language,
  }));
  markChanged(); $("#quizResult").textContent = `本轮得分：${quiz.correct}/${quiz.items.length}。错题已自动保存。`; $("#checkQuiz").textContent = "关闭"; $("#checkQuiz").onclick = () => $("#quiz").close();
}
function speak(text, language) {
  if (!window.speechSynthesis) { alert("当前浏览器不支持系统语音合成。"); return; }
  speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = language; utterance.rate = language === "ja-JP" ? .82 : .9;
  const voices = speechSynthesis.getVoices(); const exact = voices.find((voice) => voice.lang.toLowerCase() === language.toLowerCase()) || voices.find((voice) => voice.lang.toLowerCase().startsWith(language.slice(0, 2).toLowerCase())); if (exact) utterance.voice = exact;
  speechSynthesis.speak(utterance);
}
function rerenderRecordingSurfaces() {
  renderCarryover();
  const ielts = state.byDate.ielts.get(state.sourceDate);
  const japanese = state.byDate.japanese.get(state.sourceDate);
  if (!$("#courses").classList.contains("hidden")) {
    if (ielts) renderIelts(ielts);
    if (japanese) renderJapanese(japanese);
  }
}
async function beginRecording(index, target, options = {}) {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { alert("当前浏览器不支持网页录音，请使用最新版 Chrome/Edge。 "); return; }
  if (recordingBusy() || state.dateLoading) return;
  state.recordingRequesting = true;
  rerenderRecordingSurfaces();
  try {
    window.speechSynthesis?.cancel(); document.querySelectorAll("audio").forEach((audio) => audio.pause());
    const context = { index, target, key: options.key || `daily:${index}`, source: options.source || "daily", language: options.language || "ja-JP" };
    state.stream = await navigator.mediaDevices.getUserMedia({ audio: true }); state.chunks = []; state.recordingIndex = index; state.recordingKey = context.key; state.recordingContext = context; state.recordingTarget = target; state.recordingStarted = Date.now(); state.recordingStopping = false;
    state.media = new MediaRecorder(state.stream); state.media.ondataavailable = (event) => { if (event.data.size) state.chunks.push(event.data); }; state.media.onstop = () => finishRecording(context);
    state.media.start(); state.recordingRequesting = false; rerenderRecordingSurfaces();
  } catch (error) {
    state.stream?.getTracks().forEach((track) => track.stop()); state.stream = null; state.media = null; state.recordingStopping = false; state.recordingTarget = ""; state.recordingKey = ""; state.recordingContext = null;
    state.recordingRequesting = false; rerenderRecordingSurfaces(); alert(`无法开始录音：${error.message}`);
  }
}
function stopRecording() {
  if (!state.media || state.recordingStopping) return;
  const media = state.media;
  if (media.state === "inactive") return;
  state.recordingStopping = true; media.stop(); state.stream?.getTracks().forEach((track) => track.stop()); state.stream = null;
  rerenderRecordingSurfaces();
}
async function finishRecording(context) {
  const { index, target, key, source, language } = context;
  state.recordingAssessing = true;
  state.media = null; state.recordingStopping = false; state.recordingTarget = "";
  const blob = new Blob(state.chunks, { type: state.chunks[0]?.type || "audio/webm" }); if (state.audioUrl) URL.revokeObjectURL(state.audioUrl); state.audioUrl = URL.createObjectURL(blob); state.audioTarget = target; state.audioKey = key;
  const durationMs = Math.max(1, Date.now() - state.recordingStarted);
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  const evidence = { index, target, durationSeconds: seconds, assessmentStatus: "pending", transcript: "", score: null };
  state.draft.recordingEvidence = state.draft.recordingEvidence.filter((x) => !(x.language === language && x.target === target)); state.draft.recordingEvidence.push({ ...evidence, language });
  state.draft.recordingSets[language] ||= { sentences: [], results: [], recordingEvidence: [] };
  const set = state.draft.recordingSets[language]; set.recordingEvidence = set.recordingEvidence.filter((x) => x.target !== target); set.recordingEvidence.push(evidence); markChanged();
  rerenderRecordingSurfaces();
  try {
    const query = new URLSearchParams({ target, language, durationMs: String(durationMs) });
    if (!blob.size) throw new Error("录音为空，请检查麦克风后重试");
    const { response, data } = await fetchWithTimeout(`${API}/assess?${query}`, { method: "POST", headers: { "content-type": blob.type || "audio/webm" }, body: blob }); if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
    const resultStatus = ["passed", "failed", "inconclusive", "technical_error", "manual_confirmed"].includes(data.status)
      ? data.status : data.assessmentInconclusive ? "inconclusive" : data.passed === true ? "passed" : "inconclusive";
    const result = {
      target,
      transcript: data.transcript || "",
      language,
      assessment: "cloudflare-whisper-v5-tristate",
      status: resultStatus,
      result: data.result || centralResult(resultStatus),
      errorType: data.errorType || centralResult(resultStatus),
      reasonCode: data.reasonCode || "",
      reason: data.reason || data.retryReason || "",
      matchScore: data.matchScore !== null && data.matchScore !== undefined && Number.isFinite(Number(data.matchScore)) ? Number(data.matchScore) : null,
      score: data.score !== null && data.score !== undefined && Number.isFinite(Number(data.score)) ? Number(data.score) : null,
      textScore: data.textScore,
      phoneticScore: data.phoneticScore,
      homophoneAccepted: data.homophoneAccepted === true,
      assessmentInconclusive: resultStatus === "inconclusive",
      retryRequired: resultStatus === "inconclusive",
      retryReason: data.reason || data.retryReason || "",
      readingTarget: data.readingTarget || "",
      readingTranscript: data.readingTranscript || "",
      passed: resultStatus === "passed" || resultStatus === "manual_confirmed",
    };
    state.draft.results = state.draft.results.filter((x) => !(x.language === language && x.target === target)); state.draft.results.push(result); set.results = set.results.filter((x) => x.target !== target); set.results.push(result);
    evidence.assessmentStatus = resultStatus; evidence.transcript = result.transcript; evidence.score = result.matchScore;
    savePronunciationAttempt(context, result);
    if (source === "carryover") {
      const record = exercise(`carry:${state.viewedDate}:${index}`, target);
      record.response = resultStatus === "passed" ? "已重新录音，朗读内容可靠匹配"
        : resultStatus === "failed" ? `已重新录音，读音仍有明确差异：${result.reason}`
          : resultStatus === "inconclusive" ? `已重新录音，但无法可靠判断：${result.reason}`
            : `已重新录音并可回放；识别出现技术问题：${result.reason}`;
    }
  } catch (error) {
    const result = {
      target, transcript: "", language, assessment: "cloudflare-whisper-v5-tristate",
      status: "technical_error", result: "technical_error", errorType: "technical_error",
      reasonCode: error.name === "TimeoutError" ? "request_timeout" : "request_failure", reason: `识别请求失败：${error.message}`,
      matchScore: null, score: null, assessmentInconclusive: false, retryRequired: false, passed: false,
    };
    state.draft.results = state.draft.results.filter((x) => !(x.language === language && x.target === target)); state.draft.results.push(result);
    set.results = set.results.filter((x) => x.target !== target); set.results.push(result);
    evidence.assessmentStatus = "technical_error"; evidence.transcript = ""; evidence.score = null;
    savePronunciationAttempt(context, result);
    if (source === "carryover") {
      const record = exercise(`carry:${state.viewedDate}:${index}`, target);
      record.response = "已重新录音并可回放；识别出现技术问题，不计为知识错误";
    }
  }
  const topEvidence = state.draft.recordingEvidence.find((item) => item.language === language && item.target === target);
  if (topEvidence) Object.assign(topEvidence, evidence, { language });
  state.recordingKey = ""; state.recordingContext = null; state.recordingIndex = -1;
  state.recordingAssessing = false;
  markChanged(); rerenderRecordingSurfaces();
}
function recordingBusy() {
  return Boolean(state.media) || state.recordingStopping || state.recordingRequesting || state.recordingAssessing || state.submitting;
}
async function fetchWithTimeout(url, options, timeoutMs = 30000, timeoutMessage = "识别超时，录音仍可回放；请稍后重试") {
  const controller = new AbortController();
  let timer;
  try {
    // Race as well as abort: recover even if a fetch implementation ignores its signal.
    return await Promise.race([
      fetch(url, { ...options, signal: controller.signal }).then(async (response) => ({ response, data: await response.json() })),
      new Promise((_, reject) => { timer = setTimeout(() => {
        const error = new Error(timeoutMessage); error.name = "TimeoutError";
        reject(error); controller.abort();
      }, timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}
function hasWork() {
  return state.draft.vocabularyProgress.some((x) => x.done) || state.draft.languageExercises.some((x) => x.response?.trim()) || state.draft.englishTasks.some((x) => x.done || x.userAnswer?.trim() || x.score?.trim()) || state.draft.recordingEvidence.length > 0;
}
async function submit() {
  if (recordingBusy() || state.dateLoading) { $("#submitStatus").textContent = "请等录音识别结束后再提交，避免漏掉本次结果。"; return; }
  if (!hasWork()) { $("#submitStatus").textContent = "请至少完成一项任务或录一条语音后再提交。"; return; }
  state.submitting = true;
  const button = $("#submit"); button.disabled = true; $("#submitStatus").textContent = "正在保存并提交…";
  rerenderRecordingSurfaces();
  try {
    await saveCloud();
    const version = state.draft.updatedAt;
    const { response, data } = await fetchWithTimeout(`${API}/submit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(state.draft) }, 30000, "提交响应超时，请检查保存状态后重试"); if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
    const unchanged = state.draft.updatedAt === version;
    if (unchanged) localStorage.setItem(`hsm-language-submitted:${state.viewedDate}`, "true");
    $("#submitStatus").textContent = `${data.message || "已提交。"}\n${data.reviewStatus || "晚间复盘只会要求补做未完成或未通过项目。"}${unchanged ? "" : "\n提交期间有新修改，请再次提交以包含补充内容。"}`; updateDashboard(); await loadFeedback();
  } catch (error) { $("#submitStatus").textContent = `提交失败：${error.message}。本机进度仍在，可稍后重试。`; } finally { state.submitting = false; button.disabled = false; rerenderRecordingSurfaces(); }
}
async function loadFeedback() {
  const date = state.viewedDate;
  try {
    const { response, data } = await fetchWithTimeout(`${API}/feedback?date=${date}`, { headers: { authorization: `Device ${state.deviceId}` }, cache: "no-store" }, 10000, "解析读取超时，请稍后重试");
    if (date !== state.viewedDate) return;
    const reports = response.ok && data.ok && Array.isArray(data.feedback) ? data.feedback : [];
    const items = reports.flatMap((report) => Array.isArray(report.items) ? report.items : [report]);
    $("#feedback").classList.toggle("hidden", !items.length); const root = $("#feedbackList"); root.replaceChildren();
    items.forEach((item) => {
      const card = el("div", { class: "feedback-card" }, el("h4", {}, item.title || "复盘反馈"));
      if (item.status) card.append(el("p", { class: "prose" }, item.status));
      for (const [field, label] of [["question", "原题与信息"], ["requirements", "题目要求"], ["reasoning", "解题过程"], ["referenceAnswer", "参考答案及说明"], ["comparison", "你的作答与修改"], ["video", "本题视频"], ["feedback", "反馈"], ["content", "反馈"]]) {
        if (typeof item[field] === "string" && item[field].trim()) card.append(el("h5", {}, label), el("p", { class: "prose" }, item[field]));
      }
      card.append(...externalLinks("解析来源", item.sources || [])); root.append(card);
    });
  } catch { if (date === state.viewedDate) $("#feedback").classList.add("hidden"); }
}
async function init() {
  state.deviceId = makeDeviceId();
  try {
    const response = await fetch(DATA_URL, { cache: "no-store" }); if (!response.ok) throw new Error(`HTTP ${response.status}`); state.catalog = await response.json();
    if (state.catalog.ielts.length !== 365 || state.catalog.japanese.length !== 365) throw new Error("年度数据不是完整 365 天");
    try {
      const extra = await fetchWithTimeout("external-exercises.json?v=20261004-official-materials-1", {cache:"no-store"}, 10000, "原题补充数据读取超时");
      if (!extra.response.ok || !Array.isArray(extra.data.packs) || !Array.isArray(extra.data.bindings)) throw new Error("原题补充数据无效");
      state.externalExercises = extra.data;
    } catch { state.externalExercisesError = true; }
    state.catalog.ielts.forEach((day) => state.byDate.ielts.set(day.date, day)); state.catalog.japanese.forEach((day) => state.byDate.japanese.set(day.date, day));
    const input = $("#date"); input.min = state.catalog.startDate; input.max = state.catalog.endDate; const today = isoLocalDate(); input.value = today < state.catalog.startDate ? state.catalog.startDate : today > state.catalog.endDate ? state.catalog.endDate : today;
    input.addEventListener("change", () => {
      if (recordingBusy() || state.dateLoading) { alert("请先结束录音并等待识别完成，再切换日期。"); input.value = state.viewedDate; return; }
      changeDate(input.value);
    }); $("#retrySave").addEventListener("click", saveCloud); $("#submit").addEventListener("click", submit); $("#closeQuiz").addEventListener("click", () => $("#quiz").close());
    $("#focusToggle").addEventListener("click", toggleFocusTimer); $("#focusReset").addEventListener("click", resetFocusTimer);
    await changeDate(input.value);
  } catch (error) { $("#loading").textContent = `年度课程加载失败：${error.message}`; $("#loading").className = "status bad"; setStatus("无法读取年度计划，页面没有使用旧德语数据。", "bad"); }
}

init();
