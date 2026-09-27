import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const plan = JSON.parse(await fs.readFile(new URL("./annual-language-data.json", import.meta.url), "utf8"));
const html = await fs.readFile(new URL("./index.html", import.meta.url), "utf8");
const app = await fs.readFile(new URL("./app.js", import.meta.url), "utf8");

test("the published course is a continuous IELTS and Japanese 365-day plan", () => {
  assert.equal(plan.ielts.length, 365);
  assert.equal(plan.japanese.length, 365);
  assert.equal(plan.startDate, "2026-09-15");
  assert.equal(plan.endDate, "2027-09-14");
  for (let index = 0; index < 365; index += 1) {
    assert.equal(plan.ielts[index].day, `Day ${index + 1}`);
    assert.equal(plan.japanese[index].day, `Day ${index + 1}`);
    assert.equal(plan.ielts[index].date, plan.japanese[index].date);
  }
});

test("every IELTS day supplies teaching, exercises, explanations, and an original source", () => {
  for (const day of plan.ielts) {
    assert.ok(day.course?.trim(), `${day.day}: missing Chinese course`);
    assert.match(day.courseUrl, /^https?:\/\//, `${day.day}: missing course URL`);
    assert.ok(day.practice?.trim(), `${day.day}: missing practice`);
    assert.ok(day.explanation?.trim(), `${day.day}: missing explanation`);
    assert.ok(day.officialTask?.trim(), `${day.day}: missing original task`);
    if (day.officialUrl) assert.match(day.officialUrl, /^https?:\/\//, `${day.day}: invalid original task URL`);
  }
});

test("every Japanese day supplies teaching, exercises, explanations, and JLPT references", () => {
  for (const day of plan.japanese) {
    assert.ok(day.course?.trim(), `${day.day}: missing Japanese course`);
    assert.match(day.courseUrl, /^https?:\/\//, `${day.day}: missing course URL`);
    assert.ok(day.practice?.trim(), `${day.day}: missing practice`);
    assert.ok(day.explanation?.trim(), `${day.day}: missing explanation`);
    assert.ok(day.officialTask?.trim(), `${day.day}: missing official task`);
    if (day.officialUrl) assert.match(day.officialUrl, /^https?:\/\//, `${day.day}: invalid official task URL`);
    assert.ok(day.officialExplanation?.trim(), `${day.day}: missing official explanation`);
  }
});

test("the page keeps answers hidden until the learner requests them", () => {
  assert.match(html, /答案默认收起/);
  assert.match(app, /el\("details", \{ class: "answer" \}/);
  assert.doesNotMatch(app, /el\("details", \{[^}]*open:/);
});

test("a missing daily plan inherits the latest published progress instead of using the calendar date", () => {
  assert.match(app, /findPreviousPublishedPlan/);
  assert.match(app, /inherit=1|inherit:\s*"1"/);
  assert.doesNotMatch(app, /state\.plan\?\.sourceDate \|\| state\.viewedDate/);
});

test("structured questions have stable IDs and never invent missing IELTS answers", () => {
  const all = [...plan.ielts.flatMap((day) => day.questions), ...plan.japanese.flatMap((day) => day.questions)];
  assert.equal(new Set(all.map((question) => question.id)).size, all.length);
  for (const question of all) {
    for (const key of ["id", "questionType", "prompt", "stem", "options", "answer", "explanation", "source", "externalUrl", "day", "date", "language", "learningStage", "answerStatus"]) {
      assert.ok(Object.hasOwn(question, key), `${question.id}: missing ${key}`);
    }
  }
  const ieltsDaysWithAnswers = plan.ielts.filter((day) => day.questions.some((question) => question.answerStatus === "available"));
  assert.equal(ieltsDaysWithAnswers.length, 33);
  assert.ok(plan.ielts.some((day) => day.questions.some((question) => question.answerStatus === "manual" && !question.answer)));
  assert.equal(plan.japanese.every((day) => day.questions.every((question) => question.answerStatus === "available")), true);
});

test("multi-video Japanese lessons keep every link as an independent resource", () => {
  const multi = plan.japanese.filter((day) => day.courseUrls.length > 1);
  assert.equal(multi.length, 137);
  for (const day of multi) {
    assert.equal(day.courseUrls.every((url) => /^https?:\/\/\S+$/.test(url)), true);
    assert.equal(day.courseUrl, day.courseUrls[0]);
  }
  assert.match(app, /externalLinks/);
});

test("English and Japanese use one shared recorder and central result model", () => {
  assert.match(app, /function renderSpeechPractice/);
  assert.match(app, /language: "en-US"/);
  assert.match(app, /language: "ja-JP"/);
  assert.match(app, /manual_confirmed/);
  assert.doesNotMatch(app, /result\.score}%/);
});

test("the learning desk exposes today's work, focus mode, and real-record history", () => {
  assert.match(html, /id="dashboard"/);
  assert.match(html, /id="focusClock"/);
  assert.match(html, /id="historyList"/);
  assert.match(app, /45 \* 60/);
  assert.match(app, /localLearningHistory/);
  assert.match(app, /draftEvidenceCount/);
});
