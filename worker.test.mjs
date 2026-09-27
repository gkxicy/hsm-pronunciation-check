import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateJapanesePronunciation,
  evaluateEnglishPronunciation,
  germanPhoneticCode,
  isKnowledgeError,
  japaneseTranscriptionAnomaly,
  normalizeJapanese,
  scoreJapaneseReadings,
  scoreSpeech,
} from "./worker.js";
import worker from "./worker.js";

test('feedback access is device-scoped and writers require a configured secret',async()=>{
 const db=new Map();const env={REVIEW_TOKEN:'secret',PRONUNCIATION_REPORTS:{get:async(k,type)=>{const v=db.get(k);return type==='json'&&v?JSON.parse(v):v},put:async(k,v)=>db.set(k,v),list:async({prefix})=>({keys:[...db.keys()].filter(k=>k.startsWith(prefix)).map(name=>({name}))})}};
 const date='2026-09-10',id='12345678-1234-1234-1234-123456789abc',device='device-123456789abcdef';
 db.set(`report:${date}:${id}`,JSON.stringify({deviceId:device,submittedAt:'now'}));
 const body=JSON.stringify({date,reportId:id,items:[{title:'private essay'}]});
 assert.equal((await worker.fetch(new Request('https://test/feedback',{method:'POST',body}),env)).status,401);
 assert.equal((await worker.fetch(new Request('https://test/feedback',{method:'POST',body,headers:{Authorization:'Bearer undefined'}}),{...env,REVIEW_TOKEN:undefined})).status,401);
 assert.equal((await worker.fetch(new Request('https://test/feedback',{method:'POST',body,headers:{Authorization:'Bearer secret'}}),env)).status,200);
 const read=async(d)=>(await (await worker.fetch(new Request('https://test/feedback?date='+date,{headers:{Authorization:'Device '+d}}),env)).json()).feedback;
 assert.equal((await read(device)).length,1);assert.equal((await read('other-device-123456789')).length,0);
});

test("bilingual vocabulary answers and long writing survive cloud draft storage", async () => {
  let saved;
  const exercises=Array.from({length:65},(_,i)=>({id:i===0?'vocab:en:book:forward':'output:'+i,kind:i===0?'vocabulary':'output',prompt:'英语 / '+i,response:i===64?'word '.repeat(500):'answer'}));
  const response=await worker.fetch(new Request('https://test/draft',{method:'POST',body:JSON.stringify({date:'2026-09-09',deviceId:'test-device-123456789',languageExercises:exercises,sentencePractice:Array.from({length:6},(_,i)=>({word:'word'+i,sentence:'My sentence.'}))})}),{PRONUNCIATION_REPORTS:{put:async(key,value)=>{saved=JSON.parse(value)}}});
  assert.equal(response.status,200);assert.equal(saved.languageExercises.length,65);assert.equal(saved.languageExercises[0].id,'vocab:en:book:forward');assert.equal(saved.languageExercises[0].kind,'vocabulary');assert.equal(saved.languageExercises[64].response.length,2499);assert.equal(saved.sentencePractice.length,6);
});

test("final submission stores the report before triggering the fixed GitHub review event", async () => {
  const db = new Map();
  const calls = [];
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  Date.now = () => Date.parse("2026-09-15T15:01:00Z");
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(null, { status: 204 });
  };
  try {
    const env = {
      GITHUB_DISPATCH_TOKEN: "test-secret",
      PRONUNCIATION_REPORTS: {
        get: async (key, type) => {
          const value = db.get(key);
          return type === "json" && value ? JSON.parse(value) : value;
        },
        put: async (key, value) => db.set(key, value),
      },
    };
    const body = {
      date: "2026-09-15",
      deviceId: "test-device-123456789",
      vocabularyProgress: [{ word: "日语：あい", done: true }],
    };
    const response = await worker.fetch(new Request("https://test/submit", { method: "POST", body: JSON.stringify(body) }), env);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.reviewTriggered, true);
    assert.equal([...db.keys()].some((key) => key.startsWith("report:2026-09-15:")), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.github.com/repos/gkxicy/hsm-life-system/dispatches");
    const event = JSON.parse(calls[0].options.body);
    assert.deepEqual(event, { event_type: "language-study-submitted", client_payload: { date: "2026-09-15", reportId: payload.id } });
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
});

