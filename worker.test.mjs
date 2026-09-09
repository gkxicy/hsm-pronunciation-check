import test from "node:test";
import assert from "node:assert/strict";

import { germanPhoneticCode, scoreSpeech } from "./worker.js";

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
