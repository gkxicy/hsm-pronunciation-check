import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// Execute the real browser script, excluding only automatic bootstrapping.
function app(overrides = {}) {
  const storage = new Map(), nodes = new Map();
  const sandbox = {
    console, URL, URLSearchParams, Blob, AbortController, Date,
    setTimeout, clearTimeout, setInterval, clearInterval,
    alert() {}, navigator: {}, window: {},
    document: { querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, { textContent: "", value: "", classList: { add() {}, remove() {} } });
      return nodes.get(selector);
    }, querySelectorAll: () => [] },
    localStorage: { getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    fetch: async () => ({ ok: true, json: async () => ({ ok: true }) }),
    ...overrides,
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(new URL("./app.js", import.meta.url), "utf8").replace(/\ninit\(\);\s*$/, ""), context);
  vm.runInContext(`
    rerenderRecordingSurfaces = () => {}; updateDashboard = () => {};
    state.deviceId = "test-device"; state.viewedDate = "2026-10-03"; state.sourceDate = "2026-09-15";
    state.draft = blankDraft(state.viewedDate);
    state.byDate.japanese.set(state.sourceDate, {day: "Day 1"});
    state.byDate.ielts.set(state.sourceDate, {day: "Day 1"});
  `, context);
  return { run: (code) => vm.runInContext(code, context), storage, nodes,
    cleanup: () => vm.runInContext("clearTimeout(state.saveTimer); clearInterval(state.focusInterval)", context) };
}

test("new focus timer starts at 45 minutes and preserves a completed session", () => {
  const a = app();
  for (const value of [null, "", "broken", "-1", "2701", "1.5"]) {
    if (value === null) a.storage.delete("hsm-language-focus:2026-10-03");
    else a.storage.set("hsm-language-focus:2026-10-03", value);
    a.run("loadFocusTimer()"); assert.equal(a.run("state.focusRemaining"), 2700);
  }
  for (const value of ["0", "1200"]) {
    a.storage.set("hsm-language-focus:2026-10-03", value);
    a.run("loadFocusTimer()"); assert.equal(a.run("state.focusRemaining"), Number(value));
  }
  a.cleanup();
});

test("each pronunciation retry retains its actual attempt history", () => {
  const a = app();
  a.run(`savePronunciationAttempt({index:0, source:"daily", language:"ja-JP"}, {status:"failed", transcript:"wrong"});
    savePronunciationAttempt({index:0, source:"daily", language:"ja-JP"}, {status:"manual_confirmed", transcript:"correct"});`);
  assert.equal(a.run("state.draft.attempts.length"), 2);
  assert.equal(a.run("state.draft.attempts[1].result"), "manual_confirmed");
  a.cleanup();
});

test("permission-pending recording rejects double start and date changes", async () => {
  let resolvePermission, requests = 0;
  class Recorder { start() { this.state = "recording"; } }
  const a = app({ navigator: { mediaDevices: { getUserMedia() {
    requests++; return new Promise((resolve) => { resolvePermission = resolve; });
  } } }, window: { MediaRecorder: Recorder }, MediaRecorder: Recorder });
  const recording = a.run('beginRecording(0, "あ", {language:"ja-JP"})');
  await a.run('beginRecording(1, "い", {language:"ja-JP"})');
  await a.run('changeDate("2026-10-04")');
  assert.equal(requests, 1);
  assert.equal(a.run("state.viewedDate"), "2026-10-03");
  resolvePermission({ getTracks: () => [{ stop() {} }] }); await recording;
  assert.equal(a.run("state.recordingRequesting"), false);
  assert.equal(a.run("state.media.state"), "recording"); a.cleanup();
});

