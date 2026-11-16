import test from 'node:test';
import assert from 'node:assert/strict';

import '../extension/src/matcher.js';
import '../extension/src/pdf-layout-parser.js';

const { analyzeOptionControlRegion, parsePdfPages } = globalThis.MSFormsAutofill || {};

function createWhiteCanvas(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  data.fill(255);
  return data;
}

function setPixel(data, width, height, x, y, r, g, b, a = 255) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || ix >= width || iy < 0 || iy >= height) return;
  const idx = (iy * width + ix) * 4;
  data[idx] = r;
  data[idx + 1] = g;
  data[idx + 2] = b;
  data[idx + 3] = a;
}

function drawCircle(data, width, height, cx, cy, radius, filled, color = [30, 90, 180]) {
  for (let y = Math.floor(cy - radius - 1); y <= Math.ceil(cy + radius + 1); y++) {
    for (let x = Math.floor(cx - radius - 1); x <= Math.ceil(cx + radius + 1); x++) {
      const dist = Math.hypot(x - cx, y - cy);
      if (Math.abs(dist - radius) <= 1.2) {
        setPixel(data, width, height, x, y, color[0], color[1], color[2]);
      } else if (filled && dist <= radius * 0.55) {
        setPixel(data, width, height, x, y, color[0], color[1], color[2]);
      }
    }
  }
}

function drawCheckbox(data, width, height, x0, y0, size, checked, solidStyle = false) {
  const x1 = x0 + size;
  const y1 = y0 + size;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const isBorder = x <= x0 + 1 || x >= x1 - 1 || y <= y0 + 1 || y >= y1 - 1;
      if (solidStyle && checked) {
        // Blue square with white checkmark inside
        setPixel(data, width, height, x, y, 0, 120, 212);
      } else if (isBorder) {
        setPixel(data, width, height, x, y, 90, 90, 90);
      }
    }
  }
  if (checked) {
    const color = solidStyle ? [255, 255, 255] : [0, 120, 212];
    // Draw checkmark passing through the center
    const steps = size * 2;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (t < 0.4) {
        const u = t / 0.4;
        const px = x0 + size * (0.22 + u * 0.22);
        const py = y0 + size * (0.52 + u * 0.23);
        setPixel(data, width, height, px, py, ...color);
        setPixel(data, width, height, px + 1, py, ...color);
      } else {
        const u = (t - 0.4) / 0.6;
        const px = x0 + size * (0.44 + u * 0.36);
        const py = y0 + size * (0.75 - u * 0.48);
        setPixel(data, width, height, px, py, ...color);
        setPixel(data, width, height, px + 1, py, ...color);
      }
    }
  }
}

test('analyzeOptionControlRegion distinguishes hollow vs filled radio and checked checkboxes', () => {
  const w = 120;
  const h = 220;
  const rgba = createWhiteCanvas(w, h);

  // Empty radio at (20, 30)
  drawCircle(rgba, w, h, 20, 30, 9, false);
  // Filled radio at (20, 70)
  drawCircle(rgba, w, h, 20, 70, 9, true);
  // Unchecked box at (12, 100) size 18
  drawCheckbox(rgba, w, h, 12, 100, 18, false);
  // Checked box (outline + checkmark) at (12, 140) size 18
  drawCheckbox(rgba, w, h, 12, 140, 18, true, false);
  // Checked box (solid + white checkmark) at (12, 180) size 18
  drawCheckbox(rgba, w, h, 12, 180, 18, true, true);

  const rEmpty = analyzeOptionControlRegion(rgba, w, h, { xMin: 5, xMax: 40, yMin: 15, yMax: 45 });
  assert.equal(rEmpty.hasControl, true);
  assert.equal(rEmpty.isFilled, false);
  assert.ok(rEmpty.centerInkRatio < 0.1, `Expected < 0.1, got ${rEmpty.centerInkRatio}`);

  const rFilled = analyzeOptionControlRegion(rgba, w, h, { xMin: 5, xMax: 40, yMin: 55, yMax: 85 });
  assert.equal(rFilled.hasControl, true);
  assert.equal(rFilled.isFilled, true);
  assert.ok(rFilled.centerInkRatio >= 0.16, `Expected >= 0.16, got ${rFilled.centerInkRatio}`);

  const cEmpty = analyzeOptionControlRegion(rgba, w, h, { xMin: 5, xMax: 40, yMin: 95, yMax: 125 });
  assert.equal(cEmpty.hasControl, true);
  assert.equal(cEmpty.isFilled, false);

  const cCheckedOutline = analyzeOptionControlRegion(rgba, w, h, { xMin: 5, xMax: 40, yMin: 135, yMax: 165 });
  assert.equal(cCheckedOutline.hasControl, true);
  assert.equal(cCheckedOutline.isFilled, true);

  const cCheckedSolid = analyzeOptionControlRegion(rgba, w, h, { xMin: 5, xMax: 40, yMin: 175, yMax: 205 });
  assert.equal(cCheckedSolid.hasControl, true);
  assert.equal(cCheckedSolid.isFilled, true);

  const blank = analyzeOptionControlRegion(rgba, w, h, { xMin: 50, xMax: 100, yMin: 10, yMax: 40 });
  assert.equal(blank.hasControl, false);
  assert.equal(blank.isFilled, false);
});

