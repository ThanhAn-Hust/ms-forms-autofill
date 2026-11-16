import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

import '../extension/src/matcher.js';
import '../extension/src/pdf-layout-parser.js';
import '../extension/src/dom-filler.js';

const { parsePdfPages, autofillFormDOM } = globalThis.MSFormsAutofill;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function rasterizeOperatorList(opList, viewport, scale) {
  const { OPS, Util } = pdfjsLib;
  const imgW = Math.ceil(viewport.width);
  const imgH = Math.ceil(viewport.height);
  const rgba = new Uint8ClampedArray(imgW * imgH * 4);
  rgba.fill(255);

  const stack = [];
  let state = {
    ctm: [...viewport.transform],
    fillRgb: [0, 0, 0],
    strokeRgb: [0, 0, 0],
    fillAlpha: 1,
    strokeAlpha: 1,
    smask: false,
    lineWidth: 1,
  };

  let currentPath = [];

  function plotPixel(x, y, rgb, alpha = 1) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || ix >= imgW || iy < 0 || iy >= imgH) return;
    const idx = (iy * imgW + ix) * 4;
    if (alpha >= 0.99) {
      rgba[idx] = rgb[0];
      rgba[idx + 1] = rgb[1];
      rgba[idx + 2] = rgb[2];
      rgba[idx + 3] = 255;
    } else if (alpha > 0.01) {
      rgba[idx] = Math.round(rgba[idx] * (1 - alpha) + rgb[0] * alpha);
      rgba[idx + 1] = Math.round(rgba[idx + 1] * (1 - alpha) + rgb[1] * alpha);
      rgba[idx + 2] = Math.round(rgba[idx + 2] * (1 - alpha) + rgb[2] * alpha);
      rgba[idx + 3] = 255;
    }
  }

  function drawLine(x0, y0, x1, y1, rgb, thickness, alpha = 1) {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(dist * 2));
    const r = Math.max(0.6, thickness / 2);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = x0 + (x1 - x0) * t;
      const cy = y0 + (y1 - y0) * t;
      for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
        for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
          if (dx * dx + dy * dy <= r * r + 0.35) {
            plotPixel(cx + dx, cy + dy, rgb, alpha);
          }
        }
      }
    }
  }

  function parseColorArg(args) {
    if (!args) return [0, 0, 0];
    if (typeof args[0] === 'string' && args[0].startsWith('#') && args[0].length === 7) {
      return [
        parseInt(args[0].slice(1, 3), 16),
        parseInt(args[0].slice(3, 5), 16),
        parseInt(args[0].slice(5, 7), 16),
      ];
    }
    if (typeof args[0] === 'number' && args.length >= 3) {
      return [Math.round(args[0]), Math.round(args[1]), Math.round(args[2])];
    }
    if (args[0] && typeof args[0].length === 'number' && args[0].length >= 3) {
      return [Math.round(args[0][0]), Math.round(args[0][1]), Math.round(args[0][2])];
    }
    return [0, 0, 0];
  }

  function buildSubpaths(ops, coords) {
    const subpaths = [];
    let active = [];
    let ci = 0;
    let curX = 0;
    let curY = 0;

    const pt = (x, y) => Util.applyTransform([x, y], state.ctm);

    for (const op of ops) {
      if (op === OPS.moveTo) {
        if (active.length > 0) subpaths.push(active);
        const [x, y] = pt(coords[ci], coords[ci + 1]);
        ci += 2;
        active = [{ x, y }];
        curX = x;
        curY = y;
      } else if (op === OPS.lineTo) {
        const [x, y] = pt(coords[ci], coords[ci + 1]);
        ci += 2;
        active.push({ x, y });
        curX = x;
        curY = y;
      } else if (op === OPS.curveTo) {
        const [x1, y1] = pt(coords[ci], coords[ci + 1]);
        const [x2, y2] = pt(coords[ci + 2], coords[ci + 3]);
        const [x3, y3] = pt(coords[ci + 4], coords[ci + 5]);
        ci += 6;
        const x0 = curX;
        const y0 = curY;
        const segments = 16;
        for (let s = 1; s <= segments; s++) {
          const t = s / segments;
          const u = 1 - t;
          const bx =
            u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3;
          const by =
            u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
          active.push({ x: bx, y: by });
        }
        curX = x3;
        curY = y3;
      } else if (op === OPS.rectangle) {
        if (active.length > 0) subpaths.push(active);
        const rx = coords[ci];
        const ry = coords[ci + 1];
        const rw = coords[ci + 2];
        const rh = coords[ci + 3];
        ci += 4;
        const p1 = pt(rx, ry);
        const p2 = pt(rx + rw, ry);
        const p3 = pt(rx + rw, ry + rh);
        const p4 = pt(rx, ry + rh);
        subpaths.push([
          { x: p1[0], y: p1[1] },
          { x: p2[0], y: p2[1] },
          { x: p3[0], y: p3[1] },
          { x: p4[0], y: p4[1] },
          { x: p1[0], y: p1[1] },
        ]);
        active = [];
      } else if (op === OPS.closePath) {
        if (active.length > 0) {
          active.push({ ...active[0] });
          subpaths.push(active);
          active = [];
        }
      }
    }
    if (active.length > 0) subpaths.push(active);
    return subpaths;
  }

  function fillSubpaths(subpaths, rgb, alpha = 1) {
    if (state.smask || alpha < 0.2) return;
    const validPolys = subpaths.filter((poly) => poly.length >= 3);
    if (validPolys.length === 0) return;

    let minX = imgW, maxX = 0, minY = imgH, maxY = 0;
    for (const poly of validPolys) {
      for (const p of poly) {
        if (p.x < minX) minX = Math.floor(p.x);
        if (p.x > maxX) maxX = Math.ceil(p.x);
        if (p.y < minY) minY = Math.floor(p.y);
        if (p.y > maxY) maxY = Math.ceil(p.y);
      }
    }
    minX = Math.max(0, minX);
    maxX = Math.min(imgW - 1, maxX);
    minY = Math.max(0, minY);
    maxY = Math.min(imgH - 1, maxY);

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        let inside = false;
        for (const poly of validPolys) {
          for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i].x, yi = poly[i].y;
            const xj = poly[j].x, yj = poly[j].y;
            const intersect =
              yi > py !== yj > py &&
              px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi;
            if (intersect) inside = !inside;
          }
        }
        if (inside) plotPixel(px, py, rgb, alpha);
      }
    }
  }

  function strokeSubpaths(subpaths, rgb, thickness, alpha = 1) {
    if (state.smask || alpha < 0.2) return;
    for (const poly of subpaths) {
      for (let i = 1; i < poly.length; i++) {
        drawLine(poly[i - 1].x, poly[i - 1].y, poly[i].x, poly[i].y, rgb, thickness, alpha);
      }
    }
  }

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i];
    if (fn === OPS.save) {
      stack.push({
        ctm: [...state.ctm],
        fillRgb: [...state.fillRgb],
        strokeRgb: [...state.strokeRgb],
        fillAlpha: state.fillAlpha,
        strokeAlpha: state.strokeAlpha,
        smask: state.smask,
        lineWidth: state.lineWidth,
      });
    } else if (fn === OPS.restore) {
      if (stack.length > 0) state = stack.pop();
    } else if (fn === OPS.transform) {
      state.ctm = Util.transform(state.ctm, args);
    } else if (fn === OPS.setFillRGBColor) {
      state.fillRgb = parseColorArg(args);
    } else if (fn === OPS.setStrokeRGBColor) {
      state.strokeRgb = parseColorArg(args);
    } else if (fn === OPS.setGState && Array.isArray(args[0])) {
      for (const [k, v] of args[0]) {
        if (k === 'ca') state.fillAlpha = Number(v);
        else if (k === 'CA') state.strokeAlpha = Number(v);
        else if (k === 'LW') state.lineWidth = Number(v) || 1;
        else if (k === 'SMask') state.smask = Boolean(v);
      }
    } else if (fn === OPS.setLineWidth) {
      state.lineWidth = Number(args[0]) || 1;
    } else if (fn === OPS.constructPath) {
      currentPath = buildSubpaths(args[0], args[1]);
    } else if (fn === OPS.stroke) {
      strokeSubpaths(currentPath, state.strokeRgb, state.lineWidth * scale, state.strokeAlpha);
      currentPath = [];
    } else if (fn === OPS.fill || fn === OPS.eoFill) {
      fillSubpaths(currentPath, state.fillRgb, state.fillAlpha);
      currentPath = [];
    } else if (fn === OPS.fillStroke) {
      fillSubpaths(currentPath, state.fillRgb, state.fillAlpha);
      strokeSubpaths(currentPath, state.strokeRgb, state.lineWidth * scale, state.strokeAlpha);
      currentPath = [];
    }
  }

  return { rgbaData: rgba, imgWidth: imgW, imgHeight: imgH };
}

