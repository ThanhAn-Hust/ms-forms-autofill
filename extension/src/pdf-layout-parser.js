(function (root) {
  'use strict';

  const ns = (root.MSFormsAutofill = root.MSFormsAutofill || {});

  const FILLED_GLYPH_RE = /^[●◉☑✓✔■]\s*/u;
  const EMPTY_GLYPH_RE = /^[○◯☐□]\s*/u;
  const QUESTION_START_RE = /^\s*(\d+)\s*[\.\)]\s+(.+)$/u;
  const STANDALONE_NUMBER_RE = /^\s*(\d+)\s*[\.\)]\s*$/u;

  const BOILERPLATE_PATTERNS = [
    /^microsoft forms$/iu,
    /^never give out your password/iu,
    /^report abuse/iu,
    /^this content is created by the owner of the form/iu,
    /^powered by microsoft forms/iu,
    /^không bao giờ tiết lộ mật khẩu/iu,
    /^nội dung này không được tạo hoặc xác nhận bởi microsoft/iu,
    /^báo cáo lạm dụng/iu,
    /^save my response$/iu,
    /^print response$/iu,
  ];

  const PLACEHOLDER_ANSWERS = new Set([
    'enter your answer',
    'nhập câu trả lời của bạn',
    'your answer',
    'câu trả lời của bạn',
    'single line text',
    'multi line text',
  ]);

  function normalizeInlineSpaces(str) {
    return String(str || '')
      .normalize('NFC')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function analyzeOptionControlRegion(rgbaData, imgWidth, imgHeight, searchBox) {
    const empty = {
      hasControl: false,
      isFilled: false,
      centerInkRatio: 0,
      totalInkRatio: 0,
      box: null,
    };

    if (!rgbaData || imgWidth <= 0 || imgHeight <= 0 || !searchBox) {
      return empty;
    }

    const xMin = Math.max(0, Math.floor(searchBox.xMin));
    const xMax = Math.min(imgWidth - 1, Math.ceil(searchBox.xMax));
    const yMin = Math.max(0, Math.floor(searchBox.yMin));
    const yMax = Math.min(imgHeight - 1, Math.ceil(searchBox.yMax));

    if (xMax <= xMin || yMax <= yMin) {
      return empty;
    }

    let minX = imgWidth;
    let maxX = -1;
    let minY = imgHeight;
    let maxY = -1;
    let inkCount = 0;

    for (let y = yMin; y <= yMax; y++) {
      const rowOffset = y * imgWidth * 4;
      for (let x = xMin; x <= xMax; x++) {
        const idx = rowOffset + x * 4;
        const r = rgbaData[idx];
        const g = rgbaData[idx + 1];
        const b = rgbaData[idx + 2];
        const a = rgbaData[idx + 3];
        if (a > 50 && (r < 235 || g < 235 || b < 235)) {
          inkCount++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (inkCount < 6 || maxX < minX || maxY < minY) {
      return empty;
    }

    const boxW = maxX - minX + 1;
    const boxH = maxY - minY + 1;

    if (boxW < 6 || boxW > 44 || boxH < 6 || boxH > 44) {
      return empty;
    }

    const boxArea = boxW * boxH;
    const totalInkRatio = inkCount / boxArea;

    const cxMin = Math.max(minX, Math.round(minX + boxW * 0.25));
    const cxMax = Math.min(maxX, Math.round(maxX - boxW * 0.25));
    const cyMin = Math.max(minY, Math.round(minY + boxH * 0.25));
    const cyMax = Math.min(maxY, Math.round(maxY - boxH * 0.25));

    let centerInkCount = 0;
    let centerArea = 0;

    for (let y = cyMin; y <= cyMax; y++) {
      const rowOffset = y * imgWidth * 4;
      for (let x = cxMin; x <= cxMax; x++) {
        centerArea++;
        const idx = rowOffset + x * 4;
        const r = rgbaData[idx];
        const g = rgbaData[idx + 1];
        const b = rgbaData[idx + 2];
        const a = rgbaData[idx + 3];
        if (a > 50 && (r < 235 || g < 235 || b < 235)) {
          centerInkCount++;
        }
      }
    }

    const centerInkRatio = centerArea > 0 ? centerInkCount / centerArea : 0;
    const isFilled = centerInkRatio >= 0.16;

    return {
      hasControl: true,
      isFilled,
      centerInkRatio,
      totalInkRatio,
      box: { minX, maxX, minY, maxY, width: boxW, height: boxH },
    };
  }

  function groupItemsIntoLines(textItems) {
    const valid = (Array.isArray(textItems) ? textItems : [])
      .filter((it) => it && typeof it.str === 'string' && it.str.trim().length > 0)
      .map((it) => ({
        str: it.str.normalize('NFC'),
        x: Number(it.x) || 0,
        y: Number(it.y) || 0,
        width: Number(it.width) || 0,
        height: Number(it.height) || 12,
      }));

    valid.sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));

    const groups = [];
    for (const item of valid) {
      const last = groups[groups.length - 1];
      if (last && Math.abs(item.y - last.anchorY) <= 5) {
        last.items.push(item);
      } else {
        groups.push({ anchorY: item.y, items: [item] });
      }
    }

    return groups.map((group) => {
      group.items.sort((a, b) => a.x - b.x);
      let text = '';
      let prevEnd = null;
      let prevWidth = 0;
      let prevStr = '';
      let minX = Infinity;
      let maxX = -Infinity;
      let sumY = 0;
      let maxH = 0;

      for (const item of group.items) {
        if (prevEnd !== null) {
          if (!/\s$/.test(prevStr) && !/^\s/.test(item.str)) {
            const gap = item.x - prevEnd;
            if ((prevWidth === 0 && item.width === 0) || gap > 1.5) {
              text += ' ';
            }
          }
        }
        text += item.str;
        prevEnd = item.x + item.width;
        prevWidth = item.width;
        prevStr = item.str;

        if (item.x < minX) minX = item.x;
        if (item.x + item.width > maxX) maxX = item.x + item.width;
        sumY += item.y;
        if (item.height > maxH) maxH = item.height;
      }

      return {
        text: normalizeInlineSpaces(text),
        x: minX,
        y: sumY / group.items.length,
        maxX,
        height: maxH || 12,
      };
    });
  }

  function isHeaderOrFooterNoise(line, pageHeight) {
    const t = line.text.trim();
    if (!t) return true;

    for (const re of BOILERPLATE_PATTERNS) {
      if (re.test(t)) return true;
    }

    const inMargin = line.y < 28 || line.y > pageHeight - 28;
    if (!inMargin) return false;

    if (/https?:\/\/\S+/i.test(t)) return true;
    if (/^\d+\s*\/\s*\d+$/.test(t)) return true;
    if (/^(?:page|trang)\s+\d+(?:\s*(?:of|\/)\s*\d+)?$/i.test(t)) return true;
    if (/^\d{1,4}[\/\-]\d{1,2}[\/\-]\d{1,4}(?:[,\s]+\d{1,2}:\d{2}(?:\s*[AP]M)?)?/i.test(t)) {
      return true;
    }

    return false;
  }

  function detectGlyphControl(text) {
    if (FILLED_GLYPH_RE.test(text)) {
      return {
        hasControl: true,
        isFilled: true,
        cleanedText: normalizeInlineSpaces(text.replace(FILLED_GLYPH_RE, '')),
      };
    }
    if (EMPTY_GLYPH_RE.test(text)) {
      return {
        hasControl: true,
        isFilled: false,
        cleanedText: normalizeInlineSpaces(text.replace(EMPTY_GLYPH_RE, '')),
      };
    }
    return { hasControl: false, isFilled: false, cleanedText: text };
  }

  function isPlaceholderLine(text) {
    const norm = normalizeInlineSpaces(text).toLowerCase();
    if (!norm) return true;
    if (PLACEHOLDER_ANSWERS.has(norm)) return true;
    if (/^[_\.\-\s]+$/.test(norm)) return true;
    return false;
  }

  function titleEndsWithPrompt(text) {
    return /[?:*\)]$/.test(String(text || '').trim());
  }

  function parsePdfPages(pagesData) {
    if (!Array.isArray(pagesData) || pagesData.length === 0) {
      return [];
    }

    const sortedPages = [...pagesData].sort(
      (a, b) => (Number(a.pageIndex) || 0) - (Number(b.pageIndex) || 0)
    );

    const allLines = [];

    for (const page of sortedPages) {
      const pageHeight = Number(page.height) || 800;
      const scale = Number(page.scale) || 1;
      const rawLines = groupItemsIntoLines(page.textItems);
      const filtered = rawLines.filter((line) => !isHeaderOrFooterNoise(line, pageHeight));

      for (let i = 0; i < filtered.length; i++) {
        const line = filtered[i];
        const prev = i > 0 ? filtered[i - 1] : null;
        const next = i < filtered.length - 1 ? filtered[i + 1] : null;

        const midY = line.y + line.height * 0.48;
        let yMin = midY - 12;
        let yMax = midY + 12;

        if (prev) {
          const prevMidY = prev.y + prev.height * 0.48;
          yMin = Math.max(yMin, (prevMidY + midY) / 2);
        }
        if (next) {
          const nextMidY = next.y + next.height * 0.48;
          yMax = Math.min(yMax, (midY + nextMidY) / 2);
        }

        const searchBox = {
          xMin: (line.x - 36) * scale,
          xMax: (line.x - 2) * scale,
          yMin: yMin * scale,
          yMax: yMax * scale,
        };

        const glyph = detectGlyphControl(line.text);
        const canvasControl = analyzeOptionControlRegion(
          page.rgbaData,
          Number(page.imgWidth) || 0,
          Number(page.imgHeight) || 0,
          searchBox
        );

        const hasControl = glyph.hasControl || canvasControl.hasControl;
        const isFilled = glyph.hasControl
          ? glyph.isFilled || (canvasControl.hasControl && canvasControl.isFilled)
          : canvasControl.hasControl && canvasControl.isFilled;

        allLines.push({
          ...line,
          pageIndex: Number(page.pageIndex) || 0,
          text: glyph.hasControl ? glyph.cleanedText : line.text,
          hasControl,
          isFilled,
          centerInkRatio: canvasControl.centerInkRatio,
        });
      }
    }

    // Merge standalone question number lines like "1." with the immediately following line
    const mergedLines = [];
    for (let i = 0; i < allLines.length; i++) {
      const curr = allLines[i];
      const next = allLines[i + 1];
      if (
        !curr.hasControl &&
        STANDALONE_NUMBER_RE.test(curr.text) &&
        next &&
        !next.hasControl &&
        next.pageIndex === curr.pageIndex
      ) {
        mergedLines.push({
          ...curr,
          text: normalizeInlineSpaces(`${curr.text} ${next.text}`),
          maxX: Math.max(curr.maxX, next.maxX),
        });
        i++;
      } else {
        mergedLines.push(curr);
      }
    }

    // Segment into question blocks
    const blocks = [];
    let currentBlock = null;
    let questionMarginX = null;
    let lastQuestionNumber = 0;

    for (const line of mergedLines) {
      const m = !line.hasControl ? line.text.match(QUESTION_START_RE) : null;
      let isNewQuestion = false;

      if (m) {
        const num = Number(m[1]);
        const withinMargin = questionMarginX === null || line.x <= questionMarginX + 18;
        const isSequential = num === lastQuestionNumber + 1;
        if (withinMargin || isSequential) {
          isNewQuestion = true;
          if (questionMarginX === null || line.x < questionMarginX) {
            questionMarginX = line.x;
          }
          lastQuestionNumber = num;
        }
      }

      if (isNewQuestion) {
        currentBlock = {
          number: Number(m[1]),
          titleLine: line,
          rawTitleText: normalizeInlineSpaces(m[2]),
          bodyLines: [],
        };
        blocks.push(currentBlock);
      } else if (currentBlock) {
        currentBlock.bodyLines.push(line);
      }
    }

    return blocks.map((block, idx) => {
      const controlCount = block.bodyLines.filter((l) => l.hasControl).length;

      if (controlCount >= 2) {
        let titleParts = [block.rawTitleText];
        const firstControlIdx = block.bodyLines.findIndex((l) => l.hasControl);

        for (let i = 0; i < firstControlIdx; i++) {
          if (!isPlaceholderLine(block.bodyLines[i].text)) {
            titleParts.push(block.bodyLines[i].text);
          }
        }

        const optionEntries = [];
        for (let i = firstControlIdx; i < block.bodyLines.length; i++) {
          const line = block.bodyLines[i];
          if (line.hasControl) {
            optionEntries.push({
              text: line.text,
              isFilled: line.isFilled,
              centerInkRatio: line.centerInkRatio,
            });
          } else if (optionEntries.length > 0 && !isPlaceholderLine(line.text)) {
            const lastOpt = optionEntries[optionEntries.length - 1];
            lastOpt.text = normalizeInlineSpaces(`${lastOpt.text} ${line.text}`);
          }
        }

        const options = optionEntries.map((o) => o.text).filter(Boolean);
        const answers = optionEntries
          .filter((o) => o.text && o.isFilled)
          .map((o) => o.text);

        return {
          id: `q-${block.number}-${idx + 1}`,
          number: block.number,
          title: normalizeInlineSpaces(titleParts.join(' ')),
          type: 'choice',
          options,
          answers,
        };
      }

      // Text / fill-in-the-blank question
      const titleParts = [block.rawTitleText];
      const remaining = [...block.bodyLines];

      if (
        !titleEndsWithPrompt(block.rawTitleText) &&
        remaining.length >= 2 &&
        !isPlaceholderLine(remaining[0].text) &&
        remaining[0].pageIndex === block.titleLine.pageIndex &&
        remaining[0].y - (block.titleLine.y + block.titleLine.height) < 8 &&
        Math.abs(remaining[0].x - block.titleLine.x) <= 6 &&
        titleEndsWithPrompt(remaining[0].text)
      ) {
        titleParts.push(remaining.shift().text);
      }

      const answerLines = remaining
        .map((l) => l.text)
        .filter((t) => !isPlaceholderLine(t));

      const answerText = normalizeInlineSpaces(answerLines.join(' '));

      return {
        id: `q-${block.number}-${idx + 1}`,
        number: block.number,
        title: normalizeInlineSpaces(titleParts.join(' ')),
        type: 'text',
        options: [],
        answers: answerText ? [answerText] : [],
      };
    });
  }

  ns.analyzeOptionControlRegion = analyzeOptionControlRegion;
  ns.parsePdfPages = parsePdfPages;
})(typeof globalThis !== 'undefined' ? globalThis : window);
