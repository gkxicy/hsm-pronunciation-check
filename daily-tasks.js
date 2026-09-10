// Both languages are daily tasks, independently of the recording language.
const ENGLISH_WORD_SETS = [
 [['book','预订'],['ticket','票'],['address','地址'],['schedule','日程'],['available','可用的'],['luggage','行李'],['receipt','收据'],['appointment','预约'],['reservation','预订'],['payment','付款']],
 [['employer','雇主'],['vacancy','空缺职位'],['contract','合同'],['colleague','同事'],['shift','轮班'],['training','培训'],['salary','工资'],['duties','职责'],['apply','申请'],['experience','经验']],
 [['inquire','询问'],['require','要求'],['confirm','确认'],['provide','提供'],['suitable','合适的'],['deadline','截止日期'],['documents','文件'],['arrange','安排'],['request','请求'],['appreciate','感激']],
 lessons[3].words,
 [['entrance','入口'],['exit','出口'],['nearby','附近'],['across','穿过'],['opposite','在对面'],['turn','转弯'],['follow','跟随'],['platform','站台'],['route','路线'],['information','信息']],
 [['notice','通知'],['advertise','登广告'],['facilities','设施'],['compulsory','必须的'],['permission','许可'],['safety','安全'],['complaint','投诉'],['refund','退款'],['temporary','临时的'],['permanent','永久的']]
];
ENGLISH_WORD_SETS.push(ENGLISH_WORD_SETS.slice(0,6).flat().filter((_,i)=>i%3===0));
const GERMAN_DAY_FOUR = [['und','和'],['aber','但是'],['oder','或者'],['jetzt','现在'],['heute','今天'],['morgen','明天'],['hier','这里'],['dort','那里'],['gern','乐意'],['bitte','请 / 不客气']];
const SENTENCE_INDEXES = {en:[[0,4,9],[0,4,9],[0,4,9],[0,5,9],[0,4,9],[0,4,9],[0,4,9]],de:[[0,4,9],[0,4,9],[0,5,9],[0,4,9],[0,4,9],[0,6,9],[0,4,9]]};
function dailyWords(lang){return lang==='en'?ENGLISH_WORD_SETS[lessonIndex()]:lessonIndex()===3?GERMAN_DAY_FOUR:lesson().words}
function taskKey(lang,word){return (lang==='en'?'英语：':'德语：')+word}
function safeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function taskSection(title,id){const section=document.createElement('details');section.className='box task-section';section.open=true;section.id=id;section.innerHTML='<summary>'+title+'</summary><div class="task-content"></div>';return section}
document.title='每日语言学习';document.querySelector('h1').textContent='每日语言学习';
const taskNav=document.createElement('nav');taskNav.className='task-nav';taskNav.innerHTML='<a href="#english-study">英语词汇与造句</a><a href="#german-study">德语词汇与造句</a><a href="#english-questions">英语题目</a><a href="#recording-panel">朗读回放</a>';
$('planStatus').after(taskNav);
const saveNotice=document.createElement('p');saveNotice.id='saveNotice';saveNotice.setAttribute('role','status');taskNav.after(saveNotice);
const englishStudy=taskSection('01 · 英语词汇与造句','english-study'),germanStudy=taskSection('02 · 德语词汇与造句','german-study');
germanStudy.open=false;
taskNav.addEventListener('click',event=>{const link=event.target.closest('a');if(!link)return;const section=document.querySelector(link.getAttribute('href'));if(section?.tagName==='DETAILS')section.open=true});
saveNotice.after(englishStudy,germanStudy);
for(const [lang,section] of [['en',englishStudy],['de',germanStudy]])section.querySelector('.task-content').innerHTML='<p class="hint">听示范 → 跟读 → 双向自测 → 用指定词造句。答案和进度自动暂存。</p><div id="'+lang+'Progress" class="hint"></div><div id="'+lang+'Words" class="words"></div><h3>指定词造句</h3><div id="'+lang+'Sentences"></div>';
$('words').hidden=true;$('sentencePractice').parentElement.hidden=true;
$('words').previousElementSibling.hidden=true;$('words').previousElementSibling.previousElementSibling.hidden=true;
$('englishTasks').parentElement.id='english-questions';document.querySelector('.pronunciation-panel').id='recording-panel';
renderVocabulary=function(){
 const previous=new Map(vocabularyProgress.map(item=>[item.word,item]));
 vocabularyProgress=['en','de'].flatMap(lang=>dailyWords(lang).map(([word])=>{const key=taskKey(lang,word),old=previous.get(key)||previous.get(word);return {word:key,done:old?.done===true}}));
 for(const lang of ['en','de']){
  const root=$(lang+'Words');root.innerHTML=dailyWords(lang).map(([word,meaning],i)=>'<div class="word"><b>'+safeHtml(word)+'</b><span>'+safeHtml(meaning)+'</span><button type="button" class="word-audio" data-audio="'+i+'">▶ 听示范发音</button><label><input type="checkbox" data-learn="'+i+'">已跟读</label><details><summary>双向自测</summary><label>看中文写外语：'+safeHtml(meaning)+'<input autocomplete="off" data-forward="'+i+'"></label><label>看外语写中文：'+safeHtml(word)+'<input autocomplete="off" data-reverse="'+i+'"></label><button type="button" class="secondary" data-check-word="'+i+'">核对参考答案</button><p data-word-feedback="'+i+'"></p></details></div>').join('');
  dailyWords(lang).forEach(([word,meaning],i)=>{
   const key=taskKey(lang,word),progress=vocabularyProgress.find(x=>x.word===key);root.querySelector('[data-learn="'+i+'"]').checked=progress.done;
   for(const direction of ['forward','reverse']){
    const prompt=key+' / '+(direction==='forward'?'中文→外语':'外语→中文');let item=languageExercises.find(x=>x.prompt===prompt);
    if(!item){item={prompt,response:'',answer:direction==='forward'?word:meaning};languageExercises.push(item)}
    const input=root.querySelector('[data-'+direction+'="'+i+'"]');input.value=item.response;input.oninput=()=>{item.response=input.value;scheduleDraft()};
   }
   root.querySelector('[data-audio="'+i+'"]').onclick=()=>speakText(word,lang==='en'?'en-US':'de-DE','单词参考音');
   root.querySelector('[data-learn="'+i+'"]').onchange=e=>{progress.done=e.target.checked;updateTaskProgress();scheduleDraft()};
   root.querySelector('[data-check-word="'+i+'"]').onclick=()=>{root.querySelector('[data-word-feedback="'+i+'"]').textContent='参考：'+word+'＝'+meaning+'。中文同义表达也可，复盘会结合你的答案检查。'};
  });
 }
 updateTaskProgress();
};
function updateTaskProgress(){for(const lang of ['en','de'])$(lang+'Progress').textContent='已跟读 '+vocabularyProgress.filter(x=>x.word.startsWith(lang==='en'?'英语：':'德语：')&&x.done).length+' / '+dailyWords(lang).length+' 个词'}
renderPractice=function(){
 const old=new Map(sentencePractice.map(x=>[x.word,x]));sentencePractice=['en','de'].flatMap(lang=>SENTENCE_INDEXES[lang][lessonIndex()].map(i=>{const word=dailyWords(lang)[i][0],key=taskKey(lang,word);return {word:key,sentence:(old.get(key)||old.get(word))?.sentence||''}}));
 for(const lang of ['en','de']){const items=sentencePractice.filter(x=>x.word.startsWith(lang==='en'?'英语：':'德语：')),root=$(lang+'Sentences');root.innerHTML=items.map((item,i)=>'<label>'+safeHtml(item.word)+'<textarea data-writing="'+i+'" placeholder="用这个词写一句与工作、求职或出国有关的话"></textarea></label>').join('');items.forEach((item,i)=>{const input=root.querySelector('[data-writing="'+i+'"]');input.value=item.sentence;input.oninput=()=>{item.sentence=input.value;scheduleDraft()}})}
};
const outputSection=taskSection('03 · 今日完整作业与学习记录','daily-output');germanStudy.after(outputSection);
outputSection.open=false;
const outputLink=document.createElement('a');outputLink.href='#daily-output';outputLink.textContent='写作与完整作业';taskNav.append(outputLink);
const OUTPUT_PROMPTS=[
 ['英语 / 听力四组得分与错题类型','德语 / 五句自我介绍练习记录'],
 ['英语 / 阅读每道错题的原文证据与错因','德语 / 三个基本问答'],
 ['英语 / 书信初稿（至少150词）','英语 / 看讲解后的修改稿','英语 / 书信三个要点与开头结尾检查'],
 ['英语 / 三段口语：自我介绍、销售经历、海外工作（各2分钟）的秒数与卡顿','英语 / 销售经历段落文字转写','德语 / Ich bin、Ich komme aus、Ich wohne in 各三句（共9句）'],
 ['英语 / 地图与填空得分、漏听的5个词或短语'],
 ['英语 / 听力错题复做得分、判断与匹配得分、两条错因','德语 / 本周60词双向自测结果','德语 / 一分钟自我介绍全文、两次录音记录'],
 ['英语 / 本周书信改写全文（至少150词）','英语 / 20词默写结果','英语 / 本周学习总结','德语 / 20词周测结果、可独立说的句子与本周总结']
];
function renderOutputs(){const root=outputSection.querySelector('.task-content');const prompts=['英语 / 学习分钟','德语 / 学习分钟',...OUTPUT_PROMPTS[lessonIndex()]];root.innerHTML=prompts.map((prompt,i)=>'<label>'+safeHtml(prompt)+'<textarea data-output="'+i+'" placeholder="在这里完成并保存，复盘会读取"></textarea><small data-count="'+i+'"></small></label>').join('');prompts.forEach((prompt,i)=>{let item=languageExercises.find(x=>x.prompt===prompt);if(!item){item={prompt,response:'',answer:''};languageExercises.push(item)}const input=root.querySelector('[data-output="'+i+'"]'),count=root.querySelector('[data-count="'+i+'"]');input.value=item.response;const update=()=>{count.textContent='已写 '+input.value.trim().split(/\s+/).filter(Boolean).length+' 词'};input.oninput=()=>{item.response=input.value;update();scheduleDraft()};update()})}
const baseRenderExercises=renderExercises;
renderExercises=function(){const saved=languageExercises.filter(x=>x.prompt.includes(' / '));languageExercises=languageExercises.filter(x=>!x.prompt.includes(' / '));baseRenderExercises();languageExercises.push(...saved);renderOutputs()};
// Save the complete payload locally immediately, and to Cloudflare after typing stops.
const localDraftKey=()=> 'hsm-full-draft:'+viewedDate;
scheduleDraft=function(){const payload={...draftPayload(),updatedAt:new Date().toISOString()};localStorage.setItem(localDraftKey(),JSON.stringify(payload));$('saveNotice').textContent='已暂存到本机，正在同步云端…';clearTimeout(draftTimer);draftTimer=setTimeout(()=>saveCloudDraft(payload),700)};
saveCloudDraft=async function(payload=draftPayload()){try{const response=await fetch(API+'/draft',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const body=await response.json();if(!response.ok||!body.ok)throw new Error(body.error||'同步失败');if(payload.date===viewedDate)$('saveNotice').textContent='已保存到云端 · '+new Date().toLocaleTimeString();}catch{if(payload.date===viewedDate)$('saveNotice').textContent='已保存在本机，云端同步失败；请联网后点“重试保存”。'}};
const retry=document.createElement('button');retry.type='button';retry.className='secondary';retry.textContent='重试保存';retry.onclick=()=>saveCloudDraft();saveNotice.after(retry);
restoreCloudDraft=async function(){const date=viewedDate;let local=null;try{local=JSON.parse(localStorage.getItem(localDraftKey())||'null')}catch{}let cloud=null;try{const response=await fetch(API+'/draft?date='+encodeURIComponent(date)+'&deviceId='+encodeURIComponent(deviceId()));if(response.ok)cloud=(await response.json()).draft}catch{}if(date!==viewedDate)return;const draft=local&&(!cloud||local.updatedAt>=cloud.updatedAt)?local:cloud;if(!draft)return;
 lines=sentenceLines(draft.sentences||lines);$('sentences').value=lines.join('\n');results=lines.map(line=>trustedResults(draft.results).find(x=>x?.target===line));recordingEvidence=draft.recordingEvidence||[];vocabularyProgress=draft.vocabularyProgress||[];languageExercises=draft.languageExercises||[];sentencePractice=draft.sentencePractice||[];englishTasks=draft.englishTasks||[];current=0;render();renderExercises();renderVocabulary();renderPractice();renderEnglish();$('saveNotice').textContent=local===draft?'已恢复本机暂存':'已恢复云端进度';
};
const taskStyle=document.createElement('style');taskStyle.textContent='.task-nav{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}.task-nav a{padding:10px 14px;background:#e7edf8;border-radius:9px;text-decoration:none}.task-section>summary{font-size:21px;font-weight:700;cursor:pointer;padding:8px 0}.task-content{padding-top:12px}.task-section .words{grid-template-columns:repeat(2,minmax(0,1fr))}.word details{margin-top:10px}.word input{min-width:0}.task-section{scroll-margin-top:15px}#saveNotice{font-size:14px;color:#52647a}audio{max-width:100%}@media(max-width:600px){.task-section .words{grid-template-columns:1fr}.task-nav a{flex:1 1 35%;text-align:center}.task-section{padding:12px}}';document.head.append(taskStyle);
// Initialization follows the retrieval-practice and review enhancements.
