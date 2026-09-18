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
function normalizeJapanese(value) {
  return cleanText(value, 600).normalize("NFKC")
    .replace(/[\s.,!?;:'\"，。！？；：「」『』（）()\[\]]/g, "")
    .replace(/[ァ-ヶ]/g, (letter) => String.fromCharCode(letter.charCodeAt(0) - 0x60));
}
function containsHan(value) {
  return /\p{Script=Han}/u.test(cleanText(value, 600));
}
function japaneseReadingHint(value) {
  const text = cleanText(value, 600).normalize("NFKC");
  const readings = [...text.matchAll(/[（(]([ぁ-んァ-ヶー]+)[）)]/g)].map((match) => match[1]);
  return readings.length === 1 ? normalizeJapanese(readings[0]) : normalizeJapanese(text);
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
  if (language.startsWith("ja")) {
    const a = [...japaneseReadingHint(expected)], b = [...japaneseReadingHint(heard)];
    const textScore = tokenSimilarity(a, b, (left, right) => left === right ? 0 : 1);
    return { score: textScore, textScore, phoneticScore: null, homophoneAccepted: false };
  }
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
function scoreJapaneseReadings(expected, heard, expectedReading, heardReading) {
  const textScore = scoreSpeech(expected, heard, "ja-JP").textScore;
  const readingScore = tokenSimilarity(
    [...normalizeJapanese(expectedReading)],
    [...normalizeJapanese(heardReading)],
    (left, right) => left === right ? 0 : 1,
  );
  return {
    score: Math.max(textScore, readingScore),
    textScore,
    phoneticScore: readingScore,
    homophoneAccepted: readingScore > textScore,
    readingTarget: normalizeJapanese(expectedReading),
    readingTranscript: normalizeJapanese(heardReading),
  };
}
function japaneseTranscriptionAnomaly(target, transcript, durationMs = 0) {
  const expected = japaneseReadingHint(target);
  const heard = normalizeJapanese(transcript);
  if (!heard) return "没有检测到有效语音";
  if (heard === expected) return "";
  if (durationMs > 0 && durationMs < 450) return "录音时间太短";
  const expectedLength = [...expected].length;
  const heardLength = [...heard].length;
  const excessiveLength = Math.max(expectedLength * 2 + 1, expectedLength + 3);
  if (heardLength > excessiveLength) return "识别文字远长于目标读音";
  if (durationMs >= 500 && heardLength / (durationMs / 1000) > 12) return "识别字符速度不符合本次录音长度";
  if (/(?:ご視聴ありがとうございました|チャンネル登録|字幕|お疲れ様でした|最後までご覧)/.test(transcript)) {
    return "命中短录音常见的异常转写";
  }
  return "";
}
async function resolveJapaneseReadings(env, target, transcript) {
  const response = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
    messages: [
      {
        role: "system",
        content: "Convert Japanese text to the pronunciation actually represented by the text. Return hiragana only. Different kanji with the same pronunciation must produce the same hiragana. Do not translate or explain.",
      },
      {
        role: "user",
        content: `Return exactly one JSON object with keys target and transcript.\ntarget: ${target}\ntranscript: ${transcript}`,
      },
    ],
    max_tokens: 120,
    temperature: 0,
  });
  const raw = cleanText(response?.response, 1000);
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("日语读音转换没有返回 JSON");
  const parsed = JSON.parse(raw.slice(start, end + 1));
  const targetReading = normalizeJapanese(parsed?.target);
  const transcriptReading = normalizeJapanese(parsed?.transcript);
  if (!targetReading || !transcriptReading || containsHan(targetReading) || containsHan(transcriptReading)) {
    throw new Error("日语读音转换结果无效");
  }
  return { targetReading, transcriptReading };
}
function cleanResults(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).map((item) => ({
    target: cleanText(item?.target, 300),
    transcript: cleanText(item?.transcript, 500),
    language: /^(de-DE|en-US|ja-JP)$/.test(item?.language) ? item.language : "",
    assessment: ["cloudflare-whisper-v2-unbiased", "cloudflare-whisper-v3-phonetic", "cloudflare-whisper-v4-japanese"].includes(item?.assessment)
      ? item.assessment : "",
    score: item?.score !== null && item?.score !== undefined && Number.isFinite(Number(item.score))
      ? Math.max(0, Math.min(100, Math.round(Number(item.score)))) : null,
    textScore: item?.textScore !== null && item?.textScore !== undefined && Number.isFinite(Number(item.textScore))
      ? Math.max(0, Math.min(100, Math.round(Number(item.textScore)))) : null,
    phoneticScore: item?.phoneticScore !== null && item?.phoneticScore !== undefined && Number.isFinite(Number(item.phoneticScore))
      ? Math.max(0, Math.min(100, Math.round(Number(item.phoneticScore)))) : null,
    homophoneAccepted: item?.homophoneAccepted === true,
    assessmentInconclusive: item?.assessmentInconclusive === true,
    retryRequired: item?.retryRequired === true,
    retryReason: cleanText(item?.retryReason, 160),
    readingTarget: cleanText(item?.readingTarget, 500),
    readingTranscript: cleanText(item?.readingTranscript, 500),
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
  return value.slice(0, 240).map((item) => ({
    id: cleanText(item?.id, 160), kind: ["lesson", "vocabulary", "output", "quiz"].includes(item?.kind) ? item.kind : "lesson",
    prompt: cleanText(item?.prompt, 300), response: cleanText(item?.response, 6000), answer: cleanText(item?.answer, 300),
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
    userAnswer: cleanText(item?.userAnswer, 12000),
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
    recordingSets: cleanRecordingSets(body.recordingSets),
  };
}
function authorised(request, env) {
  return typeof env.REVIEW_TOKEN === 'string' && env.REVIEW_TOKEN.length > 0 && request.headers.get("authorization") === "Bearer " + env.REVIEW_TOKEN;
}
function cleanRecordingSets(value){const result={};for(const lang of ['en-US','de-DE','ja-JP'])if(value?.[lang]){const s=value[lang];result[lang]={sentences:Array.isArray(s.sentences)?s.sentences.slice(0,30).map(x=>cleanText(x,300)):[],results:cleanResults(s.results),recordingEvidence:cleanRecordingEvidence(s.recordingEvidence)}}return result;}
function cleanPlan(value) {
  if (!validDate(value?.date) || !validDate(value?.sourceDate)) return null;
  return {
    version: 1,
    date: value.date,
    sourceDate: value.sourceDate,
    action: value.action === "advance" ? "advance" : "repeat",
    reason: cleanText(value.reason, 240),
    carryover: Array.isArray(value.carryover) ? value.carryover.slice(0,100).filter(item => typeof item?.title === 'string' && typeof item?.feedback === 'string').map(item => ({
      title: cleanText(item.title, 200),
      feedback: cleanText(item.feedback, 4000),
      kind: item?.kind === "pronunciation" ? "pronunciation" : "written",
      language: /^(ja-JP|en-US)$/.test(item?.language) ? item.language : "",
      target: cleanText(item?.target, 300),
      status: ["unfinished", "failed"].includes(item?.status) ? item.status : "unfinished",
      estimatedMinutes: Number.isFinite(Number(item?.estimatedMinutes)) ? Math.max(1, Math.min(120, Math.round(Number(item.estimatedMinutes)))) : 5,
    })) : [],
    weeklyReplan: value.weeklyReplan === true,
    weekStart: validDate(value.weekStart) ? value.weekStart : "",
    weeklyTask: cleanText(value.weeklyTask, 6000),
    updatedAfterReviewOf: validDate(value.updatedAfterReviewOf) ? value.updatedAfterReviewOf : "",
    updatedAt: cleanText(value.updatedAt, 60) || new Date().toISOString(),
  };
}

async function triggerSubmissionReview(env, report) {
  const now = Date.now();
  const scheduledReviewAt = Date.parse(`${report.date}T23:00:00+08:00`);
  if (Number.isFinite(scheduledReviewAt) && now <= scheduledReviewAt) {
    return { triggered: false, scheduled: true, reason: "作业已保存；北京时间 23:00 前提交，将由今晚 23:00 定时复盘统一处理" };
  }
  if (typeof env.GITHUB_DISPATCH_TOKEN !== "string" || !env.GITHUB_DISPATCH_TOKEN.trim()) {
    return { triggered: false, reason: "作业已保存，但 23:00 后自动补充复盘密钥尚未配置；请配置后重新提交或手动重跑复盘" };
  }
  const repository = typeof env.GITHUB_REPOSITORY === "string" && /^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY)
    ? env.GITHUB_REPOSITORY : "gkxicy/hsm-life-system";
  const markerKey = `review-dispatch:${report.date}:${report.deviceId || "anonymous"}`;
  const previous = await env.PRONUNCIATION_REPORTS.get(markerKey, "json");
  if (previous && now - Number(previous.dispatchedAt || 0) < 180_000) {
    return { triggered: true, deduplicated: true, reason: "自动复盘已经在队列中" };
  }
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/dispatches`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "user-agent": "hsm-language-study-worker",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({
        event_type: "language-study-submitted",
        client_payload: { date: report.date, reportId: report.id },
      }),
    });
    if (response.status !== 204) {
      return { triggered: false, reason: `GitHub 自动复盘触发失败（HTTP ${response.status}），将由 23:00 定时任务兜底` };
    }
    await env.PRONUNCIATION_REPORTS.put(markerKey, JSON.stringify({ reportId: report.id, dispatchedAt: now }), { expirationTtl: 60 * 60 * 48 });
    return { triggered: true, deduplicated: false, reason: "已启动云端复盘" };
  } catch (error) {
    return { triggered: false, reason: `GitHub 自动复盘暂时不可用，将由 23:00 定时任务兜底：${cleanText(error?.message, 120)}` };
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: JSON_HEADERS });
    if (request.method === "GET" && url.pathname === "/") return json({ ok: true, service: "hsm-pronunciation-api" });

    // Personal feedback is never placed in the public /plan response.
    if (url.pathname === '/feedback' && request.method === 'GET') {
      const date = url.searchParams.get('date');
      const device = (request.headers.get('authorization') || '').replace(/^Device /, '');
      if (!validDate(date) || !validDeviceId(device)) return json({ok:false,error:'需要原提交设备凭据'},401);
      const listed = await env.PRONUNCIATION_REPORTS.list({prefix:`feedback:${date}:${device}:`,limit:100});
      const feedback = await Promise.all(listed.keys.map(k=>env.PRONUNCIATION_REPORTS.get(k.name,'json')));
      return new Response(JSON.stringify({ok:true,feedback:feedback.filter(Boolean)}), {headers:{...JSON_HEADERS,'cache-control':'no-store'}});
    }
    if (url.pathname === '/feedback' && request.method === 'POST') {
      if (!authorised(request,env)) return json({ok:false,error:'未授权'},401);
      let body; try { body=await request.json(); } catch {return json({ok:false,error:'JSON 无效'},400)}
      if (!validDate(body.date) || !/^[a-f0-9-]{36}$/.test(body.reportId || '') || !Array.isArray(body.items) || !body.items.length || body.items.length>120) return json({ok:false,error:'批改格式无效'},400);
      const report=await env.PRONUNCIATION_REPORTS.get(`report:${body.date}:${body.reportId}`,'json');
      if (!report || !validDeviceId(report.deviceId)) return json({ok:false,error:'原提交没有设备归属，批改仅保存到私有复盘'},409);
      if (JSON.stringify(body.items).length>150000) return json({ok:false,error:'批改过长'},413);
      const feedback={date:body.date,reportId:body.reportId,submittedAt:report.submittedAt,items:body.items,updatedAt:new Date().toISOString()};
      await env.PRONUNCIATION_REPORTS.put(`feedback:${body.date}:${report.deviceId}:${body.reportId}`,JSON.stringify(feedback),{expirationTtl:60*60*24*180});
      return json({ok:true});
    }

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
      const durationMs = Math.max(0, Math.min(600000, Math.round(Number(url.searchParams.get("durationMs") || 0))));
      if (!target || !/^(de-DE|en-US|ja-JP)$/.test(language)) return json({ ok: false, error: "目标句或语言无效" }, 400);
      if (!env.AI) return json({ ok: false, error: "Cloudflare Worker 尚未绑定 Workers AI（变量名必须为 AI）" }, 503);
      const declaredSize = Number(request.headers.get("content-length") || 0);
      if (declaredSize > 5 * 1024 * 1024) return json({ ok: false, error: "录音超过 5MB，请缩短后重试" }, 413);
      const audio = await request.arrayBuffer();
      if (!audio.byteLength) return json({ ok: false, error: "没有收到录音数据" }, 400);
      if (audio.byteLength > 5 * 1024 * 1024) return json({ ok: false, error: "录音超过 5MB，请缩短后重试" }, 413);
      try {
        const forcedLanguage = language.startsWith("de") ? "de" : language.startsWith("ja") ? "ja" : "en";
        const transcription = await env.AI.run("@cf/openai/whisper-large-v3-turbo", {
          audio: arrayBufferToBase64(audio),
          task: "transcribe",
          language: forcedLanguage,
          vad_filter: true,
          condition_on_previous_text: false,
          no_speech_threshold: 0.45,
          compression_ratio_threshold: 2.0,
          log_prob_threshold: -0.8,
          hallucination_silence_threshold: 0.5,
        });
        const transcript = cleanText(transcription?.text, 500);
        const retryReason = language.startsWith("ja") ? japaneseTranscriptionAnomaly(target, transcript, durationMs) : "";
        if (retryReason) {
          return json({
            ok: true,
            transcript: "",
            score: null,
            passed: false,
            textScore: null,
            phoneticScore: null,
            homophoneAccepted: false,
            assessmentInconclusive: true,
            retryRequired: true,
            retryReason,
            language: forcedLanguage,
            model: "@cf/openai/whisper-large-v3-turbo",
            scoring: "japanese-hallucination-filter-v1",
          });
        }
        let assessment = scoreSpeech(target, transcript, language);
        let assessmentInconclusive = false;
        if (language.startsWith("ja") && assessment.score < 75 && (containsHan(target) || containsHan(transcript))) {
          try {
            const readings = await resolveJapaneseReadings(env, target, transcript);
            assessment = scoreJapaneseReadings(target, transcript, readings.targetReading, readings.transcriptReading);
          } catch {
            // A kanji/Chinese-looking ASR result cannot safely be judged from spelling alone.
            // Keep the recording as completed and do not create a false pronunciation failure.
            assessment = {
              ...assessment,
              score: null,
              phoneticScore: null,
              homophoneAccepted: false,
              readingTarget: japaneseReadingHint(target),
              readingTranscript: "",
            };
            assessmentInconclusive = true;
          }
        }
        const passed = assessmentInconclusive || (assessment.score ?? 0) >= 75;
        return json({
          ok: true, transcript, score: assessment.score, passed,
          textScore: assessment.textScore, phoneticScore: assessment.phoneticScore,
          homophoneAccepted: assessment.homophoneAccepted,
          assessmentInconclusive,
          retryRequired: false,
          retryReason: "",
          readingTarget: assessment.readingTarget || "",
          readingTranscript: assessment.readingTranscript || "",
          language: forcedLanguage, model: "@cf/openai/whisper-large-v3-turbo",
          scoring: language.startsWith("de")
            ? "german-phonetic-or-recognized-text-v3" : language.startsWith("ja")
              ? "japanese-kana-reading-similarity-v2" : "recognized-content-similarity-v3",
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
        deviceId: validDeviceId(body.deviceId) ? body.deviceId : '',
        lessonTitle: cleanText(body.lessonTitle, 200), language: cleanText(body.language, 40),
        results, recordingEvidence, vocabularyProgress, languageExercises, sentencePractice, englishTasks,
        recordingSets: cleanRecordingSets(body.recordingSets),
      };
      await env.PRONUNCIATION_REPORTS.put("report:" + report.date + ":" + report.id, JSON.stringify(report), { expirationTtl: 60 * 60 * 24 * 180 });
      const review = await triggerSubmissionReview(env, report);
      return json({
        ok: true,
        message: review.triggered
          ? "已提交，并已启动云端补充复盘。"
          : review.scheduled
            ? "已提交；将在今晚 23:00 统一复盘。"
            : "已提交；23:00 后自动补充复盘未启动，请按提示处理。",
        id: report.id,
        reviewTriggered: review.triggered,
        reviewScheduled: review.scheduled === true,
        reviewDeduplicated: review.deduplicated === true,
        reviewStatus: review.reason,
      });
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

export { germanPhoneticCode, scoreSpeech, scoreJapaneseReadings, japaneseTranscriptionAnomaly };
