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
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}
function normalizeSpeech(value) {
  return cleanText(value, 600).toLocaleLowerCase()
    .replace(/[.,!?;:'"，。！？；：\[\]()]/g, "")
    .replace(/ß/g, "ss").replace(/\s+/g, " ").trim();
}
function tokenSimilarity(expectedTokens, heardTokens, substitutionCost) {
  const a = expectedTokens;
  const b = heardTokens;
  if (!a.length || !b.length) return 0;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(
      d[i - 1][j] + 1,
      d[i][j - 1] + 1,
      d[i - 1][j - 1] + substitutionCost(a[i - 1], b[j - 1]),
    );
  }
  return Math.max(0, Math.round((1 - d[a.length][b.length] / Math.max(a.length, b.length)) * 100));
}
function germanPhoneticCode(value) {
  const letters = cleanText(value, 100).toLocaleUpperCase("de-DE")
    .replace(/Ä/g, "A").replace(/Ö/g, "O").replace(/Ü/g, "U")
    .replace(/[^A-Z]/g, "");
  let output = "", lastCode = "/", lastLetter = "-";
  const put = (code) => {
    const accepted = code !== "-", nonZero = code !== "0";
    if (accepted && lastCode !== code && (nonZero || output.length === 0)) output += code;
    if (accepted && nonZero) lastCode = code;
  };
  for (let index = 0; index < letters.length; index++) {
    const letter = letters[index], next = letters[index + 1] || "-";
    if ("AEIJOUY".includes(letter)) put("0");
    else if (letter === "B" || (letter === "P" && next !== "H")) put("1");
    else if ("DT".includes(letter) && !"CSZ".includes(next)) put("2");
    else if ("FPVW".includes(letter)) put("3");
    else if ("GKQ".includes(letter)) put("4");
    else if (letter === "X" && !"CKQ".includes(lastLetter)) { put("4"); put("8"); }
    else if ("SZ".includes(letter)) put("8");
    else if (letter === "C") {
      if (!output.length) put("AHKLOQRUX".includes(next) ? "4" : "8");
      else put("SZ".includes(lastLetter) || !"AHKOQUX".includes(next) ? "8" : "4");
    } else if ("DTX".includes(letter)) put("8");
    else if (letter === "R") put("7");
    else if (letter === "L") put("5");
    else if ("MN".includes(letter)) put("6");
    else if (letter === "H") put("-");
    lastLetter = letter;
  }
  return output;
}
function scoreSpeech(expected, heard, language) {
  const a = normalizeSpeech(expected).split(" ").filter(Boolean);
  const b = normalizeSpeech(heard).split(" ").filter(Boolean);
  const textScore = tokenSimilarity(a, b, (left, right) => left === right ? 0 : 1);
  if (!language.startsWith("de")) return { score: textScore, textScore, phoneticScore: null, homophoneAccepted: false };
  const phoneticScore = tokenSimilarity(a, b, (left, right) => {
    if (left === right) return 0;
    const leftCode = germanPhoneticCode(left), rightCode = germanPhoneticCode(right);
    return leftCode && leftCode === rightCode ? 0 : 1;
  });
  return {
    score: Math.max(textScore, phoneticScore), textScore, phoneticScore,
    homophoneAccepted: phoneticScore > textScore,
  };
}
function cleanResults(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).map((item) => ({
    target: cleanText(item?.target, 300),
    transcript: cleanText(item?.transcript, 500),
    language: /^(de-DE|en-US)$/.test(item?.language) ? item.language : "",
    assessment: ["cloudflare-whisper-v2-unbiased", "cloudflare-whisper-v3-phonetic"].includes(item?.assessment)
      ? item.assessment : "",
    score: Number.isFinite(Number(item?.score))
      ? Math.max(0, Math.min(100, Math.round(Number(item.score)))) : null,
    textScore: Number.isFinite(Number(item?.textScore))
      ? Math.max(0, Math.min(100, Math.round(Number(item.textScore)))) : null,
    phoneticScore: Number.isFinite(Number(item?.phoneticScore))
      ? Math.max(0, Math.min(100, Math.round(Number(item.phoneticScore)))) : null,
    homophoneAccepted: item?.homophoneAccepted === true,
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
    assessmentStatus: ["pending", "completed", "unavailable"].includes(item?.assessmentStatus)
      ? item.assessmentStatus : "unavailable",
    transcript: cleanText(item?.transcript, 500),
    score: Number.isFinite(Number(item?.score))
      ? Math.max(0, Math.min(100, Math.round(Number(item.score)))) : null,
  })).filter((item) => item.target);
}
function cleanVocabularyProgress(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).map((item) => ({ word: cleanText(item?.word, 100), done: item?.done === true }));
}
function cleanLanguageExercises(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map((item) => ({
    prompt: cleanText(item?.prompt, 300), response: cleanText(item?.response, 1500), answer: cleanText(item?.answer, 300),
  })).filter((item) => item.prompt || item.response);
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
    userAnswer: cleanText(item?.userAnswer, 500),
    correctAnswer: cleanText(item?.correctAnswer, 500),
    evidence: cleanText(item?.evidence, 1200),
  }));
}
function cleanDraft(body) {
  return {
    date: body.date, deviceId: body.deviceId, updatedAt: new Date().toISOString(),
    lessonTitle: cleanText(body.lessonTitle, 200), language: cleanText(body.language, 40),
    sentences: Array.isArray(body.sentences)
      ? body.sentences.slice(0, 30).map((item) => cleanText(item, 300)).filter(Boolean) : [],
    results: cleanResults(body.results), recordingEvidence: cleanRecordingEvidence(body.recordingEvidence),
    vocabularyProgress: cleanVocabularyProgress(body.vocabularyProgress),
    languageExercises: cleanLanguageExercises(body.languageExercises),
    sentencePractice: cleanSentencePractice(body.sentencePractice),
    englishTasks: cleanEnglishTasks(body.englishTasks),
  };
}
function authorised(request, env) {
  return request.headers.get("authorization") === "Bearer " + env.REVIEW_TOKEN;
}
function cleanPlan(value) {
  if (!validDate(value?.date) || !validDate(value?.sourceDate)) return null;
  return {
    version: 1,
    date: value.date,
    sourceDate: value.sourceDate,
    action: value.action === "advance" ? "advance" : "repeat",
    reason: cleanText(value.reason, 240),
    updatedAfterReviewOf: validDate(value.updatedAfterReviewOf) ? value.updatedAfterReviewOf : "",
    updatedAt: cleanText(value.updatedAt, 60) || new Date().toISOString(),
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: JSON_HEADERS });
    if (request.method === "GET" && url.pathname === "/") return json({ ok: true, service: "hsm-pronunciation-api" });

    if (request.method === "GET" && url.pathname === "/plan") {
      const date = url.searchParams.get("date");
      if (!validDate(date)) return json({ ok: false, error: "日期格式必须是 YYYY-MM-DD" }, 400);
      const plan = await env.PRONUNCIATION_REPORTS.get("plan:" + date, "json");
      return json({ ok: true, plan });
    }
    if (request.method === "POST" && url.pathname === "/plan") {
      if (!authorised(request, env)) return json({ ok: false, error: "未授权" }, 401);
      let body;
      try { body = await request.json(); } catch { return json({ ok: false, error: "请求内容不是有效 JSON" }, 400); }
      const plan = cleanPlan(body);
      if (!plan) return json({ ok: false, error: "计划日期无效" }, 400);
      await env.PRONUNCIATION_REPORTS.put("plan:" + plan.date, JSON.stringify(plan), { expirationTtl: 60 * 60 * 24 * 365 });
      return json({ ok: true, plan });
    }

    if (request.method === "POST" && url.pathname === "/assess") {
      const target = cleanText(url.searchParams.get("target"), 300);
      const language = cleanText(url.searchParams.get("language"), 10);
      if (!target || !/^(de-DE|en-US)$/.test(language)) return json({ ok: false, error: "目标句或语言无效" }, 400);
      if (!env.AI) return json({ ok: false, error: "Cloudflare Worker 尚未绑定 Workers AI（变量名必须为 AI）" }, 503);
      const declaredSize = Number(request.headers.get("content-length") || 0);
      if (declaredSize > 5 * 1024 * 1024) return json({ ok: false, error: "录音超过 5MB，请缩短后重试" }, 413);
      const audio = await request.arrayBuffer();
      if (!audio.byteLength) return json({ ok: false, error: "没有收到录音数据" }, 400);
      if (audio.byteLength > 5 * 1024 * 1024) return json({ ok: false, error: "录音超过 5MB，请缩短后重试" }, 413);
      try {
        const forcedLanguage = language.startsWith("de") ? "de" : "en";
        const transcription = await env.AI.run("@cf/openai/whisper-large-v3-turbo", {
          audio: arrayBufferToBase64(audio),
          task: "transcribe",
          language: forcedLanguage,
          vad_filter: true,
          condition_on_previous_text: false,
        });
        const transcript = cleanText(transcription?.text, 500);
        const assessment = scoreSpeech(target, transcript, language);
        return json({
          ok: true, transcript, score: assessment.score, passed: assessment.score >= 75,
          textScore: assessment.textScore, phoneticScore: assessment.phoneticScore,
          homophoneAccepted: assessment.homophoneAccepted,
          language: forcedLanguage, model: "@cf/openai/whisper-large-v3-turbo",
          scoring: language.startsWith("de")
            ? "german-phonetic-or-recognized-text-v3" : "recognized-content-similarity-v3",
        });
      } catch (error) {
        return json({ ok: false, error: "语音识别服务失败：" + cleanText(error?.message, 180) }, 502);
      }
    }

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
      const vocabularyProgress = cleanVocabularyProgress(body.vocabularyProgress);
      const languageExercises = cleanLanguageExercises(body.languageExercises);
      const sentencePractice = cleanSentencePractice(body.sentencePractice);
      const englishTasks = cleanEnglishTasks(body.englishTasks);
      if (!results.length && !recordingEvidence.length && !vocabularyProgress.some((item) => item.done)
        && !languageExercises.some((item) => item.response) && !sentencePractice.some((item) => item.sentence)
        && !englishTasks.some((item) => item.done || item.score || item.note || item.userAnswer || item.correctAnswer)) {
        return json({ ok: false, error: "请至少完成一条词汇、课内练习、录音、造句或英语题目后再提交" }, 400);
      }
      const report = {
        id: crypto.randomUUID(), date: body.date, submittedAt: new Date().toISOString(),
        lessonTitle: cleanText(body.lessonTitle, 200), language: cleanText(body.language, 40),
        results, recordingEvidence, vocabularyProgress, languageExercises, sentencePractice, englishTasks,
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

export { germanPhoneticCode, scoreSpeech };
