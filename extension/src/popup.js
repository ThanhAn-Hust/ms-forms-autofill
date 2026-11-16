import { parsePdfFile } from './pdf-loader.js';

const dropZone = document.getElementById('drop-zone');
const pdfInput = document.getElementById('pdf-input');
const fileLabel = document.getElementById('file-label');
const fileMeta = document.getElementById('file-meta');
const btnFill = document.getElementById('btn-fill');
const btnClear = document.getElementById('btn-clear');
const chkAutofillNav = document.getElementById('chk-autofill-nav');
const statusBanner = document.getElementById('status-banner');
const searchInput = document.getElementById('search-input');
const questionList = document.getElementById('question-list');
const tabBadge = document.getElementById('tab-badge');

const btnAddQuestion = document.getElementById('btn-add-question');
const manualForm = document.getElementById('manual-form');
const manualTitle = document.getElementById('manual-title');
const manualType = document.getElementById('manual-type');
const manualAnswer = document.getElementById('manual-answer');
const btnManualSave = document.getElementById('btn-manual-save');
const btnManualCancel = document.getElementById('btn-manual-cancel');

let state = {
  storedQuestions: [],
  pdfFileName: '',
  autoFillOnNavigate: false,
  searchQuery: '',
};

function showStatus(message, tone = 'info') {
  if (!message) {
    statusBanner.hidden = true;
    statusBanner.textContent = '';
    return;
  }
  statusBanner.hidden = false;
  statusBanner.className = `status-banner ${tone}`;
  statusBanner.textContent = message;
}

function saveStorage(patch) {
  return new Promise((resolve) => {
    chrome.storage.local.set(patch, resolve);
  });
}

function renderHeaderAndActions() {
  const count = state.storedQuestions.length;
  const answeredCount = state.storedQuestions.filter(
    (q) => Array.isArray(q.answers) && q.answers.length > 0
  ).length;

  btnFill.disabled = count === 0;
  btnClear.disabled = count === 0 && !state.pdfFileName;
  chkAutofillNav.checked = Boolean(state.autoFillOnNavigate);

  if (count > 0) {
    fileLabel.textContent = state.pdfFileName || 'Dữ liệu câu hỏi đã lưu';
    fileMeta.textContent = `${count} câu hỏi • ${answeredCount} câu đã có đáp án (nhấn vào đáp án bên dưới để chỉnh nếu cần)`;
  } else {
    fileLabel.textContent = 'Chọn hoặc kéo thả file PDF A vào đây';
    fileMeta.textContent = 'Hỗ trợ trắc nghiệm 1/nhiều lựa chọn & điền chữ';
  }
}

