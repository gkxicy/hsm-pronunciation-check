const GERMAN_SPEAKING_DAY4=['Ich bin [姓名].','Ich bin Chinese.','Ich bin Student.','Ich komme aus China.','Ich komme aus [省份].','Ich komme aus [城市].','Ich wohne in [城市].','Ich wohne in China.','Ich wohne hier.'];
let recordingSets={},recordingSetDate='',selectedRecordingLanguage=$('language').value,assessmentBusy=false;
function defaultRecordingLines(lang){if(lang==='de-DE')return lessonIndex()===3?GERMAN_SPEAKING_DAY4:lesson().sentences;return lessonIndex()===3?lessons[3].sentences:dailyWords('en').map(([word])=>word)}
function saveRecordingSet(){if(recordingSetDate!==viewedDate){recordingSets={};recordingSetDate=viewedDate;return}recordingSets[selectedRecordingLanguage]={sentences:sentenceLines($('sentences').value),results:results.filter(Boolean),recordingEvidence:[...recordingEvidence]}}
function switchRecordingLanguage(lang){
 if(activeRecorder||assessmentBusy){$('language').value=selectedRecordingLanguage;$('status').textContent='录音或识别尚未结束，请结束后再切换语言。';return}
 saveRecordingSet();selectedRecordingLanguage=lang;$('language').value=lang;
 const saved=recordingSets[lang];lines=sentenceLines(saved?.sentences||defaultRecordingLines(lang));results=lines.map(line=>(saved?.results||[]).find(item=>item?.target===line));recordingEvidence=saved?.recordingEvidence||[];current=0;
 $('sentences').value=lines.join('\n');$('playback').replaceChildren();render();
 $('recordingLanguageStatus').textContent=(lang==='de-DE'?'德语':'英语')+'朗读 · '+lines.length+' 项；切换只影响本区题目、示范音和识别语言。';
 $('status').textContent='已切换到'+(lang==='de-DE'?'德语':'英语')+'，请选择下方任意一句开始。';scheduleDraft();
}
const recordingLanguageStatus=document.createElement('p');recordingLanguageStatus.id='recordingLanguageStatus';recordingLanguageStatus.className='score-card';$('language').parentElement.after(recordingLanguageStatus);
const speakingVersion=document.createElement('small');speakingVersion.id='speakingVersion';speakingVersion.textContent='朗读模块版本：20260910-2';recordingLanguageStatus.after(speakingVersion);
$('language').onchange=()=>switchRecordingLanguage($('language').value);
const previousDraftPayload=draftPayload;draftPayload=function(){saveRecordingSet();return {...previousDraftPayload(),recordingSets}};
function restoreRecordingSets(draft){
 recordingSetDate=viewedDate;recordingSets=draft.recordingSets||{};
 let lang=draft.language==='德语'||draft.language==='de-DE'?'de-DE':draft.language==='英语'||draft.language==='en-US'?'en-US':lesson().lang;
 // Repair the old initialization bug only for an exact known English bank.
 // Keep its work under English; never discard or guess the language of custom text.
 const isDefaultEnglish=value=>sentenceLines(value||[]).join('\n')===lessons[3].sentences.join('\n');
 if(isDefaultEnglish(recordingSets['de-DE']?.sentences)&&!recordingSets['en-US']){recordingSets['en-US']=recordingSets['de-DE'];delete recordingSets['de-DE']}
 if(lang==='de-DE'&&!recordingSets[lang]&&isDefaultEnglish(draft.sentences)){
  recordingSets['en-US'] ||= {sentences:draft.sentences,results:draft.results||[],recordingEvidence:draft.recordingEvidence||[]};
  recordingSets['de-DE']={sentences:defaultRecordingLines('de-DE'),results:[],recordingEvidence:[]};
 }
 selectedRecordingLanguage=lang;$('language').value=lang;
 if(recordingSets[lang]){lines=sentenceLines(recordingSets[lang].sentences);results=lines.map(line=>(recordingSets[lang].results||[]).find(x=>x?.target===line));recordingEvidence=recordingSets[lang].recordingEvidence||[];$('sentences').value=lines.join('\n')}
 $('recordingLanguageStatus').textContent=(lang==='de-DE'?'德语':'英语')+'朗读 · '+lines.length+' 项；下拉框可切换对应题目。';
}
const priorSpeakingLoad=loadDay;loadDay=function(){recordingSets={};recordingSetDate=viewedDate;priorSpeakingLoad();selectedRecordingLanguage=$('language').value;$('recordingLanguageStatus').textContent=(selectedRecordingLanguage==='de-DE'?'德语':'英语')+'朗读 · '+lines.length+' 项'};
const priorAssess=assessRecording;assessRecording=async function(...args){assessmentBusy=true;$('language').disabled=true;try{return await priorAssess(...args)}finally{assessmentBusy=false;$('language').disabled=false}};
const priorEnglishRenderer=renderEnglish;
renderEnglish=function(){
 const section=$('englishTasks').parentElement;section.querySelector('h2').textContent='英语任务';const hint=section.querySelector('.hint');
 if(lessonIndex()!==3){hint.textContent='按本日题目要求作答；解析和批改在下方按提交记录查看。';priorEnglishRenderer();return}
 hint.textContent='本日是口语练习，不是阅读选择题。先看六句题目，替换括号内容，再点按钮到本页录音区练习。';
 const title=ENGLISH_TASKS[3][0].title,existing=englishTasks.find(x=>x.title===title);englishTasks=[{title,done:existing?.done||false,userAnswer:existing?.userAnswer||'',score:'',correctAnswer:'',evidence:'',note:existing?.note||''}];
 const root=$('englishTasks');root.replaceChildren();const list=document.createElement('ol');list.id='englishSpeakingQuestions';
 for(const line of lessons[3].sentences){const li=document.createElement('li');li.textContent=line;list.append(li)}
 const instruction=document.createElement('p');instruction.textContent='括号内换成真实信息；学位、工作经历也按实际情况修改，不符合的句子不要照读。';
 const button=document.createElement('button');button.type='button';button.id='startEnglishSpeaking';button.textContent='在本页练习这六句（英语）';button.onclick=()=>{switchRecordingLanguage('en-US');const panel=$('recording-panel');panel.open=true;panel.scrollIntoView({behavior:'smooth',block:'start'})};
 const completed=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=englishTasks[0].done;check.onchange=()=>{englishTasks[0].done=check.checked;scheduleDraft()};completed.append(check,'我已完成本次口语练习');root.append(instruction,list,button,completed);
 $('mistakeReview').textContent='口语不填写阅读题的正确答案、定位句或错题号；录音结果由提交记录进入复盘。';
};
renderEnglish();
