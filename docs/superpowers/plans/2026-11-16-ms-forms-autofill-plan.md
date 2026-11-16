# MS Forms PDF Autofill Chrome Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Manifest V3 Chrome/Edge Extension at `/home/la/.gemini/antigravity-cli/scratch/ms-forms-autofill` that parses Microsoft Forms "Save my response" printed PDFs 100% locally in the browser and autofills matching Microsoft Forms pages regardless of question/option shuffling.

**Architecture:** Classic UMD/IIFE shared core modules (`matcher.js`, `pdf-layout-parser.js`, `dom-filler.js`) usable both as Chrome MV3 classic content scripts (`globalThis.MSFormsAutofill`) and in Node ESM (`node --test` via thin wrappers or dual export), bundled alongside `pdfjs-dist@4.10.38` in `extension/lib/`.

**Tech Stack:** Chrome Extension Manifest V3, Vanilla JS, `pdfjs-dist@4.10.38`, `jsdom` (tests), Node.js `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-16-ms-forms-autofill-design.md`

---

## Global Constraints
- 100% in-browser execution with no external network requests or CDN dependencies in `extension/`.
- No bare `export` / `import` syntax inside files loaded directly as MV3 `content_scripts`.
- Always `.normalize('NFC')` text before comparison to handle Vietnamese decomposed PDF text.
- Never auto-submit the form.
- Use native prototype `.value` setter + `input` & `change` events for React inputs.

## Steps
1. Step 1: Initialize project, save docs, install `pdfjs-dist@4.10.38` & `jsdom`, copy `pdf.min.mjs` and `pdf.worker.min.mjs` to `extension/lib/`.
2. Step 2: TDD `extension/src/matcher.js` + `tests/matcher.test.js`.
3. Step 3: TDD `extension/src/pdf-layout-parser.js` + `tests/pdf-layout-parser.test.js`.
4. Step 4: TDD `extension/src/dom-filler.js` + `tests/dom-filler.test.js`.
5. Step 5: Implement `extension/src/pdf-loader.js`, `extension/src/content.js`, `extension/src/popup.*`, `extension/manifest.json`.
6. Step 6: Create `scripts/generate-sample-pdf.mjs`, `demo/mock-ms-form.html`, `tests/e2e.test.js`, run `npm test`, verify all files, and write `README.md`.