function renderQuestions() {
  renderHeaderAndActions();
  const query = (state.searchQuery || '').normalize('NFC').toLowerCase().trim();

  const filtered = state.storedQuestions.filter((q) => {
    if (!query) return true;
    const hay = [q.title, ...(q.options || []), ...(q.answers || [])]
      .join(' ')
      .normalize('NFC')
      .toLowerCase();
    return hay.includes(query);
  });

  if (state.storedQuestions.length === 0) {
    questionList.innerHTML = `
      <div class="empty-state">
        Chưa có dữ liệu. Hãy nạp file PDF A được in từ Microsoft Forms (<em>Save my response</em>).
      </div>
    `;
    return;
  }

  if (filtered.length === 0) {
    questionList.innerHTML = `<div class="empty-state">Không tìm thấy câu hỏi khớp với "${escapeHtml(query)}".</div>`;
    return;
  }

  questionList.innerHTML = '';

  for (const q of filtered) {
    const card = document.createElement('article');
    const hasAnswer = Array.isArray(q.answers) && q.answers.length > 0;
    card.className = `q-card ${hasAnswer ? '' : 'no-answer'}`.trim();

    const top = document.createElement('div');
    top.className = 'q-top';

    const badges = document.createElement('div');
    badges.className = 'q-badges';

    const numBadge = document.createElement('span');
    numBadge.className = 'q-num';
    numBadge.textContent = `Câu ${q.number ?? '?'}`;
    badges.appendChild(numBadge);

    const typeBadge = document.createElement('span');
    typeBadge.className = 'q-type';
    typeBadge.textContent = q.type === 'choice' ? 'Trắc nghiệm' : 'Điền chữ';
    badges.appendChild(typeBadge);

    if (!hasAnswer) {
      const warnBadge = document.createElement('span');
      warnBadge.className = 'q-missing';
      warnBadge.textContent = 'Chưa có đáp án';
      badges.appendChild(warnBadge);
    }

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'q-delete';
    delBtn.title = 'Xóa câu hỏi này';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', async () => {
      state.storedQuestions = state.storedQuestions.filter((item) => item.id !== q.id);
      await saveStorage({ storedQuestions: state.storedQuestions });
      renderQuestions();
    });

    top.appendChild(badges);
    top.appendChild(delBtn);
    card.appendChild(top);

    const titleEl = document.createElement('div');
    titleEl.className = 'q-title';
    titleEl.textContent = q.title;
    card.appendChild(titleEl);

    if (q.type === 'choice' && Array.isArray(q.options) && q.options.length > 0) {
      const optsWrap = document.createElement('div');
      optsWrap.className = 'q-options';

      for (const opt of q.options) {
        const isSelected = (q.answers || []).includes(opt);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `opt-chip ${isSelected ? 'selected' : ''}`.trim();

        const dot = document.createElement('span');
        dot.className = 'opt-dot';
        dot.textContent = isSelected ? '✔' : '○';

        const label = document.createElement('span');
        label.textContent = opt;

        btn.appendChild(dot);
        btn.appendChild(label);

        btn.addEventListener('click', async () => {
          const current = Array.isArray(q.answers) ? [...q.answers] : [];
          const idx = current.indexOf(opt);
          if (idx >= 0) {
            current.splice(idx, 1);
          } else {
            current.push(opt);
          }
          q.answers = current;
          await saveStorage({ storedQuestions: state.storedQuestions });
          renderQuestions();
        });

        optsWrap.appendChild(btn);
      }
      card.appendChild(optsWrap);
    } else {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'q-text-input';
      input.placeholder = 'Nhập đáp án đúng...';
      input.value = (q.answers || []).join(', ');
      input.addEventListener('change', async () => {
        const val = input.value.trim();
        q.answers = val ? [val] : [];
        await saveStorage({ storedQuestions: state.storedQuestions });
        renderHeaderAndActions();
        card.className = `q-card ${q.answers.length > 0 ? '' : 'no-answer'}`.trim();
      });
      card.appendChild(input);
    }

    questionList.appendChild(card);
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function handlePdfFile(file) {
  if (!file) return;
  showStatus(`Đang đọc file "${file.name}"...`, 'info');

  try {
    const buffer = await file.arrayBuffer();
    const parsed = await parsePdfFile(buffer);

    if (!parsed || parsed.length === 0) {
      showStatus(
        'Không tìm thấy câu hỏi nào trong PDF. Hãy kiểm tra lại đây là bản in "Save my response" từ Microsoft Forms.',
        'warn'
      );
      return;
    }

    state.storedQuestions = parsed;
    state.pdfFileName = file.name;
    await saveStorage({
      storedQuestions: state.storedQuestions,
      pdfFileName: state.pdfFileName,
    });

    const answered = parsed.filter((q) => q.answers.length > 0).length;
    showStatus(`Đã đọc ${parsed.length} câu hỏi (${answered} câu có đáp án).`, 'success');
    renderQuestions();
  } catch (err) {
    showStatus(`Lỗi khi đọc PDF: ${err?.message || err}`, 'error');
  }
}

async function queryActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function refreshTabStatus() {
  try {
    const tab = await queryActiveTab();
    if (!tab || !tab.id) {
      tabBadge.textContent = 'Không có tab';
      tabBadge.className = 'pill pill-muted';
      return;
    }

    const res = await chrome.tabs.sendMessage(tab.id, { type: 'GET_FORM_STATUS' });
    if (res && res.ok) {
      tabBadge.textContent = `Form: ${res.totalOnPage} câu trên trang`;
      tabBadge.className = res.totalOnPage > 0 ? 'pill pill-ok' : 'pill pill-warn';
    }
  } catch (_) {
    tabBadge.textContent = 'Mở Microsoft Form để điền';
    tabBadge.className = 'pill pill-muted';
  }
}

