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
