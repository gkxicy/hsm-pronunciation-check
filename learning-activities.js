(function (root) {
  'use strict';
  const version = '20261007-actionable-practice-1';
  // Authored reading practice, selected by the actual vocabulary group. These are
  // teaching examples, never quotations from an external exam or the user's work.
  const passages = {
    'daily routine': 'My daily routine is simple. I check my schedule in the morning. I usually study English in the evening.',
    sometimes: 'I sometimes arrive early. I often read before work. After work, I usually go home.',
    study: 'I study English every day. I review new words and practice speaking. If I forget a word, I ask a question.',
    example: 'I want to improve my English. When I make a mistake, I ask my teacher to explain it. A clear example helps me understand the meaning.',
    company: 'I work for a small company. Our manager meets a customer in the morning. They discuss a new product and its price.',
    report: 'I read the sales report at work. We have a problem with our service. My team is trying to find a solution.',
    friendly: 'My teacher is friendly and patient. I feel nervous when I speak English. With practice, I feel more confident.',
    important: 'It is important to practice every day. Some tasks are difficult, but this example is easy. I find the lesson useful.',
    city: 'I live in a busy city. My office is near the station. There is a large building across the street.',
    transport: 'I usually travel by bus. Today I need to take a train. I will leave early and arrive before nine.',
    increase: 'The number of customers can increase in summer. Sales sometimes fall in winter. We hope our business will grow.',
    percentage: 'Half of our customers order online. The total is more than last year. The average price is still the same.',
    say: 'I want to ask a question. We can discuss the plan after lunch. I agree with your idea, but I suggest a different time.',
    describe: 'Please describe your idea clearly. Give one reason for your opinion. A small detail can make your answer more clear.',
    health: 'Good sleep is important for my health. I try to exercise in my free time. This habit helps me manage stress.',
    hobby: 'Travel is my favourite hobby. I make a plan before each trip. My goal is to enjoy the journey without spending too much money.',
    make: 'I need to make a plan. Please give me a little time. I want to find a way to keep learning.',
    use: 'I use English at work. My friends help me when I try something new. I want to continue after I finish this course.',
    choose: 'We need to choose a place for the meeting. Please decide before we move the tables. We can create more space near the door.',
    develop: 'I want to develop new skills. My job requires careful planning. I am learning to manage my time and become more confident.',
    because: 'I study English because I want to travel. The lessons are useful, but some tasks are difficult. Although I make mistakes, I keep practicing.',
    firstly: 'Firstly, read the question carefully. Secondly, give a reason and an example. Finally, check your answer.',
    information: 'We need more information before we start. The research method should be clear. We will compare the data and discuss the result.',
    system: 'A good education system has many benefits. Technology can support learning. However, every new system also has drawbacks.',
    curriculum: 'A balanced curriculum includes vocational training. Teachers can encourage critical thinking. Learning outcomes should reflect what students can actually do.',
    'higher education': 'Higher education can develop practical skills. Online learning offers another way to study. Lifelong learning continues after formal education ends.',
    'carbon emissions': 'Renewable energy can help reduce carbon emissions. Burning fossil fuels contributes to air pollution. Conservation also matters for biodiversity.',
    'sustainable development': 'Sustainable development requires careful use of natural resources. Communities can recycle more waste. Public awareness helps people consider their environmental impact.',
    'artificial intelligence': 'Artificial intelligence can support routine tasks. Automation may improve productivity. However, data privacy and cybersecurity still require attention.',
    'digital divide': 'The digital divide limits access to information. Some people lack a suitable device. A useful online platform should be easy to access.',
    'public health': 'Preventive care is important for public health. A balanced diet supports physical health. Mental well-being also deserves attention.',
    'medical treatment': 'Medical treatment is only one part of healthcare. Physical activity and good nutrition also matter. Health inequality can affect access to these resources.',
    'job satisfaction': 'Job satisfaction depends on more than pay. Work-life balance and job security also matter. Professional development can improve career prospects.',
    'flexible working': 'Flexible working can help people manage their time. However, a heavy workload can still cause stress. Transferable skills may improve employment opportunities.',
    urbanisation: 'Urbanisation can put pressure on public infrastructure. Good urban planning includes public transport. Green spaces can make crowded areas more pleasant.',
    'cost of living': 'The cost of living affects where people choose to live. Suburban areas may offer more space. However, commuting can reduce quality of life.',
    'public expenditure': 'Public expenditure supports essential public services. Tax revenue helps pay for these services. Budget allocation requires careful policy making.',
    'public interest': 'Long-term planning should consider the public interest. Economic policy can influence investment. Authorities also have a social responsibility.',
    globalisation: 'Globalisation connects countries through international trade. Foreign investment can create new opportunities. Cultural exchange is another part of this process.',
    'global competition': 'Global competition can affect a local business. International cooperation may create new opportunities. Each decision involves a trade-off.',
    'cultural heritage': 'Cultural heritage can strengthen cultural identity. Social media helps people share local traditions. However, misinformation can distort public opinion.',
    advertising: 'Advertising can influence consumer behaviour. Media literacy helps people assess these messages. News coverage should be examined carefully too.',
    'crime rate': 'Law enforcement aims to protect public safety. Rehabilitation can help people return to society. A prison sentence alone may not address every cause of crime.',
    'repeat offender': 'The legal system must respond to a repeat offender. Prevention also requires attention to the root cause. Community service may be suitable in some cases.',
    'mass tourism': 'Mass tourism can support the local economy. However, visitor numbers can create environmental pressure. Sustainable tourism considers these effects.',
    'road safety': 'Road safety matters to every traveller. Better cycling lanes can support safer journeys. A reliable rail network may reduce reliance on private vehicles.',
    'scientific research': 'Scientific research depends on careful experiments. Research findings should be supported by evidence. Ethical concerns must also be considered.',
    'technological breakthrough': 'A technological breakthrough may bring long-term benefits. Reliable analysis is needed to assess those benefits. A conclusion should follow the evidence.'
  };
  const norm = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[\s.,，。!！?？]/g, '');
  function readingLines(course) {
    const text = passages[course?.vocabulary?.[0]?.[0]];
    return text ? text.match(/[^.!?]+[.!?]/g).map(s => s.trim()) : [];
  }
  function sentenceWords(catalog, course) {
    const days = (catalog?.ielts || []).filter(d => d.date < course.date).slice(-6);
    const pool = days.length ? days : [course];
    const words = [], seen = new Set();
    for (let index = 0; index < 8 && words.length < 5; index++) for (const day of pool) {
      const pair = day.vocabulary?.[index];
      if (pair && !seen.has(pair[0]) && words.length < 5) {
        seen.add(pair[0]); words.push({word:pair[0], meaning:pair[1], day:day.day});
      }
    }
    return words;
  }
  function practiceForCourse(catalog, course) {
    const questions = [], retired = [], actions = new Set();
    for (const question of course.questions || []) {
      const prompt = question.stem || question.prompt;
      if (/重做.*错题|复习本周.*错词|今天Top3错题|每题写错误原因|同类题的处理规则/.test(prompt)) {
        actions.add('review'); retired.push(question); continue;
      }
      if (/从本周旧词中选5个造句/.test(prompt)) {
        retired.push(question);
        sentenceWords(catalog, course).forEach((item, index) => questions.push({
          ...question, id:`${question.id}-sentence-${index + 1}`, questionType:'constructed_response',
          prompt:`用 ${item.word}（${item.meaning}，${item.day}）写一个与你有关的完整英文句子。`,
          stem:`用 ${item.word}（${item.meaning}，${item.day}）造句`,
          answer:'', answerStatus:'manual', source:'lesson_vocabulary_sentence',
          explanation:'写一个包含所给词的完整句子；交代谁做什么，或谁是什么。检查主谓搭配、时态和句末标点。答案不唯一，提交后结合你的原句批改。'
        }));
        continue;
      }
      if (/把最差1句改写得更自然/.test(prompt)) { actions.add('revision'); retired.push(question); continue; }
      // These are instructions about a separate audio/text, not self-contained questions.
      if (question.answerStatus !== 'available' && /你听到|第一遍没听出|Transcript|文章主旨|定位词|原文依据|同义替换|同义表达|题干关键词|干扰项|原文的|不是NG|单篇用时|原音频/.test(prompt)) {
        actions.add('external'); retired.push(question); continue;
      }
      if (/录音30-60秒并记录1个卡顿点/.test(prompt)) { retired.push(question); continue; }
      if (/写作/.test(course.focus || '') && /^(写1个主题句|用because补1句原因|用for example补1句例子|合成一个4句短段落)/.test(prompt)) {
        retired.push(question);
        questions.push({...question, id:`${question.id}-guided-v1`,
          prompt:`练习主题：你为什么学习英语、准备怎样练习？${prompt}`,
          stem:`练习主题：你为什么学习英语、准备怎样练习？${prompt}`,
          explanation:'围绕同一个学习目标展开：先说明目标，再给出原因、具体练习例子和小结。示范结构：I want to ... because ... / For example, I ...。用自己的情况填充，答案不唯一。'});
      } else questions.push(question);
    }
    return {questions, retired, actions:[...actions]};
  }
  function resolveQuestion(catalog, external, id) {
    id = String(id || '').replace(/^review:/, '');
    const match = /^quiz:(\d{4}-\d{2}-\d{2}):(英语|日语):(meaning-to-word|word-to-meaning):(?:\d+:)?(.+)$/.exec(id);
    if (match) {
      const language = match[2] === '英语' ? 'en-US' : 'ja-JP';
      const course = catalog[language === 'en-US' ? 'ielts' : 'japanese'].find(d => d.date === match[1]);
      const pair = course?.vocabulary.find(p => norm(p[match[3] === 'meaning-to-word' ? 0 : 1]) === match[4]);
      if (!pair) return null;
      const answer = pair[match[3] === 'meaning-to-word' ? 0 : 1];
      return {id:`quiz:${match[1]}:${match[2]}:${match[3]}:${norm(answer)}`, language, date:match[1],
        prompt:match[3] === 'meaning-to-word' ? `看中文写单词：${pair[1]}` : `写出中文意思：${pair[0]}`,
        answer, answerStatus:'available', source:'vocabulary_quiz', explanation:`词汇对应：${pair[0]}＝${pair[1]}`};
    }
    for (const key of ['ielts','japanese']) for (const course of catalog?.[key] || []) {
      const q = course.questions?.find(q => q.id === id);
      if (q && q.answerStatus === 'available') return q;
    }
    const ext = /^external:(en-US|ja-JP):(\d{4}-\d{2}-\d{2}):([^:]+):([^:]+)$/.exec(id);
    if (!ext || !external?.bindings?.some(b => b.date === ext[2] && b.language === ext[1] && b.packId === ext[3])) return null;
    const pack = external.packs.find(p => p.id === ext[3]);
    const q = pack?.questions.find(q => q.id === ext[4]);
    return q ? {...q, id, prompt:`${pack.title} · ${q.locator}：${q.prompt}`, language:ext[1], date:ext[2], source:pack.questionUrl, answerStatus:'available'} : null;
  }
  function reviewQuestions(catalog, external, drafts, language, limit = 3) {
    const latest = new Map();
    for (const draft of drafts) for (const attempt of draft?.attempts || []) {
      if (attempt.language !== language || !attempt.user_answer?.trim()) continue;
      const question = resolveQuestion(catalog, external, attempt.question_id);
      if (!question) continue;
      const previous = latest.get(question.id);
      if (!previous || String(attempt.timestamp || '') >= String(previous.attempt.timestamp || '')) latest.set(question.id, {question,attempt});
    }
    return [...latest.values()].filter(({attempt}) => attempt.result === 'knowledge_error' && (!attempt.error_type || attempt.error_type === 'knowledge_error'))
      .sort((a,b) => String(b.attempt.timestamp).localeCompare(String(a.attempt.timestamp))).slice(0,limit)
      .map(({question,attempt}) => ({...question, id:`review:${question.id}`, previousAnswer:attempt.user_answer, previousTime:attempt.timestamp}));
  }
  const api = {version, readingLines, sentenceWords, practiceForCourse, resolveQuestion, reviewQuestions};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LearningActivities = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