test('End-to-End: parses demo/sample-response-A.pdf via pdfjs-dist and autofills shuffled demo/mock-ms-form.html', async () => {
  const pdfPath = path.join(ROOT, 'demo', 'sample-response-A.pdf');
  const htmlPath = path.join(ROOT, 'demo', 'mock-ms-form.html');
  assert.ok(fs.existsSync(pdfPath), 'sample-response-A.pdf must exist');
  assert.ok(fs.existsSync(htmlPath), 'mock-ms-form.html must exist');

  const standardFontDataUrl = pathToFileURL(
    path.join(ROOT, 'node_modules/pdfjs-dist/standard_fonts/')
  ).href;

  const pdfBytes = new Uint8Array(fs.readFileSync(pdfPath));
  const pdfDoc = await pdfjsLib.getDocument({
    data: pdfBytes,
    standardFontDataUrl,
  }).promise;

  assert.equal(pdfDoc.numPages, 2);

  const scale = 2.0;
  const pagesData = [];

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const unscaledViewport = page.getViewport({ scale: 1.0 });

    const opList = await page.getOperatorList();
    const { rgbaData, imgWidth, imgHeight } = rasterizeOperatorList(opList, viewport, scale);

    const textContent = await page.getTextContent();
    const textItems = textContent.items
      .filter((item) => item && typeof item.str === 'string' && item.str.trim().length > 0)
      .map((item) => {
        const tx = pdfjsLib.Util.transform(unscaledViewport.transform, item.transform);
        const fontHeight = Math.hypot(tx[2], tx[3]) || item.height || 12;
        return {
          str: item.str,
          x: tx[4],
          y: tx[5] - fontHeight * 0.85,
          width: Number(item.width) || 0,
          height: fontHeight,
        };
      });

    pagesData.push({
      pageIndex: pageNum - 1,
      width: unscaledViewport.width,
      height: unscaledViewport.height,
      scale,
      textItems,
      rgbaData,
      imgWidth,
      imgHeight,
    });
  }

  const extracted = parsePdfPages(pagesData);
  assert.equal(extracted.length, 5);
  assert.deepEqual(extracted[0].answers, ['Hanoi']);
  assert.deepEqual(extracted[1].answers, ['JavaScript', 'WebAssembly']);
  assert.deepEqual(extracted[2].answers, ['Hypertext Transfer Protocol Secure']);
  assert.deepEqual(extracted[3].answers, ['2. 404 Not Found']);
  assert.deepEqual(extracted[4].answers, ['Better security and service worker lifecycle']);

  const html = fs.readFileSync(htmlPath, 'utf8');
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const summary = autofillFormDOM(doc, extracted, dom.window);
  assert.equal(summary.totalOnPage, 5);
  assert.equal(summary.matchedCount, 5);
  assert.equal(summary.filledCount, 5);
  assert.deepEqual(summary.unmatchedTitles, []);

  // Verify shuffled Form B answers
  assert.equal(doc.querySelector('#form-b-q1 input[value="404"]').checked, true);
  assert.equal(
    doc.querySelector('#form-b-q2 input').value,
    'Hypertext Transfer Protocol Secure'
  );

  const q3Checks = Array.from(doc.querySelectorAll('#form-b-q3 input[type="checkbox"]'));
  assert.equal(q3Checks.find((el) => el.value === 'COBOL').checked, false);
  assert.equal(q3Checks.find((el) => el.value === 'WebAssembly').checked, true);
  assert.equal(q3Checks.find((el) => el.value === 'Assembly x86').checked, false);
  assert.equal(q3Checks.find((el) => el.value === 'JavaScript').checked, true);

  assert.equal(
    doc.querySelector('#form-b-q4 textarea').value,
    'Better security and service worker lifecycle'
  );
  assert.equal(doc.querySelector('#form-b-q5 input[value="Hanoi"]').checked, true);

  for (let i = 1; i <= 5; i++) {
    assert.equal(
      doc.getElementById(`form-b-q${i}`).getAttribute('data-ms-autofill-status'),
      'filled'
    );
  }
});

