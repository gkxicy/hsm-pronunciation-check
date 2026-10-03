(function (root) {
  'use strict';
  function packsForCourse(data, course, language) {
    const ids = (data?.bindings || []).filter(b => b.date === course?.date && b.language === language).map(b => b.packId);
    return ids.map(id => data.packs.find(p => p.id === id)).filter(Boolean);
  }
  function questionId(date, language, packId, itemId) {
    return `external:${language}:${date}:${packId}:${itemId}`;
  }
  function materialUrls(pack) {
    return [...new Set([pack.pageUrl, pack.questionUrl, pack.answerUrl, ...(pack.extraUrls || [])].filter(Boolean))];
  }
  function listeningMismatch(course) {
    const years = values => new Set((values || []).map(u=>/\/sample(\d{4})\//.exec(u)?.[1]).filter(Boolean));
    const audio = years(course.audioUrls?.length ? course.audioUrls : [course.audioUrl]);
    const book = years(course.listeningBookUrls?.length ? course.listeningBookUrls : [course.listeningBookUrl]);
    return audio.size > 0 && book.size > 0 && [...audio].some(y=>!book.has(y));
  }
  const api = {packsForCourse, questionId, materialUrls, listeningMismatch};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ExternalExercises = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
