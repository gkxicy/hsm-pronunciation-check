import test from "node:test";
import assert from "node:assert/strict";

import { germanPhoneticCode, scoreSpeech } from "./worker.js";
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
  const exercises=Array.from({length:65},(_,i)=>({prompt:'英语 / '+i,response:i===64?'word '.repeat(500):'answer'}));
  const response=await worker.fetch(new Request('https://test/draft',{method:'POST',body:JSON.stringify({date:'2026-09-09',deviceId:'test-device-123456789',languageExercises:exercises,sentencePractice:Array.from({length:6},(_,i)=>({word:'word'+i,sentence:'My sentence.'}))})}),{PRONUNCIATION_REPORTS:{put:async(key,value)=>{saved=JSON.parse(value)}}});
  assert.equal(response.status,200);assert.equal(saved.languageExercises.length,65);assert.equal(saved.languageExercises[64].response.length,2499);assert.equal(saved.sentencePractice.length,6);
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