test("submission at or before Beijing 23:00 is saved without triggering a review", async () => {
  const db = new Map();
  const calls = [];
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  Date.now = () => Date.parse("2026-09-15T15:00:00Z");
  globalThis.fetch = async (...args) => { calls.push(args); return new Response(null, { status: 204 }); };
  try {
    const response = await worker.fetch(new Request("https://test/submit", {
      method: "POST",
      body: JSON.stringify({ date: "2026-09-15", deviceId: "test-device-123456789", vocabularyProgress: [{ word: "日语：あい", done: true }] }),
    }), {
      GITHUB_DISPATCH_TOKEN: "test-secret",
      PRONUNCIATION_REPORTS: {
        get: async () => null,
        put: async (key, value) => db.set(key, value),
      },
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.reviewTriggered, false);
    assert.equal(payload.reviewScheduled, true);
    assert.match(payload.message, /今晚 23:00/);
    assert.equal(calls.length, 0);
    assert.equal([...db.keys()].some((key) => key.startsWith("report:2026-09-15:")), true);
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
});

test("late submission still succeeds when the automatic-review secret is absent", async () => {
  const db = new Map();
  const originalNow = Date.now;
  Date.now = () => Date.parse("2026-09-15T15:01:00Z");
  try {
    const response = await worker.fetch(new Request("https://test/submit", {
      method: "POST",
      body: JSON.stringify({ date: "2026-09-15", deviceId: "test-device-123456789", vocabularyProgress: [{ word: "英语：schedule", done: true }] }),
    }), { PRONUNCIATION_REPORTS: { put: async (key, value) => db.set(key, value) } });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.reviewTriggered, false);
    assert.equal(payload.reviewScheduled, false);
    assert.match(payload.reviewStatus, /23:00 后/);
  } finally {
    Date.now = originalNow;
  }
});

test("Kölner Phonetik matches the published reference example", () => {
  assert.equal(germanPhoneticCode("Müller-Lüdenscheidt"), "65752682");
});

test('English and German recording sets survive cloud saving independently',async()=>{
 let saved;
 const body={date:'2026-09-10',deviceId:'test-device-123456789',recordingSets:{'en-US':{sentences:['My name is Test.'],results:[],recordingEvidence:[]},'de-DE':{sentences:['Ich wohne hier.'],results:[],recordingEvidence:[]}}};
 const res=await worker.fetch(new Request('https://test/draft',{method:'POST',body:JSON.stringify(body)}),{PRONUNCIATION_REPORTS:{put:async(k,v)=>saved=JSON.parse(v)}});
 assert.equal(res.status,200);assert.equal(saved.recordingSets['en-US'].sentences[0],'My name is Test.');assert.equal(saved.recordingSets['de-DE'].sentences[0],'Ich wohne hier.');
});

test('Japanese recording data survives cloud saving and kana variants are normalized',async()=>{
 let saved;
 const body={date:'2026-09-15',deviceId:'test-device-123456789',recordingSets:{'ja-JP':{sentences:['アイウエオ'],results:[{target:'アイウエオ',transcript:'あいうえお',language:'ja-JP',assessment:'cloudflare-whisper-v4-japanese',score:100,passed:true}],recordingEvidence:[]}}};
 const res=await worker.fetch(new Request('https://test/draft',{method:'POST',body:JSON.stringify(body)}),{PRONUNCIATION_REPORTS:{put:async(k,v)=>saved=JSON.parse(v)}});
 assert.equal(res.status,200);assert.equal(saved.recordingSets['ja-JP'].sentences[0],'アイウエオ');assert.equal(saved.recordingSets['ja-JP'].results[0].language,'ja-JP');
 assert.equal(scoreSpeech('アイウエオ','あいうえお','ja-JP').score,100);
 assert.ok(scoreSpeech('あいうえお','かきくけこ','ja-JP').score<75);
 assert.equal(scoreSpeech('連絡（れんらく）','れんらく','ja-JP').score,100);
});

test("Japanese homographs and alternative kanji are scored by kana reading", () => {
  const result = scoreJapaneseReadings("箸（はし）", "橋", "はし", "はし");
  assert.equal(result.score, 100);
  assert.equal(result.phoneticScore, 100);
  assert.equal(result.homophoneAccepted, true);
});

test("Japanese assessment accepts a different ASR spelling when the kana readings match", async () => {
  let calls = 0;
  const env = {
    AI: {
      run: async (model) => {
        calls += 1;
        if (model.includes("whisper")) return { text: "橋" };
        return { response: '{"target":"はし","transcript":"はし"}' };
      },
    },
  };
  const response = await worker.fetch(new Request("https://test/assess?target=%E7%AE%B8%EF%BC%88%E3%81%AF%E3%81%97%EF%BC%89&language=ja-JP", {
    method: "POST",
    headers: { "content-type": "audio/webm" },
    body: new Uint8Array([1, 2, 3]),
  }), env);
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.passed, true);
  assert.equal(data.score, 100);
  assert.equal(data.homophoneAccepted, true);
  assert.equal(data.readingTarget, "はし");
  assert.equal(data.readingTranscript, "はし");
  assert.equal(calls, 2);
});

