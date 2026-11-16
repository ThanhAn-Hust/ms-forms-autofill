(function (root) {
  'use strict';

  const ns = (root.MSFormsAutofill = root.MSFormsAutofill || {});

  function normalizeText(raw) {
    if (raw === null || raw === undefined) return '';
    return String(raw)
      .normalize('NFC')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\u00A0/g, ' ')
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function cleanQuestionTitle(raw) {
    if (raw === null || raw === undefined) return '';
    let text = String(raw)
      .normalize('NFC')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\u00A0/g, ' ')
      .trim();

    text = text.replace(
      /^\s*(?:câu\s*\d+\s*[:\.\)]?|question\s*\d+\s*[:\.\)]?|\d+\s*[\.\)])\s*/iu,
      ''
    );

    text = text.replace(
      /\s*\(\s*\d+(?:[.,]\d+)?\s*(?:điểm|point|points|pt|pts)\s*\)/giu,
      ''
    );

    let prev;
    do {
      prev = text;
      text = text.replace(/\s*\*+\s*$/u, '');
    } while (text !== prev);

    return normalizeText(text);
  }

  function cleanOptionText(raw) {
    if (raw === null || raw === undefined) return '';
    let text = String(raw)
      .normalize('NFC')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\u00A0/g, ' ')
      .trim();

    let prev;
    do {
      prev = text;
      text = text.replace(/^[○◯●◉☐☑□■✓✔✗✘•‣◦]\s*/u, '');
    } while (text !== prev);

    text = text.replace(/^[a-zA-Z]\s*[\.\)]\s+/u, '');
    return normalizeText(text);
  }

  function getBigrams(str) {
    const map = new Map();
    for (let i = 0; i < str.length - 1; i++) {
      const bg = str.slice(i, i + 2);
      map.set(bg, (map.get(bg) || 0) + 1);
    }
    return map;
  }

  function stringSimilarity(a, b) {
    const na = normalizeText(a);
    const nb = normalizeText(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1.0;

    let score = 0;
    if (na.length >= 2 && nb.length >= 2) {
      const mapA = getBigrams(na);
      const mapB = getBigrams(nb);
      let intersection = 0;
      for (const [bg, countA] of mapA.entries()) {
        const countB = mapB.get(bg) || 0;
        if (countB > 0) {
          intersection += Math.min(countA, countB);
        }
      }
      score = (2 * intersection) / (na.length - 1 + (nb.length - 1));
    }

    if (na.includes(nb) || nb.includes(na)) {
      const minLen = Math.min(na.length, nb.length);
      const ratio = minLen / Math.max(na.length, nb.length);
      if (ratio >= 0.75 || (minLen >= 18 && ratio >= 0.45)) {
        score = Math.max(score, 0.80 + 0.18 * ratio);
      }
    }

    return score;
  }

  function computeOptionOverlap(domOptionTexts, storedOptionTexts) {
    const domOpts = (Array.isArray(domOptionTexts) ? domOptionTexts : [])
      .map(cleanOptionText)
      .filter(Boolean);
    const storedOpts = (Array.isArray(storedOptionTexts) ? storedOptionTexts : [])
      .map(cleanOptionText)
      .filter(Boolean);

    if (domOpts.length === 0 || storedOpts.length === 0) return 0;

    let matched = 0;
    for (const d of domOpts) {
      const hasMatch = storedOpts.some(
        (s) => d === s || stringSimilarity(d, s) >= 0.85
      );
      if (hasMatch) matched++;
    }
    return matched / Math.max(domOpts.length, storedOpts.length);
  }

  function findBestQuestionMatch(
    domQuestionTitle,
    domOptionTexts,
    storedQuestions,
    minScore = 0.75
  ) {
    const cleanDomTitle = cleanQuestionTitle(domQuestionTitle);
    if (!cleanDomTitle || !Array.isArray(storedQuestions) || storedQuestions.length === 0) {
      return null;
    }

    const candidates = [];
    for (const q of storedQuestions) {
      if (!q || !q.title) continue;
      const cleanStoredTitle = cleanQuestionTitle(q.title);
      if (!cleanStoredTitle) continue;
      const score = stringSimilarity(cleanDomTitle, cleanStoredTitle);
      if (score >= minScore) {
        const optionOverlap = computeOptionOverlap(domOptionTexts, q.options);
        candidates.push({ question: q, score, optionOverlap });
      }
    }

    if (candidates.length === 0) return null;

    let maxTitleScore = 0;
    for (const c of candidates) {
      if (c.score > maxTitleScore) maxTitleScore = c.score;
    }

    const nearTop = candidates.filter((c) => c.score >= maxTitleScore - 0.05);
    nearTop.sort((a, b) => {
      if (Math.abs(b.optionOverlap - a.optionOverlap) > 1e-6) {
        return b.optionOverlap - a.optionOverlap;
      }
      return b.score - a.score;
    });

    const winner = nearTop[0];
    return { question: winner.question, score: winner.score };
  }

  function isOptionSelected(domOptionText, selectedAnswers, minScore = 0.80) {
    if (!Array.isArray(selectedAnswers) || selectedAnswers.length === 0) {
      return false;
    }
    const normDom = normalizeText(domOptionText);
    const cleanDom = cleanOptionText(domOptionText);
    if (!normDom && !cleanDom) return false;

    for (const ans of selectedAnswers) {
      const normAns = normalizeText(ans);
      const cleanAns = cleanOptionText(ans);
      if (normDom && normDom === normAns) return true;
      if (cleanDom && cleanDom === cleanAns) return true;
      if (cleanDom && cleanAns && stringSimilarity(cleanDom, cleanAns) >= minScore) {
        return true;
      }
    }
    return false;
  }

  ns.normalizeText = normalizeText;
  ns.cleanQuestionTitle = cleanQuestionTitle;
  ns.cleanOptionText = cleanOptionText;
  ns.stringSimilarity = stringSimilarity;
  ns.findBestQuestionMatch = findBestQuestionMatch;
  ns.isOptionSelected = isOptionSelected;
})(typeof globalThis !== 'undefined' ? globalThis : window);
