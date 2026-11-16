import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import '../extension/src/matcher.js';
import '../extension/src/dom-filler.js';

const {
  extractFormQuestionsFromDOM,
  setReactInputValue,
  autofillFormDOM,
} = globalThis.MSFormsAutofill || {};

function buildMockFormDocument() {
  const dom = new JSDOM(`<!DOCTYPE html>
  <html>
    <body>
      <div data-automation-id="questionItem" id="q-dom-1">
        <div data-automation-id="questionTitle">
          <span data-automation-id="questionOrdinal">1.</span>
          <span class="screen-reader-only">Question 1 Required</span>
          <span>Chọn các ngôn ngữ lập trình chạy trên trình duyệt:</span>
          <span aria-hidden="true">*</span>
        </div>
        <div data-automation-id="choiceItem">
          <label>
            <input type="checkbox" value="COBOL" checked />
            <span>COBOL</span>
          </label>
        </div>
        <div data-automation-id="choiceItem">
          <label>
            <input type="checkbox" value="WebAssembly" />
            <span>WebAssembly (hỗ trợ biên dịch từ nhiều ngôn ngữ như Rust, C++)</span>
          </label>
        </div>
        <div data-automation-id="choiceItem">
          <label>
            <input type="checkbox" value="JavaScript" />
            <span>JavaScript</span>
          </label>
        </div>
      </div>

      <div data-automation-id="questionItem" id="q-dom-2">
        <div data-automation-id="questionTitle">
          <span data-automation-id="questionOrdinal">2.</span>
          <span>Giao thức bảo mật của web viết tắt là gì?</span>
        </div>
        <input data-automation-id="textInput" type="text" value="" />
      </div>

      <div role="listitem" id="q-dom-3">
        <div data-automation-id="questionTitle">
          <span>Thủ đô của Việt Nam là gì? (1 Điểm)</span>
        </div>
        <div class="office-form-question-choice">
          <label>
            <input type="radio" name="q3" value="Đà Nẵng" />
            <span class="office-form-question-choice-text-span">Đà Nẵng</span>
          </label>
        </div>
        <div class="office-form-question-choice">
          <label>
            <input type="radio" name="q3" value="Hà Nội" />
            <span class="office-form-question-choice-text-span">Hà Nội</span>
          </label>
        </div>
      </div>

      <div data-automation-id="questionItem" id="q-dom-4">
        <div data-automation-id="questionTitle">
          <span>Câu hỏi mới chưa có trong PDF?</span>
        </div>
        <textarea data-automation-id="textInput"></textarea>
      </div>
    </body>
  </html>`);
  return dom;
}

test('extractFormQuestionsFromDOM extracts visible titles ignoring screen-reader and ordinal spans', () => {
  const dom = buildMockFormDocument();
  const extracted = extractFormQuestionsFromDOM(dom.window.document);

  assert.equal(extracted.length, 4);
  assert.equal(extracted[0].title, 'Chọn các ngôn ngữ lập trình chạy trên trình duyệt: *');
  assert.deepEqual(extracted[0].choices.map((c) => c.text), [
    'COBOL',
    'WebAssembly (hỗ trợ biên dịch từ nhiều ngôn ngữ như Rust, C++)',
    'JavaScript',
  ]);
  assert.equal(extracted[1].choices.length, 0);
  assert.ok(extracted[1].textInput);
  assert.equal(extracted[2].title, 'Thủ đô của Việt Nam là gì? (1 Điểm)');
  assert.equal(extracted[2].choices.length, 2);
});

test('setReactInputValue invokes native prototype setter and dispatches bubbling input and change events', () => {
  const dom = new JSDOM('<input type="text" id="inp" />');
  const { document, HTMLInputElement } = dom.window;
  const inp = document.getElementById('inp');

  const events = [];
  document.body.addEventListener('input', (e) => events.push(e.type));
  document.body.addEventListener('change', (e) => events.push(e.type));

  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  let setterCalledWith = null;
  Object.defineProperty(inp, 'value', {
    configurable: true,
    get() {
      return setterCalledWith ?? '';
    },
    set(val) {
      // Simulate React overriding instance value property
      setterCalledWith = `react-trapped:${val}`;
    },
  });

  setReactInputValue(inp, 'HTTPS', dom.window);

  // Native prototype setter bypasses instance trap, updating underlying DOM value
  const nativeGetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').get;
  assert.equal(nativeGetter.call(inp), 'HTTPS');
  assert.ok(events.includes('input'));
  assert.ok(events.includes('change'));
  assert.ok(nativeSetter);
});

test('autofillFormDOM fills shuffled radio, multi-checkbox (unchecking wrong ones), text inputs, and marks unmatched', () => {
  const dom = buildMockFormDocument();
  const doc = dom.window.document;

  const storedQuestions = [
    {
      id: 'q1',
      number: 1,
      title: 'Thủ đô của Việt Nam là gì?',
      type: 'choice',
      options: ['Hà Nội', 'Đà Nẵng'],
      answers: ['Hà Nội'],
    },
    {
      id: 'q2',
      number: 2,
      title: 'Chọn các ngôn ngữ lập trình chạy trên trình duyệt:',
      type: 'choice',
      options: ['JavaScript', 'COBOL', 'WebAssembly (hỗ trợ biên dịch từ nhiều ngôn ngữ như Rust, C++)'],
      answers: ['JavaScript', 'WebAssembly (hỗ trợ biên dịch từ nhiều ngôn ngữ như Rust, C++)'],
    },
    {
      id: 'q3',
      number: 3,
      title: 'Giao thức bảo mật của web viết tắt là gì?',
      type: 'text',
      options: [],
      answers: ['HTTPS'],
    },
  ];

  const summary = autofillFormDOM(doc, storedQuestions, dom.window);

  assert.equal(summary.totalOnPage, 4);
  assert.equal(summary.matchedCount, 3);
  assert.equal(summary.filledCount, 3);
  assert.deepEqual(summary.unmatchedTitles, ['Câu hỏi mới chưa có trong PDF?']);

  // Verify Q1 checkboxes (COBOL unchecked, WebAssembly & JavaScript checked)
  const q1Inputs = doc.querySelectorAll('#q-dom-1 input[type="checkbox"]');
  assert.equal(q1Inputs[0].checked, false);
  assert.equal(q1Inputs[1].checked, true);
  assert.equal(q1Inputs[2].checked, true);
  assert.equal(doc.getElementById('q-dom-1').getAttribute('data-ms-autofill-status'), 'filled');

  // Verify Q2 text input
  const q2Input = doc.querySelector('#q-dom-2 input');
  assert.equal(q2Input.value, 'HTTPS');
  assert.equal(doc.getElementById('q-dom-2').getAttribute('data-ms-autofill-status'), 'filled');

  // Verify Q3 radio
  const q3Radios = doc.querySelectorAll('#q-dom-3 input[type="radio"]');
  assert.equal(q3Radios[0].checked, false);
  assert.equal(q3Radios[1].checked, true);
  assert.equal(doc.getElementById('q-dom-3').getAttribute('data-ms-autofill-status'), 'filled');

  // Verify Q4 unmatched
  assert.equal(doc.getElementById('q-dom-4').getAttribute('data-ms-autofill-status'), 'unmatched');
});
