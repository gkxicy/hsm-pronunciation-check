"use strict";

const API = "https://hsm-pronunciation-api.huangsm666.workers.dev";
const DATA_URL = "annual-language-data.json?v=20260915-annual-4";
const DEVICE_KEY = "hsm-pronunciation-device-v1";
const LOCAL_PREFIX = "hsm-annual-language-draft:";
const $ = (selector) => document.querySelector(selector);

const state = {
  catalog: null,
  byDate: { ielts: new Map(), japanese: new Map() },
  viewedDate: "",
  sourceDate: "",
  plan: null,
  draft: null,
  deviceId: "",
  saveTimer: null,
  media: null,
  stream: null,
  chunks: [],
  recordingStarted: 0,
  recordingIndex: -1,
  recordingTarget: "",
  recordingStopping: false,
  audioUrl: "",
  audioTarget: "",
  quiz: null,
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
    recordingEvidence: [], vocabularyProgress: [], languageExercises: [], sentencePractice: [], englishTasks: [],
    recordingSets: { "ja-JP": { sentences: [], results: [], recordingEvidence: [] } }, updatedAt: "",
  };
}
function normalizeDraft(value, date) {
  const base = blankDraft(date);
  if (!value || typeof value !== "object") return base;
  for (const key of ["results", "recordingEvidence", "vocabularyProgress", "languageExercises", "sentencePractice", "englishTasks"])
    base[key] = Array.isArray(value[key]) ? value[key] : [];
  base.recordingSets = value.recordingSets && typeof value.recordingSets === "object" ? value.recordingSets : base.recordingSets;
  base.updatedAt = value.updatedAt || "";
  return base;
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
function markChanged() {
  state.draft.updatedAt = new Date().toISOString();
  localStorage.setItem(localKey(), JSON.stringify(state.draft));
  $("#saveState").textContent = "已暂存在本机；正在同步 Cloudflare…";
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(saveCloud, 750);
}
async function saveCloud() {
  clearTimeout(state.saveTimer);
  try {
    const response = await fetch(`${API}/draft`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(state.draft) });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
    $("#saveState").textContent = "已保存到本机和 Cloudflare。";
  } catch (error) {
    $("#saveState").textContent = `本机已保存；Cloudflare 暂存失败：${error.message}`;
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
  $("#saveState").textContent = newest ? "已恢复此前暂存的进度。" : "尚无暂存进度；填写后会自动保存。";
}
async function loadPlan() {
  state.plan = null;
  try {
    const response = await fetch(`${API}/plan?date=${state.viewedDate}`, { cache: "no-store" });
    const data = await response.json();
    if (response.ok && data.ok && data.plan
      && state.byDate.ielts.has(data.plan.sourceDate)
      && state.byDate.japanese.has(data.plan.sourceDate)) state.plan = data.plan;
  } catch { /* Annual source remains usable offline. */ }
  state.sourceDate = state.plan?.sourceDate || state.viewedDate;
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
function responseField(id, label, prompt, placeholder = "先独立完成，再查看解析") {
  const record = exercise(id, prompt);
  const input = el("textarea", { placeholder }, record.response);
  input.value = record.response;
  input.addEventListener("input", () => { record.response = input.value; markChanged(); });
  return el("div", { class: "field" }, el("label", {}, label, el("small", {}, "输入会自动暂存"), input));
}
function doneLine(id, prompt, label = "已完成") {
  const record = exercise(id, prompt);
  const input = el("input", { type: "checkbox", checked: record.response === "已完成" });
  input.addEventListener("change", () => { record.response = input.checked ? "已完成" : ""; markChanged(); });
  return el("label", { class: "checkline" }, input, label);
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
  root.append(section("中文课程 / 讲解", course.course, [externalLink("打开当天讲解", course.courseUrl)]));
  root.append(renderVocabulary(course, "en-US", "英语"));
  const check = section("5 分钟闭卷验收", course.check);
  check.append(responseField(`ielts:${course.date}:check`, "你的口头验收记录", course.check, "记下答不上来的点；不必重复抄题")); root.append(check);
  const practice = section("今日原创练习", course.practice);
  practice.append(responseField(`ielts:${course.date}:practice`, "你的答案", course.practice));
  practice.append(answerDetails(course.explanation)); root.append(practice);
  const official = section("配套 / 官方练习", course.officialTask, [externalLink("打开原题或练习", course.officialUrl)]);
  const task = englishTask(course.officialTask);
  const done = el("input", { type: "checkbox", checked: task.done });
  done.addEventListener("change", () => { task.done = done.checked; markChanged(); });
  const score = el("input", { placeholder: "例如 7/10", value: task.score }); score.value = task.score;
  score.addEventListener("input", () => { task.score = score.value; markChanged(); });
  const answer = el("textarea", { placeholder: "粘贴或填写你实际提交的答案" }); answer.value = task.userAnswer;
  answer.addEventListener("input", () => { task.userAnswer = answer.value; markChanged(); });
  const evidence = el("textarea", { placeholder: "题号、原文/音频定位、错因；晚间复盘会根据你的实际答案批改" }); evidence.value = task.evidence;
  evidence.addEventListener("input", () => { task.evidence = evidence.value; markChanged(); });
  official.append(el("label", { class: "checkline" }, done, "已完成原题"), el("div", { class: "field" }, el("label", {}, "得分", score)), el("div", { class: "field" }, el("label", {}, "你的实际答案", answer)), el("div", { class: "field" }, el("label", {}, "错题定位 / 证据", evidence)));
  root.append(official, section("今日完成标准", course.standard));
}
function japaneseLines(course) {
  const kana = (course.pronunciation.match(/[ぁ-んァ-ヶー]{1,}/g) || []);
  return [...new Set([...kana, ...course.vocabulary.map(([word]) => word)])].slice(0, 20);
}
function renderRecording(course) {
  const lines = japaneseLines(course);
  state.draft.recordingSets["ja-JP"] ||= { sentences: [], results: [], recordingEvidence: [] };
  state.draft.recordingSets["ja-JP"].sentences = lines;
  const sectionEl = el("section", { class: "section" }, el("h3", {}, "日语跟读录音与回放"), el("p", { class: "prose" }, "先听参考音，再任选一项录音。你读完后手动停止，页面会立即提供自己的录音回放；识别服务失败也会记作已朗读。"));
  const statusText = state.recordingStopping
    ? "正在结束录音并生成回放…"
    : state.media
      ? `正在录音：${state.recordingTarget}。读完后请点击当前句子的红色结束按钮。`
      : state.audioUrl
        ? "录音已完成，回放就在刚才录制的句子下面。"
        : "请选择任意一句，点击“开始录音”。";
  sectionEl.append(el("div", { id: "recordStatus", class: `record-status ${state.media || state.recordingStopping ? "active" : ""}` }, statusText));
  const list = el("div", { class: "record-list" });
  lines.forEach((line, index) => {
    const result = state.draft.results.find((item) => item.language === "ja-JP" && item.target === line);
    const isCurrentRecording = Boolean(state.media) && state.recordingIndex === index;
    const isCurrentStopping = state.recordingStopping && state.recordingIndex === index;
    const recordButton = el("button", {
      type: "button",
      class: isCurrentRecording || isCurrentStopping ? "record-stop" : "",
      onclick: isCurrentRecording ? stopRecording : () => beginRecording(index, line),
    }, isCurrentStopping ? "正在生成回放…" : isCurrentRecording ? "■ 结束录音并生成回放" : "开始录音");
    recordButton.disabled = isCurrentStopping || (Boolean(state.media) && !isCurrentRecording);
    const listenButton = el("button", { type: "button", class: "secondary", onclick: () => speak(line, "ja-JP") }, "听参考音");
    listenButton.disabled = Boolean(state.media) || state.recordingStopping;
    const row = el("div", { class: `record-line ${state.recordingIndex === index ? "current" : ""} ${isCurrentRecording || isCurrentStopping ? "recording" : ""}` },
      el("b", {}, `${index + 1}. ${line}`),
      el("div", {}, result ? `识别：${result.transcript || "评分暂不可用"}${result.score == null ? "" : `｜${result.score}%`}` : "尚未录音"),
      el("div", { class: "buttons" }, listenButton, recordButton));
    if (state.audioUrl && state.audioTarget === line) row.append(el("div", { class: "record-playback" }, el("strong", {}, "你的录音回放"), el("audio", { controls: "", src: state.audioUrl })));
    list.append(row);
  });
  sectionEl.append(list);
  return sectionEl;
}
function renderJapanese(course) {
  const root = $("#japanese"); root.replaceChildren();
  root.append(el("header", { class: "course-head" }, el("small", {}, `${course.day} · ${course.stage}`), el("h2", {}, "日语 N2 路线"), el("p", {}, `${course.duration}｜从五十音开始，按年度表逐日推进。`)));
  root.append(section("今日假名 / 发音", course.pronunciation), section("今日学习任务", course.task), section("当天视频课程", course.course, [externalLink("打开当天视频", course.courseUrl)]));
  root.append(renderVocabulary(course, "ja-JP", "日语"));
  const check = section("快速闭卷验收", course.check); check.append(responseField(`japanese:${course.date}:check`, "你的验收记录", course.check)); root.append(check);
  const practice = section("今日原创练习题", course.practice); practice.append(responseField(`japanese:${course.date}:practice`, "你的答案", course.practice), answerDetails(course.explanation)); root.append(practice);
  const official = section("JLPT / 官方题", course.officialTask, [externalLink("打开官方题", course.officialUrl)]); official.append(doneLine(`japanese:${course.date}:official`, course.officialTask), responseField(`japanese:${course.date}:official-notes`, "答案 / 错题记录", course.officialTask, "完成正式题后填写"), answerDetails(course.officialExplanation, "完成后查看官方正答 / 解析说明")); root.append(official);
  const reading = section("阅读", course.reading, [externalLink("打开阅读材料", course.readingUrl)]); reading.append(doneLine(`japanese:${course.date}:reading`, course.reading)); root.append(reading);
  const listening = section("听力", course.listening, [externalLink("打开音频", course.audioUrl), externalLink("打开听力题册", course.listeningBookUrl)]); listening.append(doneLine(`japanese:${course.date}:listening`, course.listening)); root.append(listening);
  root.append(renderRecording(course));
}
function renderCarryover() {
  const items = Array.isArray(state.plan?.carryover) ? state.plan.carryover : [];
  const root = $("#carryover"), list = $("#carryList"); list.replaceChildren();
  root.classList.toggle("hidden", !items.length);
  items.forEach((item, index) => {
    const card = el("div", { class: "carry-card" }, el("h3", {}, item.title), el("p", { class: "prose" }, item.feedback));
    card.append(responseField(`carry:${state.viewedDate}:${index}`, "本次补做答案 / 结果", item.title));
    list.append(card);
  });
}
function render() {
  const ielts = state.byDate.ielts.get(state.sourceDate), japanese = state.byDate.japanese.get(state.sourceDate);
  const repeatOnly = state.plan?.action === "repeat" && (state.plan.carryover?.length || 0) > 0;
  renderCarryover();
  $("#loading").classList.add("hidden"); $("#courses").classList.toggle("hidden", repeatOnly || !ielts || !japanese); $("#submitArea").classList.remove("hidden");
  if (!ielts || !japanese) {
    setStatus(`所选日期不在年度计划范围内（${state.catalog.startDate} 至 ${state.catalog.endDate}）。`, "bad"); return;
  }
  if (!repeatOnly) { renderIelts(ielts); renderJapanese(japanese); }
  state.draft.lessonTitle = `${state.sourceDate} · 雅思 ${ielts.day} + 日语 ${japanese.day}`;
  if (repeatOnly) setStatus(`昨晚未通过项目较多：今天只重做列出的未通过项目；已经完成的作业不重做。\n原因：${state.plan.reason || "根据晚间复盘调整"}`, "warn");
  else if (state.plan?.carryover?.length) setStatus(`今天进入 ${state.sourceDate} 的新内容，并追加 ${state.plan.carryover.length} 个少量补练项目。已通过内容不重做。`, "warn");
  else setStatus(`正在学习年度计划 ${state.sourceDate}：雅思 ${ielts.day} + 日语 ${japanese.day}。页面内容来自两份 365 天表格。`);
  loadFeedback();
}
async function changeDate(date) {
  if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
  state.viewedDate = date; state.sourceDate = date; state.audioUrl = ""; state.audioTarget = ""; state.recordingIndex = -1;
  $("#loading").classList.remove("hidden"); $("#courses").classList.add("hidden"); $("#submitArea").classList.add("hidden");
  await Promise.all([loadPlan(), loadDraft()]); render();
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
  markChanged(); $("#quizResult").textContent = `本轮得分：${quiz.correct}/${quiz.items.length}。错题已自动保存。`; $("#checkQuiz").textContent = "关闭"; $("#checkQuiz").onclick = () => $("#quiz").close();
}
function speak(text, language) {
  if (!window.speechSynthesis) { alert("当前浏览器不支持系统语音合成。"); return; }
  speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = language; utterance.rate = language === "ja-JP" ? .82 : .9;
  const voices = speechSynthesis.getVoices(); const exact = voices.find((voice) => voice.lang.toLowerCase() === language.toLowerCase()) || voices.find((voice) => voice.lang.toLowerCase().startsWith(language.slice(0, 2).toLowerCase())); if (exact) utterance.voice = exact;
  speechSynthesis.speak(utterance);
}
async function beginRecording(index, target) {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { alert("当前浏览器不支持网页录音，请使用最新版 Chrome/Edge。 "); return; }
  if (state.media || state.recordingStopping) return;
  try {
    window.speechSynthesis?.cancel(); document.querySelectorAll("audio").forEach((audio) => audio.pause());
    state.stream = await navigator.mediaDevices.getUserMedia({ audio: true }); state.chunks = []; state.recordingIndex = index; state.recordingTarget = target; state.recordingStarted = Date.now(); state.recordingStopping = false;
    state.media = new MediaRecorder(state.stream); state.media.ondataavailable = (event) => { if (event.data.size) state.chunks.push(event.data); }; state.media.onstop = () => finishRecording(target);
    state.media.start(); renderJapanese(state.byDate.japanese.get(state.sourceDate));
  } catch (error) {
    state.stream?.getTracks().forEach((track) => track.stop()); state.stream = null; state.media = null; state.recordingStopping = false; state.recordingTarget = "";
    alert(`无法开始录音：${error.message}`);
  }
}
function stopRecording() {
  if (!state.media || state.recordingStopping) return;
  const media = state.media;
  if (media.state === "inactive") return;
  state.recordingStopping = true; media.stop(); state.stream?.getTracks().forEach((track) => track.stop()); state.stream = null;
  renderJapanese(state.byDate.japanese.get(state.sourceDate));
}
async function finishRecording(target) {
  state.media = null; state.recordingStopping = false; state.recordingTarget = "";
  const blob = new Blob(state.chunks, { type: state.chunks[0]?.type || "audio/webm" }); if (state.audioUrl) URL.revokeObjectURL(state.audioUrl); state.audioUrl = URL.createObjectURL(blob); state.audioTarget = target;
  const seconds = Math.max(1, Math.round((Date.now() - state.recordingStarted) / 1000));
  const evidence = { index: state.recordingIndex, target, durationSeconds: seconds, assessmentStatus: "pending", transcript: "", score: null };
  state.draft.recordingEvidence = state.draft.recordingEvidence.filter((x) => !(x.language === "ja-JP" && x.target === target)); state.draft.recordingEvidence.push({ ...evidence, language: "ja-JP" });
  const set = state.draft.recordingSets["ja-JP"]; set.recordingEvidence = set.recordingEvidence.filter((x) => x.target !== target); set.recordingEvidence.push(evidence); markChanged();
  renderJapanese(state.byDate.japanese.get(state.sourceDate));
  const status = $("#recordStatus"); if (status) status.textContent = "录音已完成，可以立即回放；正在请求日语识别评分…";
  try {
    const query = new URLSearchParams({ target, language: "ja-JP" });
    const response = await fetch(`${API}/assess?${query}`, { method: "POST", headers: { "content-type": blob.type || "audio/webm" }, body: blob }); const data = await response.json(); if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
    const result = { target, transcript: data.transcript || "", language: "ja-JP", assessment: "cloudflare-whisper-v4-japanese", score: data.score, textScore: data.textScore, phoneticScore: null, homophoneAccepted: false, passed: data.score >= 70 };
    state.draft.results = state.draft.results.filter((x) => !(x.language === "ja-JP" && x.target === target)); state.draft.results.push(result); set.results = set.results.filter((x) => x.target !== target); set.results.push(result);
    evidence.assessmentStatus = "completed"; evidence.transcript = result.transcript; evidence.score = result.score;
  } catch (error) { evidence.assessmentStatus = "unavailable"; evidence.transcript = ""; evidence.score = null; }
  const topEvidence = state.draft.recordingEvidence.find((item) => item.language === "ja-JP" && item.target === target);
  if (topEvidence) Object.assign(topEvidence, evidence, { language: "ja-JP" });
  markChanged(); renderJapanese(state.byDate.japanese.get(state.sourceDate));
}
function hasWork() {
  return state.draft.vocabularyProgress.some((x) => x.done) || state.draft.languageExercises.some((x) => x.response.trim()) || state.draft.englishTasks.some((x) => x.done || x.userAnswer.trim() || x.score.trim()) || state.draft.recordingEvidence.length > 0;
}
async function submit() {
  if (!hasWork()) { $("#submitStatus").textContent = "请至少完成一项任务或录一条语音后再提交。"; return; }
  await saveCloud(); const button = $("#submit"); button.disabled = true; $("#submitStatus").textContent = "正在提交…";
  try {
    const response = await fetch(`${API}/submit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(state.draft) }); const data = await response.json(); if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
    $("#submitStatus").textContent = `${data.message || "已提交。"}\n${data.reviewStatus || "晚间复盘只会要求补做未完成或未通过项目。"}`; await loadFeedback();
  } catch (error) { $("#submitStatus").textContent = `提交失败：${error.message}。本机进度仍在，可稍后重试。`; } finally { button.disabled = false; }
}
async function loadFeedback() {
  try {
    const response = await fetch(`${API}/feedback?date=${state.viewedDate}`, { headers: { authorization: `Device ${state.deviceId}` }, cache: "no-store" }); const data = await response.json();
    const items = response.ok && data.ok && Array.isArray(data.feedback) ? data.feedback : []; $("#feedback").classList.toggle("hidden", !items.length); const root = $("#feedbackList"); root.replaceChildren();
    items.forEach((item) => root.append(el("div", { class: "feedback-card" }, el("h4", {}, item.title || "复盘反馈"), el("p", {}, item.feedback || item.content || JSON.stringify(item)))));
  } catch { $("#feedback").classList.add("hidden"); }
}
async function init() {
  state.deviceId = makeDeviceId();
  try {
    const response = await fetch(DATA_URL, { cache: "no-store" }); if (!response.ok) throw new Error(`HTTP ${response.status}`); state.catalog = await response.json();
    if (state.catalog.ielts.length !== 365 || state.catalog.japanese.length !== 365) throw new Error("年度数据不是完整 365 天");
    state.catalog.ielts.forEach((day) => state.byDate.ielts.set(day.date, day)); state.catalog.japanese.forEach((day) => state.byDate.japanese.set(day.date, day));
    const input = $("#date"); input.min = state.catalog.startDate; input.max = state.catalog.endDate; const today = isoLocalDate(); input.value = today < state.catalog.startDate ? state.catalog.startDate : today > state.catalog.endDate ? state.catalog.endDate : today;
    input.addEventListener("change", () => {
      if (state.media) { alert("请先停止当前录音，再切换日期。"); input.value = state.viewedDate; return; }
      changeDate(input.value);
    }); $("#retrySave").addEventListener("click", saveCloud); $("#submit").addEventListener("click", submit); $("#closeQuiz").addEventListener("click", () => $("#quiz").close());
    await changeDate(input.value);
  } catch (error) { $("#loading").textContent = `年度课程加载失败：${error.message}`; $("#loading").className = "status bad"; setStatus("无法读取年度计划，页面没有使用旧德语数据。", "bad"); }
}

init();
