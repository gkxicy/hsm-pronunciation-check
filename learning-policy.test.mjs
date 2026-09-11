import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

const html = await fs.readFile(new URL("./index.html", import.meta.url), "utf8");
const review = await fs.readFile(new URL("./learning-review.js", import.meta.url), "utf8");

function literalBetween(start, end) {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `missing source block: ${start}`);
  return html.slice(from + start.length, to).trim();
}

test("every new lesson has beginner teaching before exercises", () => {
  const source = literalBetween("const DAILY_CONTENT=", "let sentencePractice");
  const content = vm.runInNewContext(source.replace(/;$/, ""));
  for (const [index, day] of content.entries()) {
    assert.ok(
      day.reviewOnly || day.resources.some((item) => typeof item.inline === "string" && item.inline.length > 20),
      `day ${index + 1} introduces exercises without a Chinese beginner guide`
    );
  }
  assert.match(html, /本节暂未开放/);
  assert.match(html, /练习已暂停：等待系统补齐本节基础讲解/);
});

test("every Listening task exposes verified answer material and an after-task review", () => {
  const source = literalBetween("const ENGLISH_TASKS=", "const DAILY_CONTENT=");
  const tasks = vm.runInNewContext(source.replace(/;$/, "")).flat().filter((item) => /^Listening/i.test(item.title));
  assert.ok(tasks.length > 0);
  for (const task of tasks) assert.match(task.answerUrl, /^https:\/\/ielts\.org\//);
  assert.match(review, /做完后打开：本题解析材料与步骤/);
  assert.match(review, /题型方法视频（不是原题逐题解析）/);
  assert.doesNotMatch(review, /task\.explanationUrl\|\|line\.querySelector/);
});