test("a kanji-shaped ASR mismatch is not marked wrong when reading conversion is unavailable", async () => {
  const env = {
    AI: {
      run: async (model) => {
        if (model.includes("whisper")) return { text: "愛" };
        throw new Error("reading model unavailable");
      },
    },
  };
  const response = await worker.fetch(new Request("https://test/assess?target=%E3%81%82%E3%81%84&language=ja-JP", {
    method: "POST",
    body: new Uint8Array([1]),
  }), env);
  const data = await response.json();
  assert.equal(data.status, "inconclusive");
  assert.equal(data.errorType, "inconclusive");
  assert.equal(data.passed, false);
  assert.equal(data.score, null);
  assert.equal(data.assessmentInconclusive, true);
});

test("short-audio Japanese hallucinations are ignored instead of being scored", async () => {
  let calls = 0;
  const env = {
    AI: {
      run: async () => {
        calls += 1;
        return { text: "ご視聴ありがとうございました" };
      },
    },
  };
  const response = await worker.fetch(new Request("https://test/assess?target=%E3%81%82&language=ja-JP&durationMs=900", {
    method: "POST",
    body: new Uint8Array([1, 2]),
  }), env);
  const data = await response.json();
  assert.equal(data.retryRequired, true);
  assert.equal(data.passed, false);
  assert.equal(data.score, null);
  assert.equal(data.status, "inconclusive");
  assert.equal(data.transcript, "ご視聴ありがとうございました");
  assert.match(data.retryReason, /识别文字远长|异常转写/);
  assert.equal(calls, 1, "an obvious hallucination must be stopped before kana conversion");
});

test("a correctly recognized single kana is not rejected as too short", () => {
  assert.equal(japaneseTranscriptionAnomaly("あ", "あ", 350), "");
  assert.match(japaneseTranscriptionAnomaly("あ", "こんにちは", 900), /识别文字远长/);
});

test("Japanese normalization ignores punctuation and treats hiragana and katakana as equivalent", () => {
  assert.equal(normalizeJapanese(" こんにちは、"), "こんにちは");
  assert.equal(normalizeJapanese("コンニチハ"), "こんにちは");
  assert.equal(evaluateJapanesePronunciation({ target: "こんにちは、", transcript: "こんにちは", durationMs: 1200 }).status, "passed");
  assert.equal(evaluateJapanesePronunciation({ target: "コンニチハ", transcript: "こんにちは", durationMs: 1200 }).status, "passed");
});

test("Japanese kanji and matching kana reading pass without comparing surface spelling", () => {
  const outcome = evaluateJapanesePronunciation({
    target: "箸（はし）", transcript: "はし", targetReading: "はし", transcriptReading: "はし", durationMs: 900,
  });
  assert.equal(outcome.status, "passed");
  assert.equal(outcome.errorType, "correct");
});

test("a single kana with an unrelated long transcription is inconclusive, not a knowledge error", () => {
  const outcome = evaluateJapanesePronunciation({ target: "つ", transcript: "本日はよろしくお願いします", durationMs: 1000 });
  assert.equal(outcome.status, "inconclusive");
  assert.equal(outcome.errorType, "inconclusive");
  assert.equal(isKnowledgeError(outcome), false);
});

test("an empty speech transcript is a technical error and cannot enter review", () => {
  const outcome = evaluateJapanesePronunciation({ target: "こんにちは", transcript: "", durationMs: 1000 });
  assert.equal(outcome.status, "technical_error");
  assert.equal(outcome.errorType, "technical_error");
  assert.equal(isKnowledgeError(outcome), false);
});

test("a clear long Japanese reading mismatch is the only kind classified as knowledge error", () => {
  const outcome = evaluateJapanesePronunciation({ target: "こんにちは", transcript: "さようなら", durationMs: 1500 });
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.errorType, "knowledge_error");
  assert.equal(isKnowledgeError(outcome), true);
});

test("speech API failures return a structured technical error instead of a false failure", async () => {
  const response = await worker.fetch(new Request("https://test/assess?target=%E3%81%93%E3%82%93%E3%81%AB%E3%81%A1%E3%81%AF&language=ja-JP", {
    method: "POST", body: new Uint8Array([1, 2, 3]),
  }), { AI: { run: async () => { throw new Error("timeout"); } } });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.status, "technical_error");
  assert.equal(data.errorType, "technical_error");
  assert.equal(data.passed, false);
});