test('Real 40-question MS Forms PDF: extracts all 40 questions and 40/40 answers accurately', async (t) => {
  const realPdfPath =
    '/home/la/.gemini/antigravity-cli/brain/7f9feedb-8dc6-499e-aa63-937aba6d7472/.user_uploaded/uploaded_media_1794808803169.pdf';
  if (!fs.existsSync(realPdfPath)) {
    t.skip('Local user sample PDF not present on this machine');
    return;
  }

  const standardFontDataUrl = pathToFileURL(
    path.join(ROOT, 'node_modules/pdfjs-dist/standard_fonts/')
  ).href;

  const pdfBytes = new Uint8Array(fs.readFileSync(realPdfPath));
  const pdfDoc = await pdfjsLib.getDocument({
    data: pdfBytes,
    standardFontDataUrl,
    verbosity: 0,
  }).promise;

  assert.equal(pdfDoc.numPages, 15);

  const scale = 2.0;
  const pagesData = [];
  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const unscaledViewport = page.getViewport({ scale: 1.0 });
    const opList = await page.getOperatorList();
    const { rgbaData, imgWidth, imgHeight } = rasterizeOperatorList(opList, viewport, scale);
    const textContent = await page.getTextContent();
    const textItems = textContent.items
      .filter((item) => item && typeof item.str === 'string' && item.str.trim().length > 0)
      .map((item) => {
        const tx = pdfjsLib.Util.transform(unscaledViewport.transform, item.transform);
        const fontHeight = Math.hypot(tx[2], tx[3]) || item.height || 12;
        return {
          str: item.str,
          x: tx[4],
          y: tx[5] - fontHeight * 0.85,
          width: Number(item.width) || 0,
          height: fontHeight,
        };
      });

    pagesData.push({
      pageIndex: pageNum - 1,
      width: unscaledViewport.width,
      height: unscaledViewport.height,
      scale,
      textItems,
      rgbaData,
      imgWidth,
      imgHeight,
    });
  }

  const parsed = parsePdfPages(pagesData);
  assert.equal(parsed.length, 40);
  assert.equal(parsed.filter((q) => q.answers.length > 0).length, 40);

  const byNum = Object.fromEntries(parsed.map((q) => [q.number, q]));
  assert.deepEqual(byNum[1].answers, ['1']);
  assert.deepEqual(byNum[2].answers, ['Tất cả các lựa chọn khác']);
  assert.deepEqual(byNum[3].answers, ['(6954 + 2588)/10000']);
  assert.deepEqual(byNum[9].answers, ['0.074']);
  assert.deepEqual(byNum[13].answers, ['Cả 1 và 4']);
  assert.deepEqual(byNum[14].answers, ['1 và 2']);
  assert.deepEqual(byNum[16].answers, ['7.11']);
  assert.deepEqual(byNum[27].answers, ['4.743']);
  assert.deepEqual(byNum[39].answers, ['B và E']);
  assert.deepEqual(byNum[40].answers, ['5']);
});