async function fillActiveTab() {
  if (state.storedQuestions.length === 0) return;

  const tab = await queryActiveTab();
  if (!tab || !tab.id) {
    showStatus('Không tìm thấy tab đang mở.', 'error');
    return;
  }

  const payload = { type: 'FILL_NOW', questions: state.storedQuestions };

  try {
    let response;
    try {
      response = await chrome.tabs.sendMessage(tab.id, payload);
    } catch (_) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['src/matcher.js', 'src/dom-filler.js', 'src/content.js'],
      });
      response = await chrome.tabs.sendMessage(tab.id, payload);
    }

    if (response && response.ok && response.summary) {
      const { filledCount, totalOnPage } = response.summary;
      const tone = filledCount > 0 ? 'success' : 'warn';
      showStatus(`Đã điền ${filledCount}/${totalOnPage} câu trên trang hiện tại.`, tone);
      await refreshTabStatus();
    } else {
      showStatus('Không đọc được câu hỏi trên tab hiện tại.', 'warn');
    }
  } catch (err) {
    showStatus(
      `Không thể thao tác trên tab này (${err?.message || 'hãy mở trang Microsoft Forms'}).`,
      'error'
    );
  }
}

dropZone.addEventListener('click', () => pdfInput.click());
dropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    pdfInput.click();
  }
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer?.files?.[0];
  if (file) handlePdfFile(file);
});

pdfInput.addEventListener('change', () => {
  const file = pdfInput.files?.[0];
  if (file) handlePdfFile(file);
  pdfInput.value = '';
});

btnFill.addEventListener('click', fillActiveTab);

btnClear.addEventListener('click', async () => {
  state.storedQuestions = [];
  state.pdfFileName = '';
  await saveStorage({ storedQuestions: [], pdfFileName: '' });
  showStatus('Đã xóa dữ liệu đã lưu.', 'info');
  renderQuestions();
});

chkAutofillNav.addEventListener('change', async () => {
  state.autoFillOnNavigate = chkAutofillNav.checked;
  await saveStorage({ autoFillOnNavigate: state.autoFillOnNavigate });
});

searchInput.addEventListener('input', () => {
  state.searchQuery = searchInput.value;
  renderQuestions();
});

btnAddQuestion.addEventListener('click', () => {
  manualForm.hidden = !manualForm.hidden;
  if (!manualForm.hidden) {
    manualTitle.focus();
  }
});

btnManualCancel.addEventListener('click', () => {
  manualForm.hidden = true;
  manualTitle.value = '';
  manualAnswer.value = '';
});

btnManualSave.addEventListener('click', async () => {
  const title = manualTitle.value.trim();
  const type = manualType.value;
  const rawAns = manualAnswer.value.trim();
  if (!title) {
    showStatus('Vui lòng nhập nội dung câu hỏi.', 'warn');
    return;
  }

  const answers = rawAns
    ? type === 'choice'
      ? rawAns.split('|').map((s) => s.trim()).filter(Boolean)
      : [rawAns]
    : [];

  const nextNum = state.storedQuestions.length + 1;
  state.storedQuestions.push({
    id: `manual-${Date.now()}`,
    number: nextNum,
    title,
    type,
    options: type === 'choice' ? [...answers] : [],
    answers,
  });

  await saveStorage({ storedQuestions: state.storedQuestions });
  manualForm.hidden = true;
  manualTitle.value = '';
  manualAnswer.value = '';
  showStatus('Đã thêm câu hỏi thủ công.', 'success');
  renderQuestions();
});

chrome.storage.local.get(
  { storedQuestions: [], pdfFileName: '', autoFillOnNavigate: false },
  (data) => {
    state.storedQuestions = Array.isArray(data.storedQuestions) ? data.storedQuestions : [];
    state.pdfFileName = data.pdfFileName || '';
    state.autoFillOnNavigate = Boolean(data.autoFillOnNavigate);
    renderQuestions();
    refreshTabStatus();
  }
);
