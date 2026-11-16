(function (root) {
  'use strict';

  const ns = (root.MSFormsAutofill = root.MSFormsAutofill || {});

  const IGNORED_SELECTOR =
    '.screen-reader-only, .sr-only, [class*="screen-reader"], [data-automation-id="questionOrdinal"], input, textarea, style, script, svg';

  function extractVisibleText(el) {
    if (!el) return '';
    const parts = [];

    function walk(node) {
      if (!node) return;
      if (node.nodeType === 3) {
        const text = node.nodeValue;
        if (text && text.trim()) {
          parts.push(text.trim());
        }
        return;
      }
      if (node.nodeType !== 1) return;
      if (typeof node.matches === 'function' && node.matches(IGNORED_SELECTOR)) {
        return;
      }
      for (let child = node.firstChild; child; child = child.nextSibling) {
        walk(child);
      }
    }

    walk(el);
    return parts.join(' ').normalize('NFC').replace(/\s+/g, ' ').trim();
  }

  function findQuestionContainers(doc) {
    if (!doc || typeof doc.querySelectorAll !== 'function') return [];
    const candidates = Array.from(
      doc.querySelectorAll(
        '[data-automation-id="questionItem"], .office-form-question, [role="listitem"]'
      )
    );
    const primarySet = new Set(
      candidates.filter((el) =>
        el.matches('[data-automation-id="questionItem"], .office-form-question')
      )
    );

    const selected = [];
    for (const el of candidates) {
      const isPrimary = primarySet.has(el);
      if (!isPrimary) {
        const hasTitle = Boolean(
          el.querySelector(
            '[data-automation-id="questionTitle"], .question-title-box, .office-form-question-title'
          )
        );
        if (!hasTitle) continue;
        // Skip if a primary container is inside or wraps this listitem
        const overlapsPrimary = Array.from(primarySet).some(
          (p) => p === el || p.contains(el) || el.contains(p)
        );
        if (overlapsPrimary) continue;
      }
      if (!selected.some((s) => s.contains(el))) {
        selected.push(el);
      }
    }

    return selected;
  }

  function extractChoices(container) {
    let choiceNodes = Array.from(
      container.querySelectorAll('[data-automation-id="choiceItem"], .office-form-question-choice')
    );

    if (choiceNodes.length === 0) {
      const labels = Array.from(container.querySelectorAll('label')).filter((lbl) =>
        Boolean(lbl.querySelector('input[type="radio"], input[type="checkbox"]'))
      );
      if (labels.length > 0) {
        choiceNodes = labels;
      } else {
        choiceNodes = Array.from(container.querySelectorAll('[role="radio"], [role="checkbox"]'));
      }
    }

    const choices = [];
    for (const el of choiceNodes) {
      const input = el.querySelector('input[type="radio"], input[type="checkbox"]');
      const roleEl =
        el.getAttribute && (el.getAttribute('role') === 'radio' || el.getAttribute('role') === 'checkbox')
          ? el
          : el.querySelector('[role="radio"], [role="checkbox"]');

      const kind =
        (input && input.type === 'checkbox') ||
        (roleEl && roleEl.getAttribute('role') === 'checkbox')
          ? 'checkbox'
          : 'radio';

      const labelEl =
        el.querySelector(
          '[data-automation-id="choiceLabel"], .office-form-question-choice-text-span, span.text-format-content'
        ) || el;

      const text = extractVisibleText(labelEl);
      if (!text) continue;

      const clickTarget = input || roleEl || el.querySelector('label') || el;
      const isChecked = () => {
        if (input) return Boolean(input.checked);
        if (roleEl) return roleEl.getAttribute('aria-checked') === 'true';
        return false;
      };

      choices.push({ element: el, text, kind, clickTarget, isChecked });
    }

    return choices;
  }

  function extractTextInput(container) {
    const candidates = Array.from(
      container.querySelectorAll(
        '[data-automation-id="textInput"], textarea, input[type="text"], input[type="email"], input[type="number"], input[type="url"], input:not([type])'
      )
    );

    for (const candidate of candidates) {
      if (candidate.tagName === 'TEXTAREA') return candidate;
      if (candidate.tagName === 'INPUT') {
        const t = (candidate.getAttribute('type') || 'text').toLowerCase();
        if (t !== 'radio' && t !== 'checkbox' && t !== 'hidden' && t !== 'submit' && t !== 'button') {
          return candidate;
        }
      } else {
        const inner = candidate.querySelector('textarea, input');
        if (inner) return inner;
      }
    }
    return null;
  }

  function extractFormQuestionsFromDOM(doc) {
    const containers = findQuestionContainers(doc);
    const questions = [];

    for (const container of containers) {
      const titleEl = container.querySelector(
        '[data-automation-id="questionTitle"], .question-title-box, .office-form-question-title'
      );
      const title = extractVisibleText(titleEl);
      if (!title) continue;

      const choices = extractChoices(container);
      const textInput = choices.length === 0 ? extractTextInput(container) : null;

      questions.push({
        container,
        title,
        choices,
        textInput,
      });
    }

    return questions;
  }

  function setReactInputValue(inputEl, value, win) {
    if (!inputEl) return;
    const view = win || inputEl.ownerDocument?.defaultView || root;
    const strVal = value === null || value === undefined ? '' : String(value);

    const proto =
      inputEl.tagName === 'TEXTAREA'
        ? view.HTMLTextAreaElement?.prototype
        : view.HTMLInputElement?.prototype;

    const descriptor = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;

    try {
      if (typeof inputEl.focus === 'function') {
        inputEl.focus();
      }
      inputEl.dispatchEvent(new view.Event('focus', { bubbles: true }));
    } catch (_) {
      // Ignore focus errors in headless environments
    }

    if (descriptor && typeof descriptor.set === 'function') {
      descriptor.set.call(inputEl, strVal);
    } else {
      inputEl.value = strVal;
    }

    let inputEvent;
    try {
      inputEvent = new view.InputEvent('input', {
        bubbles: true,
        cancelable: true,
        data: strVal,
        inputType: 'insertText',
      });
    } catch (_) {
      inputEvent = new view.Event('input', { bubbles: true, cancelable: true });
    }
    inputEl.dispatchEvent(inputEvent);
    inputEl.dispatchEvent(new view.Event('change', { bubbles: true, cancelable: true }));

    try {
      inputEl.dispatchEvent(new view.Event('blur', { bubbles: true }));
    } catch (_) {
      // Ignore blur errors
    }
  }

  function autofillFormDOM(doc, storedQuestions, win) {
    const { findBestQuestionMatch, isOptionSelected } = ns;
    const view = win || doc?.defaultView || root;
    const domQuestions = extractFormQuestionsFromDOM(doc);

    let matchedCount = 0;
    let filledCount = 0;
    const unmatchedTitles = [];

    for (const domQ of domQuestions) {
      const domOptionTexts = domQ.choices.map((c) => c.text);
      const match = findBestQuestionMatch(domQ.title, domOptionTexts, storedQuestions);

      if (!match || !Array.isArray(match.question.answers) || match.question.answers.length === 0) {
        domQ.container.setAttribute('data-ms-autofill-status', 'unmatched');
        unmatchedTitles.push(domQ.title);
        continue;
      }

      matchedCount++;
      const answers = match.question.answers;
      let filledThisQuestion = false;

      if (domQ.choices.length > 0) {
        const isCheckbox = domQ.choices.some((c) => c.kind === 'checkbox');
        const hasAnyMatchingOption = domQ.choices.some((c) =>
          isOptionSelected(c.text, answers)
        );

        if (hasAnyMatchingOption) {
          if (isCheckbox) {
            for (const choice of domQ.choices) {
              const shouldBeChecked = isOptionSelected(choice.text, answers);
              const currentlyChecked = choice.isChecked();
              if (shouldBeChecked !== currentlyChecked) {
                choice.clickTarget.click();
              }
            }
          } else {
            const targetChoice = domQ.choices.find((c) =>
              isOptionSelected(c.text, answers)
            );
            if (targetChoice && !targetChoice.isChecked()) {
              targetChoice.clickTarget.click();
            }
          }
          filledThisQuestion = true;
        }
      } else if (domQ.textInput) {
        const valueToFill = answers.join(', ');
        if (valueToFill.trim().length > 0) {
          setReactInputValue(domQ.textInput, valueToFill, view);
          filledThisQuestion = true;
        }
      }

      if (filledThisQuestion) {
        domQ.container.setAttribute('data-ms-autofill-status', 'filled');
        filledCount++;
      } else {
        domQ.container.setAttribute('data-ms-autofill-status', 'unmatched');
        unmatchedTitles.push(domQ.title);
      }
    }

    return {
      totalOnPage: domQuestions.length,
      matchedCount,
      filledCount,
      unmatchedTitles,
    };
  }

  ns.extractFormQuestionsFromDOM = extractFormQuestionsFromDOM;
  ns.setReactInputValue = setReactInputValue;
  ns.autofillFormDOM = autofillFormDOM;
})(typeof globalThis !== 'undefined' ? globalThis : window);