test('parsePdfPages extracts single-choice, multi-choice, text answers and strips headers/footers', () => {
  const scale = 2;
  const pageW = 600;
  const pageH = 800;
  const imgW = pageW * scale;
  const imgH = pageH * scale;

  const rgba1 = createWhiteCanvas(imgW, imgH);
  const rgba2 = createWhiteCanvas(imgW, imgH);

  // Page 1 controls at x=48..68 (option text starts at x=75)
  // Q1 options at y=110, 140, 170 (midY = y + 6)
  drawCircle(rgba1, imgW, imgH, 58 * scale, 116 * scale, 7 * scale, false);
  drawCircle(rgba1, imgW, imgH, 58 * scale, 146 * scale, 7 * scale, true);
  drawCircle(rgba1, imgW, imgH, 58 * scale, 176 * scale, 7 * scale, false);

  // Q2 multi-choice checkboxes at y=250, 280, 310 (midY = y + 6)
  drawCheckbox(rgba1, imgW, imgH, 51 * scale, 249 * scale, 14 * scale, true, true);
  drawCheckbox(rgba1, imgW, imgH, 51 * scale, 279 * scale, 14 * scale, false, false);
  drawCheckbox(rgba1, imgW, imgH, 51 * scale, 309 * scale, 14 * scale, true, false);

  // Q4 on Page 2: unanswered choice vs option starting with "1. "
  drawCircle(rgba2, imgW, imgH, 58 * scale, 106 * scale, 7 * scale, false);
  drawCircle(rgba2, imgW, imgH, 58 * scale, 136 * scale, 7 * scale, true);

  const page1Items = [
    // Header noise
    { str: '11/16/26, 12:05 PM', x: 30, y: 12, width: 100, height: 10 },
    { str: 'Quiz Kiến Thức Chung', x: 250, y: 12, width: 120, height: 10 },
    // Q1
    { str: '1. Thủ đô của Việt Nam là gì? *', x: 50, y: 80, width: 220, height: 14 },
    { str: 'Đà Nẵng', x: 75, y: 110, width: 60, height: 12 },
    { str: 'Ha\u0300 No\u0323\u0302i', x: 75, y: 140, width: 55, height: 12 }, // NFD test
    { str: 'Thành phố Hồ Chí Minh', x: 75, y: 170, width: 140, height: 12 },
    // Q2
    { str: '2. Chọn các ngôn ngữ lập trình chạy trên trình duyệt: (2 Điểm)', x: 50, y: 220, width: 350, height: 14 },
    { str: 'JavaScript', x: 75, y: 250, width: 70, height: 12 },
    { str: 'COBOL', x: 75, y: 280, width: 45, height: 12 },
    { str: 'WebAssembly (hỗ trợ biên dịch từ', x: 75, y: 310, width: 190, height: 12 },
    { str: 'nhiều ngôn ngữ như Rust, C++)', x: 75, y: 326, width: 180, height: 12 },
    // Q3 text
    { str: '3. Giao thức bảo mật của web viết tắt là gì?', x: 50, y: 370, width: 260, height: 14 },
    { str: 'HTTPS', x: 58, y: 400, width: 45, height: 12 },
    // Footer noise
    { str: 'https://forms.office.com/Pages/ResponsePage.aspx?id=123', x: 30, y: 782, width: 300, height: 10 },
    { str: '1/2', x: 550, y: 782, width: 20, height: 10 },
  ];

  const page2Items = [
    // Q4 with numeric-looking option
    { str: '4. Phiên bản HTTP phổ biến hiện nay?', x: 50, y: 70, width: 240, height: 14 },
    { str: '1. HTTP/0.9 cũ', x: 75, y: 100, width: 90, height: 12 },
    { str: '2. HTTP/2 và HTTP/3', x: 75, y: 130, width: 130, height: 12 },
    // Q5 unanswered text placeholder
    { str: '5. Ghi chú thêm (nếu có)', x: 50, y: 180, width: 180, height: 14 },
    { str: 'Nhập câu trả lời của bạn', x: 58, y: 210, width: 150, height: 12 },
    // MS Forms boilerplate footer
    { str: 'Microsoft Forms', x: 50, y: 750, width: 100, height: 12 },
    { str: 'Never give out your password. Report abuse', x: 50, y: 768, width: 260, height: 10 },
  ];

  const result = parsePdfPages([
    { pageIndex: 0, width: pageW, height: pageH, scale, textItems: page1Items, rgbaData: rgba1, imgWidth: imgW, imgHeight: imgH },
    { pageIndex: 1, width: pageW, height: pageH, scale, textItems: page2Items, rgbaData: rgba2, imgWidth: imgW, imgHeight: imgH },
  ]);

  assert.equal(result.length, 5);

  assert.equal(result[0].number, 1);
  assert.equal(result[0].type, 'choice');
  assert.deepEqual(result[0].options, ['Đà Nẵng', 'Hà Nội', 'Thành phố Hồ Chí Minh']);
  assert.deepEqual(result[0].answers, ['Hà Nội']);

  assert.equal(result[1].number, 2);
  assert.equal(result[1].type, 'choice');
  assert.deepEqual(result[1].options, [
    'JavaScript',
    'COBOL',
    'WebAssembly (hỗ trợ biên dịch từ nhiều ngôn ngữ như Rust, C++)',
  ]);
  assert.deepEqual(result[1].answers, [
    'JavaScript',
    'WebAssembly (hỗ trợ biên dịch từ nhiều ngôn ngữ như Rust, C++)',
  ]);

  assert.equal(result[2].number, 3);
  assert.equal(result[2].type, 'text');
  assert.deepEqual(result[2].answers, ['HTTPS']);

  assert.equal(result[3].number, 4);
  assert.equal(result[3].type, 'choice');
  assert.deepEqual(result[3].options, ['1. HTTP/0.9 cũ', '2. HTTP/2 và HTTP/3']);
  assert.deepEqual(result[3].answers, ['2. HTTP/2 và HTTP/3']);

  assert.equal(result[4].number, 5);
  assert.equal(result[4].type, 'text');
  assert.deepEqual(result[4].answers, []);
});

test('parsePdfPages supports Unicode glyph markers without canvas and handles unanswered choice questions', () => {
  const result = parsePdfPages([
    {
      pageIndex: 0,
      width: 600,
      height: 800,
      scale: 1,
      rgbaData: null,
      imgWidth: 0,
      imgHeight: 0,
      textItems: [
        { str: '1. Câu hỏi dùng ký tự Unicode?', x: 50, y: 60, width: 200, height: 14 },
        { str: '○ Lựa chọn sai', x: 65, y: 90, width: 100, height: 12 },
        { str: '◉ Lựa chọn đúng', x: 65, y: 115, width: 100, height: 12 },
        { str: '2. Câu trắc nghiệm chưa chọn?', x: 50, y: 160, width: 200, height: 14 },
        { str: '☐ Mục A', x: 65, y: 190, width: 60, height: 12 },
        { str: '☐ Mục B', x: 65, y: 215, width: 60, height: 12 },
      ],
    },
  ]);

  assert.equal(result.length, 2);
  assert.deepEqual(result[0].answers, ['Lựa chọn đúng']);
  assert.deepEqual(result[1].options, ['Mục A', 'Mục B']);
  assert.deepEqual(result[1].answers, []);
});
