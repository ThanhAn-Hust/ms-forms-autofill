(function () {
  'use strict';

  if (globalThis.__MS_FORMS_AUTOFILL_CONTENT_LOADED__) {
    return;
  }
  globalThis.__MS_FORMS_AUTOFILL_CONTENT_LOADED__ = true;

  const FAB_ID = 'ms-forms-autofill-fab';
  const STYLE_ID = 'ms-forms-autofill-styles';

  let storedQuestions = [];
  let autoFillOnNavigate = false;
  let isCollapsed = false;
  let observerTimer = null;

  function isLikelyMicrosoftFormPage() {
    const host = location.hostname;
    if (host.includes('forms.office.com') || host.includes('forms.cloud.microsoft')) {
      return true;
    }
    const qs = globalThis.MSFormsAutofill?.extractFormQuestionsFromDOM?.(document) || [];
    return qs.length > 0;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      [data-ms-autofill-status="filled"] {
        border-left: 4px solid #107c41 !important;
        padding-left: 10px !important;
        transition: border-color 0.2s ease;
      }
      [data-ms-autofill-status="unmatched"] {
        border-left: 4px solid #d97706 !important;
        padding-left: 10px !important;
        transition: border-color 0.2s ease;
      }
      #${FAB_ID} {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        background: #ffffff;
        color: #1f2937;
        border: 1px solid #d1d5db;
        border-radius: 12px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.16);
        padding: 10px 12px;
        min-width: 210px;
        max-width: 270px;
        font-size: 13px;
        line-height: 1.4;
      }
      #${FAB_ID}.collapsed {
        min-width: auto;
        padding: 6px;
        border-radius: 999px;
      }
      #${FAB_ID} .msaf-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
      }
      #${FAB_ID} .msaf-badge {
        font-weight: 600;
        font-size: 12px;
        color: #0369a1;
        background: #e0f2fe;
        padding: 2px 8px;
        border-radius: 999px;
      }
      #${FAB_ID} .msaf-collapse-btn {
        border: none;
        background: transparent;
        color: #6b7280;
        cursor: pointer;
        font-size: 15px;
        padding: 0 4px;
        line-height: 1;
      }
      #${FAB_ID} .msaf-fill-btn {
        width: 100%;
        border: none;
        background: #0f6cbd;
        color: #ffffff;
        font-weight: 600;
        font-size: 13px;
        padding: 8px 12px;
        border-radius: 8px;
        cursor: pointer;
        transition: background 0.15s ease;
      }
      #${FAB_ID} .msaf-fill-btn:hover:not(:disabled) {
        background: #115ea3;
      }
      #${FAB_ID} .msaf-fill-btn:disabled {
        background: #9ca3af;
        cursor: not-allowed;
      }
      #${FAB_ID} .msaf-toggle-row {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 8px;
        font-size: 12px;
        color: #4b5563;
        cursor: pointer;
        user-select: none;
      }
      #${FAB_ID} .msaf-toast {
        margin-top: 7px;
        font-size: 12px;
        padding: 5px 8px;
        border-radius: 6px;
        background: #f3f4f6;
        color: #111827;
        display: none;
      }
      #${FAB_ID} .msaf-toast.show {
        display: block;
      }
      #${FAB_ID} .msaf-toast.success {
        background: #dcfce7;
        color: #166534;
      }
      #${FAB_ID} .msaf-toast.warn {
        background: #fef3c7;
        color: #92400e;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function showToast(msg, tone) {
    const fab = document.getElementById(FAB_ID);
    if (!fab) return;
    const toast = fab.querySelector('.msaf-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.className = `msaf-toast show ${tone || ''}`.trim();
  }

  function updateFabUI() {
    const fab = document.getElementById(FAB_ID);
    if (!fab) return;

    if (isCollapsed) {
      fab.classList.add('collapsed');
      fab.innerHTML = `<button class="msaf-fill-btn" style="border-radius:999px;padding:8px 12px;" title="Mở tiện ích điền Form">⚡ ${storedQuestions.length}</button>`;
      fab.querySelector('.msaf-fill-btn').addEventListener('click', () => {
        isCollapsed = false;
        renderFab();
      });
      return;
    }

    fab.classList.remove('collapsed');
    const badge = fab.querySelector('.msaf-badge');
    const btn = fab.querySelector('.msaf-fill-btn');
    const chk = fab.querySelector('.msaf-auto-chk');

    if (badge) {
      badge.textContent =
        storedQuestions.length > 0
          ? `📄 ${storedQuestions.length} câu sẵn sàng`
          : 'Chưa nạp PDF';
    }
    if (btn) {
      btn.disabled = storedQuestions.length === 0;
    }
    if (chk) {
      chk.checked = Boolean(autoFillOnNavigate);
    }
  }

  function runAutofill(questionsOverride) {
    const questions = Array.isArray(questionsOverride) ? questionsOverride : storedQuestions;
    if (!questions || questions.length === 0) {
      showToast('Vui lòng nạp file PDF A trong popup trước.', 'warn');
      return { totalOnPage: 0, matchedCount: 0, filledCount: 0, unmatchedTitles: [] };
    }

    const summary = globalThis.MSFormsAutofill.autofillFormDOM(document, questions, window);
    const tone = summary.filledCount > 0 ? 'success' : 'warn';
    showToast(`Đã điền ${summary.filledCount}/${summary.totalOnPage} câu trên trang này`, tone);
    return summary;
  }

  function renderFab() {
    if (!isLikelyMicrosoftFormPage()) return;
    injectStyles();

    let fab = document.getElementById(FAB_ID);
    if (!fab) {
      fab = document.createElement('div');
      fab.id = FAB_ID;
      document.body.appendChild(fab);
    }

    if (isCollapsed) {
      updateFabUI();
      return;
    }

    fab.innerHTML = `
      <div class="msaf-header">
        <span class="msaf-badge"></span>
        <button type="button" class="msaf-collapse-btn" title="Thu gọn">–</button>
      </div>
      <button type="button" class="msaf-fill-btn">⚡ Điền đáp án</button>
      <label class="msaf-toggle-row">
        <input type="checkbox" class="msaf-auto-chk" />
        <span>Tự điền khi qua trang</span>
      </label>
      <div class="msaf-toast"></div>
    `;

    fab.querySelector('.msaf-collapse-btn').addEventListener('click', () => {
      isCollapsed = true;
      updateFabUI();
    });

    fab.querySelector('.msaf-fill-btn').addEventListener('click', () => {
      runAutofill();
    });

    fab.querySelector('.msaf-auto-chk').addEventListener('change', (e) => {
      autoFillOnNavigate = Boolean(e.target.checked);
      if (chrome?.storage?.local) {
        chrome.storage.local.set({ autoFillOnNavigate });
      }
      if (autoFillOnNavigate && storedQuestions.length > 0) {
        runAutofill();
      }
    });

    updateFabUI();
  }

  function setupNavigationObserver() {
    if (!document.body) return;
    const observer = new MutationObserver(() => {
      if (!document.getElementById(FAB_ID) && isLikelyMicrosoftFormPage()) {
        renderFab();
      }
      if (!autoFillOnNavigate || storedQuestions.length === 0) return;

      clearTimeout(observerTimer);
      observerTimer = setTimeout(() => {
        const questions = globalThis.MSFormsAutofill.extractFormQuestionsFromDOM(document);
        const hasPending = questions.some(
          (q) => !q.container.hasAttribute('data-ms-autofill-status')
        );
        if (hasPending) {
          runAutofill();
        }
      }, 300);
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    if (chrome?.storage?.local) {
      chrome.storage.local.get(
        { storedQuestions: [], autoFillOnNavigate: false },
        (data) => {
          storedQuestions = Array.isArray(data.storedQuestions) ? data.storedQuestions : [];
          autoFillOnNavigate = Boolean(data.autoFillOnNavigate);
          renderFab();
          if (autoFillOnNavigate && storedQuestions.length > 0 && isLikelyMicrosoftFormPage()) {
            runAutofill();
          }
        }
      );

      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;
        if (changes.storedQuestions) {
          storedQuestions = Array.isArray(changes.storedQuestions.newValue)
            ? changes.storedQuestions.newValue
            : [];
        }
        if (changes.autoFillOnNavigate) {
          autoFillOnNavigate = Boolean(changes.autoFillOnNavigate.newValue);
        }
        if (!document.getElementById(FAB_ID) && isLikelyMicrosoftFormPage()) {
          renderFab();
        } else {
          updateFabUI();
        }
      });
    } else {
      renderFab();
    }

    if (chrome?.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'FILL_NOW') {
          if (Array.isArray(msg.questions)) {
            storedQuestions = msg.questions;
            updateFabUI();
          }
          const summary = runAutofill(msg.questions);
          sendResponse({ ok: true, summary });
          return true;
        }
        if (msg.type === 'GET_FORM_STATUS') {
          const qs = globalThis.MSFormsAutofill.extractFormQuestionsFromDOM(document);
          sendResponse({ ok: true, totalOnPage: qs.length });
          return true;
        }
      });
    }

    setupNavigationObserver();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
