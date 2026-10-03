import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(import.meta.url);
const {packsForCourse, questionId, materialUrls, listeningMismatch}=require('./external-exercises.js');
const data=JSON.parse(fs.readFileSync(new URL('./external-exercises.json',import.meta.url)));
test('current Day4 has a concrete writing worksheet, official answers and original explanations',()=>{
 const [pack]=packsForCourse(data,{date:'2026-09-18',officialTask:'Writing'},'en-US');
 assert.equal(pack.id,'bc-a2-personal-profile');
 assert.ok(pack.questionUrl.endsWith('.pdf'));assert.equal(pack.answerPage,4);
 assert.equal(pack.questions.length,9);
 for(const q of pack.questions){assert.ok(q.locator);assert.ok(q.prompt);assert.ok(q.explanation);assert.ok(q.answer);}
});
test('review days and unverified later lessons never silently receive a repeated fake official exercise',()=>{
 assert.deepEqual(packsForCourse(data,{date:'2026-09-19'},'en-US'),[]);
 assert.deepEqual(packsForCourse(data,{date:'2027-01-01'},'en-US'),[]);
 assert.deepEqual(packsForCourse(data,{date:'2026-09-18'},'ja-JP'),[]);
});
test('resource question IDs are stable, language/course scoped, not legacy official submission IDs',()=>{
 const q=questionId('2026-09-18','en-US','bc-a2-personal-profile','task3-1');
 assert.equal(q,'external:en-US:2026-09-18:bc-a2-personal-profile:task3-1');
 assert.notEqual(q,questionId('2026-09-25','en-US','bc-a2-personal-profile','task3-1'));
});
test('every pack has distinct trustworthy answer provenance and no invented exact video',()=>{
 for(const p of data.packs){assert.equal(p.status,'source_verified');assert.ok(p.verifiedAt);assert.ok(materialUrls(p).length);assert.ok(p.answerUrl);assert.ok(p.sourceLabel);assert.ok(!p.videoUrl);}
});
test('JLPT grammar task selection is exact, no shifted local/global numbers or mixed-year listening',()=>{
 const [a]=packsForCourse(data,{date:'2026-10-01'},'ja-JP');
 const [b]=packsForCourse(data,{date:'2026-10-02'},'ja-JP');
 assert.deepEqual(a.questions.map(q=>q.locator),['問題1 第1题','問題1 第2题','問題1 第3题']);
 assert.deepEqual(b.questions.map(q=>q.locator),['問題1 第4题','問題1 第5题','問題1 第6题']);
 assert.equal(a.edition,'2018');assert.equal(a.slot,'official');
});
test('mismatched audio editions are explicit instead of receiving a guessed answer key',()=>{
 assert.equal(listeningMismatch({audioUrls:['https://www.jlpt.jp/samples/sample2012/mp3/N5Q1.mp3'],listeningBookUrls:['https://www.jlpt.jp/samples/sample2018/pdf/N5L.pdf']}),true);
 assert.equal(listeningMismatch({audioUrls:['https://www.jlpt.jp/samples/sample2018/mp3/N5Q1.mp3'],listeningBookUrls:['https://www.jlpt.jp/samples/sample2018/pdf/N5L.pdf']}),false);
 assert.equal(listeningMismatch({}),false);
});
