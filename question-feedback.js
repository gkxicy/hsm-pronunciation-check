// Feedback is scoped to the device that submitted it, never to a public plan.
const feedbackSection=taskSection('原题解析与我的作答批改','question-feedback');
$('englishTasks').parentElement.after(feedbackSection);
const feedbackRoot=feedbackSection.querySelector('.task-content');
const feedbackRefresh=document.createElement('button');feedbackRefresh.type='button';feedbackRefresh.textContent='刷新本日解析';
const feedbackList=document.createElement('div');feedbackRoot.append(feedbackRefresh,feedbackList);
let feedbackRequest=0;
async function loadQuestionFeedback(){
  const sequence=++feedbackRequest,date=viewedDate;
  feedbackList.textContent='正在读取本日提交对应的解析…';
  try{
    const response=await fetch(API+'/feedback?date='+encodeURIComponent(date),{headers:{Authorization:'Device '+deviceId()},cache:'no-store'});
    if(!response.ok)throw new Error('HTTP '+response.status);
    const body=await response.json();if(!body.ok)throw new Error('读取失败');
    if(sequence!==feedbackRequest||date!==viewedDate)return;
    feedbackList.replaceChildren();
    const records=Array.isArray(body.feedback)?body.feedback:[];
    if(!records.length){feedbackList.textContent='本日暂无已发布解析。提交后由复盘任务生成；这不代表你没完成。旧提交若没有设备归属，解析保存在私有 Obsidian 中。';return}
    records.sort((a,b)=>String(b.submittedAt).localeCompare(String(a.submittedAt)));
    for(const record of records){
      const label=document.createElement('p');label.textContent='对应提交：'+record.submittedAt+'（不代表此后的修改已批改）';feedbackList.append(label);
      for(const item of record.items||[]){
        const card=document.createElement('details');card.className='resource';
        const title=document.createElement('summary');title.textContent=item.title||'题目解析';card.append(title);
        for(const [key,name] of [['status','核验状态'],['question','原题与信息'],['requirements','题目要求'],['reasoning','解题过程'],['referenceAnswer','参考答案及说明'],['comparison','你的作答与修改'],['video','本题视频']]){
          const heading=document.createElement('h4'),text=document.createElement('p');heading.textContent=name;text.textContent=item[key]||'待补齐';text.style.whiteSpace='pre-wrap';card.append(heading,text);
        }
        for(const source of item.sources||[]){try{const url=new URL(source);if(url.protocol!=='https:')continue;const link=document.createElement('a');link.href=url.href;link.textContent='查看解析来源：'+url.hostname;link.target='_blank';link.rel='noopener noreferrer';link.style.display='block';card.append(link)}catch{}}
        feedbackList.append(card);
      }
    }
  }catch{
    if(sequence===feedbackRequest)feedbackList.textContent='解析服务暂不可用或尚未部署。已保存的作业不受影响；可以稍后刷新。';
  }
}
feedbackRefresh.onclick=loadQuestionFeedback;
const feedbackLoadDay=loadDay;loadDay=function(){feedbackLoadDay();void loadQuestionFeedback()};
void loadQuestionFeedback();
