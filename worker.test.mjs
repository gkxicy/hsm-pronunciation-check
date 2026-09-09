import test from "node:test";
import assert from "node:assert/strict";

import { germanPhoneticCode, scoreSpeech } from "./worker.js";
import worker from "./worker.js";

test("bilingual vocabulary answers and long writing survive cloud draft storage", async () => {
  let saved;
  const exercises=Array.from({length:65},(_,i)=>({prompt:'英语 / '+i,response:i===64?'word '.repeat(500):'answer'}));
  const response=await worker.fetch(new Request('https://test/draft',{method:'POST',body:JSON.stringify({date:'2026-09-09',deviceId:'test-device-123456789',languageExercises:exercises,sentencePractice:Array.from({length:6},(_,i)=>({word:'word'+i,sentence:'My sentence.'}))})}),{PRONUNCIATION_REPORTS:{put:async(key,value)=>{saved=JSON.parse(value)}}});
  assert.equal(response.status,200);assert.equal(saved.languageExercises.length,65);assert.equal(saved.languageExercises[64].response.length,2499);assert.equal(saved.sentencePractice.length,6);
});

test("Kölner Phonetik matches the published reference example", () => {
  assert.equal(germanPhoneticCode("Müller-Lüdenscheidt"), "65752682");
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