test("manual confirmation survives cloud storage without becoming a knowledge error", async () => {
  let saved;
  const response = await worker.fetch(new Request("https://test/draft", {
    method: "POST",
    body: JSON.stringify({
      date: "2026-09-15", deviceId: "test-device-123456789",
      results: [{ target: "つ", language: "ja-JP", status: "manual_confirmed", manualConfirmed: true, passed: true }],
      attempts: [{ question_id: "day1:pronunciation:ja:0", user_answer: "つ", result: "manual_confirmed", error_type: "manual_confirmed", language: "ja-JP", day: 1 }],
    }),
  }), { PRONUNCIATION_REPORTS: { put: async (_key, value) => { saved = JSON.parse(value); } } });
  assert.equal(response.status, 200);
  assert.equal(saved.results[0].status, "manual_confirmed");
  assert.equal(saved.results[0].errorType, "manual_confirmed");
  assert.equal(saved.attempts[0].result, "manual_confirmed");
  assert.equal(isKnowledgeError(saved.results[0]), false);
});

test("published plans preserve structured pronunciation carryover fields", async () => {
  let saved;
  const response = await worker.fetch(new Request("https://test/plan", {
    method: "POST",
    headers: { authorization: "Bearer secret" },
    body: JSON.stringify({
      date: "2026-09-16", sourceDate: "2026-09-16", action: "advance", reason: "补读不暂停新课",
      carryover: [{ title: "日语发音重读", feedback: "只重读错句", kind: "pronunciation", language: "ja-JP", target: "はし", status: "failed", estimatedMinutes: 3 }],
    }),
  }), { REVIEW_TOKEN: "secret", PRONUNCIATION_REPORTS: { put: async (_key, value) => { saved = JSON.parse(value); } } });
  assert.equal(response.status, 200);
  assert.deepEqual(saved.carryover[0], {
    title: "日语发音重读", feedback: "只重读错句", kind: "pronunciation", language: "ja-JP", target: "はし", status: "failed", estimatedMinutes: 3,
  });
});

test("plan lookup inherits the latest earlier plan when the requested day was not generated", async () => {
  const db = new Map([
    ["plan:2026-09-18", JSON.stringify({ date: "2026-09-18", sourceDate: "2026-09-17", action: "advance", reason: "Day 3", carryover: [] })],
    ["plan:2026-09-19", JSON.stringify({ date: "2026-09-19", sourceDate: "2026-09-17", action: "repeat", reason: "继续 Day 3", carryover: [] })],
  ]);
  const env = { PRONUNCIATION_REPORTS: {
    get: async (key, type) => {
      const value = db.get(key);
      return type === "json" && value ? JSON.parse(value) : value;
    },
    list: async ({ prefix }) => ({ keys: [...db.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name })) }),
  } };
  const response = await worker.fetch(new Request("https://test/plan?date=2026-09-20&inherit=1"), env);
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.plan.sourceDate, "2026-09-17");
  assert.equal(data.inheritedFrom, "2026-09-19");
});

test("German homophones with different spelling are accepted", () => {
  for (const [expected, heard] of [["seit", "seid"], ["Meer", "mehr"], ["wieder", "wider"]]) {
    const result = scoreSpeech(expected, heard, "de-DE");
    assert.equal(result.score, 100);
    assert.equal(result.homophoneAccepted, true);
  }
});

test("homophone matching remains word-aligned and penalizes missing words", () => {
  const result = scoreSpeech("Wir sind seit gestern hier", "Wir sind seid hier", "de-DE");
  assert.equal(result.score, 80);
  assert.equal(result.homophoneAccepted, true);
});

test("clearly different German sentences do not pass", () => {
  const result = scoreSpeech("Ich wohne heute in Berlin", "Du spielst morgen Fußball", "de-DE");
  assert.ok(result.score < 75);
});

test("English continues to use spelling-based transcript comparison", () => {
  const result = scoreSpeech("write", "right", "en-US");
  assert.equal(result.score, 0);
  assert.equal(result.phoneticScore, null);
});

test("English uses the shared result model without pretending to provide phoneme scoring", () => {
  const passed = evaluateEnglishPronunciation({ target: "industrial sales", transcript: "industrial sales" });
  const uncertain = evaluateEnglishPronunciation({ target: "schedule", transcript: "scheduled" });
  assert.equal(passed.status, "passed");
  assert.equal(passed.errorType, "correct");
  assert.equal(uncertain.status, "inconclusive");
  assert.equal(uncertain.errorType, "inconclusive");
  assert.equal("pronunciationScore" in passed, false);
});
