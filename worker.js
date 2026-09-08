const SITE_ORIGIN = "https://gkxicy.github.io";
const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": SITE_ORIGIN,
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-max-age": "86400",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}
function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
function validDeviceId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{16,100}$/.test(value);
}
function cleanText(value, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function cleanResults(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).map((item) => ({
    target: cleanText(item?.target, 300),
    transcript: cleanText(item?.transcript, 500),
    score: Number.isFinite(Number(item?.score))
      ? Math.max(0, Math.min(100, Math.round(Number(item.score)))) : null,
    passed: item?.passed === true,
  }));
}
function cleanRecordingEvidence(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).map((item) => ({
    index: Number.isInteger(Number(item?.index)) ? Math.max(0, Math.min(29, Number(item.index))) : 0,
    target: cleanText(item?.target, 300),
    durationSeconds: Number.isFinite(Number(item?.durationSeconds))
      ? Math.max(1, Math.min(600, Math.round(Number(item.durationSeconds)))) : 1,
  })).filter((item) => item.target);
}
function cleanSentencePractice(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 10).map((item) => ({
    word: cleanText(item?.word, 100),
    sentence: cleanText(item?.sentence, 600),
  })).filter((item) => item.word || item.sentence);
}
function cleanEnglishTasks(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map((item) => ({
    title: cleanText(item?.title, 160),
    score: cleanText(item?.score, 80),
    note: cleanText(item?.note, 600),
    done: item?.done === true,
  }));
}
function cleanDraft(body) {
  return {
    date: body.date, deviceId: body.deviceId, updatedAt: new Date().toISOString(),
    lessonTitle: cleanText(body.lessonTitle, 200), language: cleanText(body.language, 40),
    sentences: Array.isArray(body.sentences)
      ? body.sentences.slice(0, 30).map((item) => cleanText(item, 300)).filter(Boolean) : [],
    results: cleanResults(body.results), recordingEvidence: cleanRecordingEvidence(body.recordingEvidence),
    sentencePractice: cleanSentencePractice(body.sentencePractice),
    englishTasks: cleanEnglishTasks(body.englishTasks),
  };
}
function authorised(request, env) {
  return request.headers.get("authorization") === "Bearer " + env.REVIEW_TOKEN;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: JSON_HEADERS });
    if (request.method === "GET" && url.pathname === "/") return json({ ok: true, service: "hsm-pronunciation-api" });

    if (request.method === "GET" && url.pathname === "/draft") {
      const date = url.searchParams.get("date"), deviceId = url.searchParams.get("deviceId");
      if (!validDate(date) || !validDeviceId(deviceId)) return json({ ok: false, error: "日期或设备标识无效" }, 400);
      const draft = await env.PRONUNCIATION_REPORTS.get("draft:" + date + ":" + deviceId, "json");
      return json({ ok: true, draft });
    }
    if (request.method === "POST" && url.pathname === "/draft") {
      let body;
      try { body = await request.json(); } catch { return json({ ok: false, error: "请求内容不是有效 JSON" }, 400); }
      if (!validDate(body.date) || !validDeviceId(body.deviceId)) return json({ ok: false, error: "日期或设备标识无效" }, 400);
      const draft = cleanDraft(body);
      await env.PRONUNCIATION_REPORTS.put("draft:" + draft.date + ":" + draft.deviceId, JSON.stringify(draft), { expirationTtl: 60 * 60 * 24 * 180 });
      return json({ ok: true, updatedAt: draft.updatedAt });
    }
    if (request.method === "POST" && url.pathname === "/submit") {
      let body;
      try { body = await request.json(); } catch { return json({ ok: false, error: "请求内容不是有效 JSON" }, 400); }
      if (!validDate(body.date)) return json({ ok: false, error: "日期格式必须是 YYYY-MM-DD" }, 400);
      const results = cleanResults(body.results);
      const recordingEvidence = cleanRecordingEvidence(body.recordingEvidence);
      const sentencePractice = cleanSentencePractice(body.sentencePractice);
      const englishTasks = cleanEnglishTasks(body.englishTasks);
      if (!results.length && !recordingEvidence.length && !sentencePractice.length && !englishTasks.some((item) => item.done || item.score || item.note)) {
        return json({ ok: false, error: "请至少完成一条录音、造句或英语题目后再提交" }, 400);
      }
      const report = {
        id: crypto.randomUUID(), date: body.date, submittedAt: new Date().toISOString(),
        lessonTitle: cleanText(body.lessonTitle, 200), language: cleanText(body.language, 40),
        results, recordingEvidence, sentencePractice, englishTasks,
      };
      await env.PRONUNCIATION_REPORTS.put("report:" + report.date + ":" + report.id, JSON.stringify(report), { expirationTtl: 60 * 60 * 24 * 180 });
      return json({ ok: true, message: "已提交，今晚复盘会自动读取。", id: report.id });
    }
    if (request.method === "GET" && url.pathname === "/reports") {
      if (!authorised(request, env)) return json({ ok: false, error: "未授权" }, 401);
      const date = url.searchParams.get("date");
      if (!validDate(date)) return json({ ok: false, error: "日期格式必须是 YYYY-MM-DD" }, 400);
      const listed = await env.PRONUNCIATION_REPORTS.list({ prefix: "report:" + date + ":", limit: 100 });
      const reports = await Promise.all(listed.keys.map(async ({ name }) => {
        const raw = await env.PRONUNCIATION_REPORTS.get(name); return raw ? JSON.parse(raw) : null;
      }));
      return json({ ok: true, reports: reports.filter(Boolean).sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)) });
    }
    return json({ ok: false, error: "路径不存在" }, 404);
  },
};
