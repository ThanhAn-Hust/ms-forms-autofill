# MS Forms PDF Autofill Chrome Extension — Design Spec

## 1. Goals & Scope
- **Goals:**
  - Read a Microsoft Forms "Save my response" printed PDF (`PDF A`) 100% locally in the browser using `pdf.js` + `<canvas>` to extract questions and their selected/filled answers (supporting single-choice radio, multi-choice checkbox, and short/long text fill-in questions).
  - Display a clean preview list (`Question -> Answer`) in the Extension Popup right after loading the PDF so the user can visually verify and click to adjust any answer immediately.
  - Persist parsed answers in `chrome.storage.local` across page reloads and multi-page form navigation.
  - When opening `Form B` on Microsoft Forms and clicking fill, match questions and options by text content (independent of question order or A/B/C/D option shuffling) and dispatch proper React-compatible DOM interactions/events.
  - Provide a compact floating widget (`⚡ Điền đáp án`) on Microsoft Forms pages with an optional auto-fill on page transition toggle.
- **Non-Goals & Anti-Goals:**
  - Never auto-click the final **Submit / Gửi** button (the user always reviews and submits manually).
  - Never match strictly by question index (`1, 2, 3`) or option letter because Form B may shuffle questions and options.

## 2. Architecture & Approach
- **Chosen Approach:** 100% in-browser processing using `pdfjs-dist` (`pdf.min.mjs` + `pdf.worker.min.mjs` bundled in `extension/lib/`) and `<canvas>` pixel density inspection, paired with a Manifest V3 popup and content script. No external API keys, servers, or network calls.
- **Rejected Approach:** Sending rendered PDF page images to an external LLM API (adds network latency, external dependency, and API key friction).

## 3. Core Components
1. **Text Normalization & Fuzzy Matcher (`extension/src/matcher.js`):**
   - Unicode NFC normalization (handling PDF NFD decomposed Vietnamese diacritics vs DOM NFC), prefix/point/asterisk stripping, bigram Dice similarity, and option-set tie breaking for duplicate question titles.
2. **PDF Layout & Canvas Pixel Parser (`extension/src/pdf-layout-parser.js`):**
   - Header/footer noise filtering (dates, URLs, page numbers, Microsoft Forms boilerplate).
   - Visual line grouping by Y-coordinate and question segmentation by numbered prefixes (`1.`, `2.`, ...).
   - Left-strip canvas pixel density analysis (`centerInkRatio` and `totalInkRatio`) + Unicode glyph fallback to detect filled radio circles and checked checkboxes vs unselected controls.
   - Text answer extraction for open-ended questions (ignoring placeholders like `"Enter your answer"` / `"Nhập câu trả lời của bạn"`).
3. **Microsoft Forms DOM Autofiller (`extension/src/dom-filler.js`):**
   - Extracts questions, choice options, and text inputs from Microsoft Forms DOM (excluding screen-reader-only / ordinal nodes).
   - Clicks matching choice items (both single radio and multi checkbox, unchecking mismatched checkboxes) and sets React-controlled input/textarea values using native prototype setters + `focus`/`input`/`change`/`blur` events.
4. **Browser Integration & UI (`extension/manifest.json`, `extension/src/pdf-loader.js`, `extension/src/content.js`, `extension/src/popup.*`):**
   - Popup with drag-and-drop/file-picker `.pdf` upload, search filter, interactive option toggles, editable text answers, manual question addition, and fill trigger.
   - Content script with floating bottom-right widget and `MutationObserver` auto-fill on page transitions.
