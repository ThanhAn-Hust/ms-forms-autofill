import test from 'node:test';
import assert from 'node:assert/strict';

import '../extension/src/matcher.js';

const {
  normalizeText,
  cleanQuestionTitle,
  cleanOptionText,
  stringSimilarity,
  findBestQuestionMatch,
  isOptionSelected,
} = globalThis.MSFormsAutofill || {};

test('normalizeText handles Vietnamese NFD to NFC, curly quotes, dashes, and whitespace', () => {
  const nfd = 'Ti\u0065\u0302\u0301ng   Vi\u0065\u0323\u0302t \u201cChu\u1EA9n\u201D \u2013 2026';
  assert.equal(normalizeText(nfd), 'tiếng việt "chuẩn" - 2026');
  assert.equal(normalizeText(null), '');
  assert.equal(normalizeText('  Hello\u00A0\u200B World  '), 'hello world');
});

test('cleanQuestionTitle strips leading numbers, prefixes, point badges, and required asterisks', () => {
  assert.equal(
    cleanQuestionTitle('1. Thủ đô của Việt Nam là gì? * (2 Điểm)'),
    'thủ đô của việt nam là gì?'
  );
  assert.equal(
    cleanQuestionTitle('Câu 12: Chọn các ngôn ngữ lập trình (1.5 points)*'),
    'chọn các ngôn ngữ lập trình'
  );
  assert.equal(
    cleanQuestionTitle('Question 3) What is HTTP status 200? (1 pt)'),
    'what is http status 200?'
  );
  assert.equal(
    cleanQuestionTitle('2026 là năm nào?'),
    '2026 là năm nào?'
  );
});

test('cleanOptionText strips bullets, checkboxes, and optional A/B/C prefixes', () => {
  assert.equal(cleanOptionText('○ Hà Nội'), 'hà nội');
  assert.equal(cleanOptionText('◉  A. Thành phố Hồ Chí Minh'), 'thành phố hồ chí minh');
  assert.equal(cleanOptionText('☑ B) Đà Nẵng'), 'đà nẵng');
  assert.equal(cleanOptionText('C++'), 'c++');
});

test('stringSimilarity returns 1.0 on exact normalized match and boosts high-ratio containment', () => {
  assert.equal(stringSimilarity('Hà Nội', '  hà nội '), 1.0);
  assert.equal(stringSimilarity('', 'abc'), 0);
  const simPartial = stringSimilarity(
    'giao thức truyền tải siêu văn bản',
    'giao thức truyền tải siêu văn bản (http)'
  );
  assert.ok(simPartial >= 0.85, `Expected >= 0.85, got ${simPartial}`);
  const simDifferent = stringSimilarity('hà nội là thủ đô', 'tokyo là thủ đô nhật bản');
  assert.ok(simDifferent < 0.6, `Expected < 0.6, got ${simDifferent}`);
});

test('findBestQuestionMatch matches shuffled questions and breaks ties via option overlap', () => {
  const stored = [
    {
      id: 'q1',
      number: 1,
      title: 'Chọn đáp án đúng',
      type: 'choice',
      options: ['Python', 'JavaScript', 'Ruby'],
      answers: ['Python'],
    },
    {
      id: 'q2',
      number: 2,
      title: 'Chọn đáp án đúng',
      type: 'choice',
      options: ['Hà Nội', 'Đà Nẵng', 'Huế'],
      answers: ['Hà Nội'],
    },
    {
      id: 'q3',
      number: 3,
      title: 'Thủ đô của Nhật Bản là thành phố nào?',
      type: 'text',
      options: [],
      answers: ['Tokyo'],
    },
  ];

  const tieMatch = findBestQuestionMatch(
    '5. Chọn đáp án đúng (1 Điểm) *',
    ['Huế', 'Hà Nội', 'Đà Nẵng'],
    stored
  );
  assert.ok(tieMatch);
  assert.equal(tieMatch.question.id, 'q2');
  assert.ok(tieMatch.score >= 0.99);

  const shuffledTextMatch = findBestQuestionMatch(
    '1. Thủ đô của Nhật Bản là thành phố nào?',
    [],
    stored
  );
  assert.ok(shuffledTextMatch);
  assert.equal(shuffledTextMatch.question.id, 'q3');

  const noMatch = findBestQuestionMatch(
    'Câu hỏi hoàn toàn không liên quan gì cả',
    ['X', 'Y'],
    stored
  );
  assert.equal(noMatch, null);
});

test('isOptionSelected handles exact, prefix-stripped, NFD/NFC, and fuzzy option matches', () => {
  const answers = ['Thành phố Hồ Chí Minh', 'Đà Nẵng'];
  assert.equal(isOptionSelected('B. Tha\u0300nh pho\u0302\u0301 Ho\u0302\u0300 Chi\u0301 Minh', answers), true);
  assert.equal(isOptionSelected('Đà Nẵng', answers), true);
  assert.equal(isOptionSelected('Hà Nội', answers), false);
  assert.equal(isOptionSelected('Hà Nội', []), false);
});