test("pending assessment cannot migrate results to another day", async () => {
  let respond;
  const a = app({ fetch: () => new Promise((resolve) => { respond = resolve; }) });
  a.run('state.chunks = [new Blob(["audio"])]; state.recordingStarted = Date.now() - 1000;');
  const assessment = a.run('finishRecording({index:0, target:"あ", key:"daily:ja-JP:0", source:"daily", language:"ja-JP"})');
  assert.equal(a.run("state.recordingAssessing"), true);
  await a.run('changeDate("2026-10-04")');
  assert.equal(a.run("state.viewedDate"), "2026-10-03");
  respond({ ok: true, json: async () => ({ ok: true, status: "passed", transcript: "あ" }) }); await assessment;
  assert.equal(a.run("state.draft.results[0].status"), "passed");
  assert.equal(a.run("state.recordingAssessing"), false); a.cleanup();
});

test("assessment timeout also covers stalled response bodies and aborts upload", async () => {
  let signal;
  const a = app({ fetch: async (_, options) => { signal = options.signal;
    return { json: () => new Promise(() => {}) }; } });
  await assert.rejects(a.run('fetchWithTimeout("https://test", {}, 10)'), { name: "TimeoutError" });
  assert.equal(signal.aborted, true); a.cleanup();
});

test("empty recording and ambiguous legacy API payload never become knowledge errors", async () => {
  for (const empty of [true, false]) {
    const a = app({ fetch: async () => ({ ok: true, json: async () => ({ ok: true, passed: false }) }) });
    a.run(`state.chunks = ${empty ? "[]" : '[new Blob(["audio"])]'}; state.recordingStarted = Date.now();`);
    await a.run('finishRecording({index:0, target:"あ", key:"daily:ja-JP:0", source:"daily", language:"ja-JP"})');
    assert.equal(a.run("state.draft.results[0].status"), empty ? "technical_error" : "inconclusive");
    assert.notEqual(a.run("state.draft.attempts[0].result"), "knowledge_error"); a.cleanup();
  }
});

test("editing submitted work makes it pending submission again; legacy partial tasks stay readable", () => {
  const a = app(); a.storage.set("hsm-language-submitted:2026-10-03", "true");
  a.run('state.draft.englishTasks = [{title:"legacy"}]; state.draft.languageExercises = [{id:"legacy"}];');
  assert.equal(a.run("hasWork()"), false);
  a.run("markChanged()"); assert.equal(a.storage.has("hsm-language-submitted:2026-10-03"), false); a.cleanup();
});

test("late draft-save response cannot overwrite the status of a newer edit", async () => {
  let respond;
  const a = app({ fetch: () => new Promise((resolve) => { respond = resolve; }) });
  a.run('state.draft.updatedAt = "old"'); const saved = a.run("saveCloud()");
  a.run('state.draft.updatedAt = "new"; $("#saveState").textContent = "new edit pending"');
  respond({ ok: true, json: async () => ({ ok: true }) }); await saved;
  assert.equal(a.nodes.get("#saveState").textContent, "new edit pending"); a.cleanup();
});

test("submission blocks day changes and does not mark later edits as submitted", async () => {
  let respond;
  const a = app({ fetch: async (url) => url.endsWith("/submit")
    ? new Promise((resolve) => { respond = resolve; })
    : { ok: true, json: async () => ({ ok: true }) } });
  a.run('loadFeedback = async () => {}; state.draft.languageExercises = [{response:"original answer"}]; state.draft.updatedAt = "original";');
  const submission = a.run("submit()");
  await new Promise(setImmediate);
  assert.equal(a.run("state.submitting"), true);
  await a.run('changeDate("2026-10-04")');
  assert.equal(a.run("state.viewedDate"), "2026-10-03");
  a.run('state.draft.updatedAt = "new edit";');
  respond({ ok: true, json: async () => ({ ok: true }) }); await submission;
  assert.equal(a.storage.has("hsm-language-submitted:2026-10-03"), false);
  assert.match(a.nodes.get("#submitStatus").textContent, /提交期间有新修改/);
  assert.equal(a.run("state.submitting"), false); a.cleanup();
});
