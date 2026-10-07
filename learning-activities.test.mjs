import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import activities from './learning-activities.js';
const catalog = JSON.parse(fs.readFileSync(new URL('./annual-language-data.json', import.meta.url)));
const external = JSON.parse(fs.readFileSync(new URL('./external-exercises.json', import.meta.url)));

test('all 365 English lessons have vocabulary-based sentences and a paragraph within the actual API target limit', () => {
  const texts = new Set();
  for (const course of catalog.ielts) {
    const lines = activities.readingLines(course);
    assert.ok(lines.length >= 2, course.day);
    assert.ok(lines.every(s => s.split(/\s+/).length >= 4 && /[.!?]$/.test(s)), course.day);
    const paragraph = lines.join(' ');
    assert.ok(paragraph.length <= 300, `${course.day}: API would truncate text`);
    assert.ok(course.vocabulary.filter(([word]) => paragraph.toLowerCase().includes(word.toLowerCase())).length >= 2, course.day);
    texts.add(paragraph);
  }
  assert.equal(texts.size, 48);
});

test('Day5 review instructions become concrete previous-lesson vocabulary questions without changing Excel records', () => {
  const course = catalog.ielts[4], before = JSON.stringify(course);
  const result = activities.practiceForCourse(catalog, course);
  assert.deepEqual(result.actions, ['review','revision']);
  assert.equal(result.questions.length, 5);
  assert.ok(result.questions.every(q => q.prompt.includes('写一个') && q.source === 'lesson_vocabulary_sentence'));
  assert.equal(new Set(result.questions.map(q => q.id)).size, 5);
  const words = activities.sentenceWords(catalog, course);
  assert.equal(words.length, 5);
  assert.ok(words.every(w => catalog.ielts.slice(0,4).some(d => d.vocabulary.some(p=>p[0]===w.word))));
  assert.equal(JSON.stringify(course), before);
});

test('technical outcomes and unresolved instructions cannot be turned into three invented review questions', () => {
  const q = catalog.ielts[6].questions[0];
  const attempts = ['technical_error','inconclusive','manual_confirmed','correct'].map(result => ({question_id:q.id,user_answer:'x',result,error_type:result,language:'en-US'}));
  assert.deepEqual(activities.reviewQuestions(catalog, external, [{attempts}], 'en-US'), []);
  assert.deepEqual(activities.reviewQuestions(catalog, external, [{attempts:[{question_id:catalog.ielts[4].questions[0].id,user_answer:'x',result:'knowledge_error',language:'en-US'}]}], 'en-US'), []);
});

test('real error shows exact stem and answer; a later successful retry removes it regardless of report order', () => {
  const q = catalog.ielts[6].questions[0];
  const wrong = {question_id:q.id,user_answer:'is',result:'knowledge_error',error_type:'knowledge_error',language:'en-US',timestamp:'2026-10-05T12:00:00Z'};
  const review = activities.reviewQuestions(catalog, external, [{attempts:[wrong]}], 'en-US');
  assert.equal(review.length,1); assert.equal(review[0].prompt,q.prompt); assert.equal(review[0].previousAnswer,'is'); assert.equal(review[0].answer,'am');
  const correction = {...wrong,question_id:review[0].id,user_answer:'am',result:'correct',error_type:'correct',timestamp:'2026-10-06T12:00:00Z'};
  assert.equal(activities.reviewQuestions(catalog, external, [{attempts:[correction]},{attempts:[wrong]}], 'en-US').length,0);
});

test('shuffled vocabulary attempts resolve actual word and prompt and deduplicate different quiz positions', () => {
  const id = 'quiz:2026-09-15:英语:meaning-to-word:4:schedule';
  const q = activities.resolveQuestion(catalog, external, id);
  assert.equal(q.answer,'schedule'); assert.match(q.prompt,/日程/);
  const wrong = {question_id:id,language:'en-US',user_answer:'wrong',result:'knowledge_error',timestamp:'2026-10-05T12:00:00Z'};
  const right = {...wrong,question_id:id.replace(':4:',':1:'),result:'correct',timestamp:'2026-10-06T12:00:00Z'};
  assert.equal(activities.reviewQuestions(catalog, external, [{attempts:[wrong,right]}], 'en-US').length,0);
});

test('writing tasks include a concrete topic; listening instructions no longer masquerade as self-contained questions', () => {
  assert.ok(activities.practiceForCourse(catalog,catalog.ielts[3]).questions.every(q => /你为什么学习英语/.test(q.prompt)));
  assert.equal(activities.practiceForCourse(catalog,catalog.ielts[0]).questions.length,0);
  assert.deepEqual(activities.practiceForCourse(catalog,catalog.ielts[0]).actions,['external']);
  assert.equal(activities.practiceForCourse(catalog,catalog.japanese[0]).questions.length,catalog.japanese[0].questions.length);
});

test('review of an official exercise needs a real matching binding; unresolved foreign IDs are excluded', () => {
  const valid = 'external:en-US:2026-09-18:bc-a2-personal-profile:task3-1';
  assert.match(activities.resolveQuestion(catalog,external,valid).prompt,/personal profile/i);
  assert.equal(activities.resolveQuestion(catalog,external,valid.replace('2026-09-18','2026-09-19')),null);
});
