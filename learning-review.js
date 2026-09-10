// Retrieval practice: one direction and one question at a time.
const wordLessonRenderer=renderVocabulary;
renderVocabulary=function(){wordLessonRenderer();for(const lang of ['en','de']){
 const root=$(lang+'Words');root.querySelectorAll('.word details').forEach(x=>x.remove());
 const controls=document.createElement('div');controls.className='quiz-controls';controls.innerHTML='<button type="button" data-direction="forward">随机测试：中文 → 外语</button><button type="button" class="secondary" data-direction="reverse">随机测试：外语 → 中文</button>';
 root.prepend(controls);controls.querySelectorAll('button').forEach(button=>button.onclick=()=>startWordQuiz(lang,button.dataset.direction));
}};
const quizDialog=document.createElement('dialog');quizDialog.className='word-quiz';document.body.append(quizDialog);
let activeQuiz=null;
function shuffleWords(words){const result=words.map(x=>[...x]);for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]]}if(result.length>1&&result.every((x,i)=>x[0]===words[i][0]))result.push(result.shift());return result}
function quizRecord(lang,direction){const prompt=(lang==='en'?'英语':'德语')+' / 随机词测 '+direction;let record=languageExercises.find(x=>x.prompt===prompt);if(!record){record={prompt,response:'',answer:''};languageExercises.push(record)}return record}
function startWordQuiz(lang,direction){const record=quizRecord(lang,direction);let stored;try{stored=JSON.parse(record.response)}catch{}activeQuiz={lang,direction,record,state:stored?.date===viewedDate&&stored.index<stored.words.length?stored:{date:viewedDate,words:shuffleWords(dailyWords(lang)),index:0,answers:[]}};quizDialog.showModal();paintQuiz()}
function persistQuiz(){activeQuiz.record.response=JSON.stringify(activeQuiz.state);scheduleDraft()}
function paintQuiz(){const {state,direction}=activeQuiz,index=state.index;quizDialog.innerHTML='<button type="button" class="secondary quiz-close">退出并保存</button><p class="hint">随机词汇测试 · '+(direction==='forward'?'中文 → 外语':'外语 → 中文')+'</p>';
 quizDialog.querySelector('.quiz-close').onclick=()=>{persistQuiz();quizDialog.close()};
 if(index>=state.words.length){quizDialog.insertAdjacentHTML('beforeend','<h2>本轮已完成</h2><p>已提交 '+state.answers.length+' 题。中文同义表达将由复盘核对。</p>');return}
 const [word,meaning]=state.words[index],answer=state.answers[index];
 quizDialog.insertAdjacentHTML('beforeend','<p>第 '+(index+1)+' / '+state.words.length+' 题</p><h2>'+safeHtml(direction==='forward'?meaning:word)+'</h2><label>你的答案<input id="quizAnswer" autocomplete="off" spellcheck="false"></label><button id="quizSubmit" type="button">提交答案</button><div id="quizFeedback" role="status"></div>');
 $('quizAnswer').value=answer?.response||state.pending||'';$('quizAnswer').oninput=()=>{state.pending=$('quizAnswer').value;persistQuiz()};
 $('quizSubmit').onclick=()=>{const response=$('quizAnswer').value.trim();if(!response){$('quizFeedback').textContent='请先填写答案。';return}const expected=direction==='forward'?word:meaning;state.answers[index]={word,question:direction==='forward'?meaning:word,response,expected,judgement:norm(response)===norm(expected)?'匹配':direction==='reverse'?'待核对同义表达':'需复习'};state.pending='';persistQuiz();revealQuizAnswer()};
 if(answer)revealQuizAnswer();else $('quizAnswer').focus();
}
function revealQuizAnswer(){const item=activeQuiz.state.answers[activeQuiz.state.index];$('quizAnswer').disabled=true;$('quizSubmit').hidden=true;$('quizFeedback').textContent=item.judgement+'。参考答案：'+item.expected;const next=document.createElement('button');next.textContent='下一题';next.onclick=()=>{activeQuiz.state.index++;persistQuiz();paintQuiz()};$('quizFeedback').append(document.createElement('br'),next)}
quizDialog.addEventListener('cancel',()=>{if(activeQuiz)persistQuiz()});
const reviewSection=taskSection('昨日少量补练与写作反馈','targeted-review');taskNav.after(reviewSection);
function renderTargetedReview(){const root=reviewSection.querySelector('.task-content'),items=planOverride?.carryover||[];root.replaceChildren();if(!items.length){root.textContent='没有已确认的昨日补练。今天按新任务学习。';reviewSection.open=false;return}reviewSection.open=true;for(const item of items){const card=document.createElement('article');card.className='resource';const heading=document.createElement('h3');heading.textContent=item.title;const feedback=document.createElement('p');feedback.textContent=item.feedback||'等待具体批改；先不要求整篇重写。';const prompt='补练 / '+item.title;let record=languageExercises.find(x=>x.prompt===prompt);if(!record){record={prompt,response:'',answer:''};languageExercises.push(record)}const input=document.createElement('textarea');input.placeholder='根据上面的具体反馈修改这一项';input.value=record.response;input.oninput=()=>{record.response=input.value;scheduleDraft()};card.append(heading,feedback,input);root.append(card)}}
const reviewOutputRenderer=renderOutputs;renderOutputs=function(){reviewOutputRenderer();renderTargetedReview()};
// A generic course is not an explanation of the specific question.
for(const day of [2,6]){for(const task of ENGLISH_TASKS[day])task.explanationUrl='';OUTPUT_PROMPTS[day].unshift('英语 / 本次写作原题全文（含三个要点）')}
const writingRenderer=renderEnglish;renderEnglish=function(){writingRenderer();if([2,6].includes(lessonIndex())){const notice=document.createElement('p');notice.className='score-card';notice.textContent='先保存原题和初稿。复盘会逐句解释问题并给出修改示范，再改指定部分。目前尚未核实这道原题的解析视频，不要求你凭通用课自己判断。';$('englishTasks').prepend(notice)}};
const quizStyle=document.createElement('style');quizStyle.textContent='.quiz-controls{grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap}.word-quiz{box-sizing:border-box;width:min(92vw,520px);max-height:90dvh;overflow:auto;border:0;border-radius:18px;padding:24px;color:#172033}.word-quiz::backdrop{background:#10233fee}.word-quiz h2{font-size:28px;margin:24px 0}.quiz-close{float:right}.word-quiz input{margin:10px 0 18px}.word-quiz button{min-height:44px}#targeted-review{border-left:4px solid #e9a441}.word{min-width:0}';document.head.append(quizStyle);
loadPlanOverride().finally(loadDay);
