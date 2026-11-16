import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PDF = path.resolve(__dirname, '../demo/sample-response-A.pdf');

function escapePdfText(str) {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function pdfText(x, yTop, fontSize, text, { bold = false, rgb = [0.1, 0.1, 0.1] } = {}) {
  const pageH = 792;
  const yPdf = pageH - yTop;
  const fontRef = bold ? '/F2' : '/F1';
  return [
    'q',
    `${rgb[0]} ${rgb[1]} ${rgb[2]} rg`,
    'BT',
    `${fontRef} ${fontSize} Tf`,
    `1 0 0 1 ${x.toFixed(2)} ${yPdf.toFixed(2)} Tm`,
    `(${escapePdfText(text)}) Tj`,
    'ET',
    'Q',
  ].join('\n');
}

function pdfCircleCommands(cx, cyPdf, r) {
  const k = 0.55228475 * r;
  return [
    `${(cx + r).toFixed(2)} ${cyPdf.toFixed(2)} m`,
    `${(cx + r).toFixed(2)} ${(cyPdf + k).toFixed(2)} ${(cx + k).toFixed(2)} ${(cyPdf + r).toFixed(2)} ${cx.toFixed(2)} ${(cyPdf + r).toFixed(2)} c`,
    `${(cx - k).toFixed(2)} ${(cyPdf + r).toFixed(2)} ${(cx - r).toFixed(2)} ${(cyPdf + k).toFixed(2)} ${(cx - r).toFixed(2)} ${cyPdf.toFixed(2)} c`,
    `${(cx - r).toFixed(2)} ${(cyPdf - k).toFixed(2)} ${(cx - k).toFixed(2)} ${(cyPdf - r).toFixed(2)} ${cx.toFixed(2)} ${(cyPdf - r).toFixed(2)} c`,
    `${(cx + k).toFixed(2)} ${(cyPdf - r).toFixed(2)} ${(cx + r).toFixed(2)} ${(cyPdf - k).toFixed(2)} ${(cx + r).toFixed(2)} ${cyPdf.toFixed(2)} c`,
    'h',
  ].join('\n');
}

function pdfRadio(cx, yTopCenter, selected) {
  const pageH = 792;
  const cyPdf = pageH - yTopCenter;
  const outerR = 6;
  const lines = [
    'q',
    '1.2 w',
    selected ? '0.06 0.42 0.74 RG' : '0.35 0.35 0.35 RG',
    pdfCircleCommands(cx, cyPdf, outerR),
    'S',
  ];
  if (selected) {
    lines.push('0.06 0.42 0.74 rg');
    lines.push(pdfCircleCommands(cx, cyPdf, 3.4));
    lines.push('f');
  }
  lines.push('Q');
  return lines.join('\n');
}

function pdfCheckbox(cx, yTopCenter, checked, { solidStyle = true } = {}) {
  const pageH = 792;
  const cyPdf = pageH - yTopCenter;
  const size = 12;
  const x0 = cx - size / 2;
  const y0 = cyPdf - size / 2;
  const lines = ['q'];

  if (checked && solidStyle) {
    lines.push('0.06 0.42 0.74 rg');
    lines.push(`${x0.toFixed(2)} ${y0.toFixed(2)} ${size} ${size} re`);
    lines.push('f');
    lines.push('1 1 1 RG');
    lines.push('1.6 w');
  } else {
    lines.push('1.2 w');
    lines.push(checked ? '0.06 0.42 0.74 RG' : '0.35 0.35 0.35 RG');
    lines.push(`${x0.toFixed(2)} ${y0.toFixed(2)} ${size} ${size} re`);
    lines.push('S');
    if (checked) {
      lines.push('0.06 0.42 0.74 RG');
      lines.push('1.6 w');
    }
  }

  if (checked) {
    lines.push(`${(x0 + 2.5).toFixed(2)} ${(cyPdf - 0.5).toFixed(2)} m`);
    lines.push(`${(x0 + 5.0).toFixed(2)} ${(cyPdf - 3.2).toFixed(2)} l`);
    lines.push(`${(x0 + 9.5).toFixed(2)} ${(cyPdf + 3.2).toFixed(2)} l`);
    lines.push('S');
  }

  lines.push('Q');
  return lines.join('\n');
}

function pdfTextAnswerBox(x, yTop, width, height) {
  const pageH = 792;
  const yPdfBottom = pageH - (yTop + height);
  return [
    'q',
    '0.82 0.84 0.87 RG',
    '0.8 w',
    `${x.toFixed(2)} ${yPdfBottom.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re`,
    'S',
    'Q',
  ].join('\n');
}

function buildPdfDocument(pageStreams) {
  const objects = [];
  const addObj = (body) => {
    objects.push(body);
    return objects.length;
  };

  const fontRegularId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const fontBoldId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const pagesIdPlaceholder = addObj('');

  const pageIds = [];
  for (const stream of pageStreams) {
    const contentBytes = Buffer.byteLength(stream, 'utf8');
    const contentId = addObj(
      `<< /Length ${contentBytes} >>\nstream\n${stream}\nendstream`
    );
    const pageId = addObj(
      `<< /Type /Page /Parent ${pagesIdPlaceholder} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    pageIds.push(pageId);
  }

  objects[pagesIdPlaceholder - 1] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  const catalogId = addObj(`<< /Type /Catalog /Pages ${pagesIdPlaceholder} 0 R >>`);

  let out = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(out, 'utf8'));
    out += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(out, 'utf8');
  out += `xref\n0 ${objects.length + 1}\n`;
  out += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(out, 'utf8');
}

export function generateSamplePdf(outPath = OUT_PDF) {
  const page1 = [
    // Browser print header
    pdfText(36, 16, 9, '11/16/26, 12:05 PM', { rgb: [0.45, 0.45, 0.45] }),
    pdfText(240, 16, 9, 'Sample Knowledge Quiz', { rgb: [0.45, 0.45, 0.45] }),

    // Form Header
    pdfText(50, 56, 18, 'Sample Knowledge Quiz', { bold: true }),

    // Q1: Single choice radio
    pdfText(50, 100, 12, '1. What is the capital city of Vietnam? * (1 Point)', { bold: true }),
    pdfRadio(66, 126, false),
    pdfText(84, 130, 12, 'Danang'),
    pdfRadio(66, 154, true),
    pdfText(84, 158, 12, 'Hanoi'),
    pdfRadio(66, 182, false),
    pdfText(84, 186, 12, 'Ho Chi Minh City'),
    pdfRadio(66, 210, false),
    pdfText(84, 214, 12, 'Hue'),

    // Q2: Multi-choice checkboxes (both solid blue & outline checkmark styles)
    pdfText(50, 258, 12, '2. Which technologies run natively inside modern web browsers? (2 Points)', { bold: true }),
    pdfCheckbox(66, 284, true, { solidStyle: true }),
    pdfText(84, 288, 12, 'JavaScript'),
    pdfCheckbox(66, 312, false),
    pdfText(84, 316, 12, 'Assembly x86'),
    pdfCheckbox(66, 340, true, { solidStyle: false }),
    pdfText(84, 344, 12, 'WebAssembly'),
    pdfCheckbox(66, 368, false),
    pdfText(84, 372, 12, 'COBOL'),

    // Q3: Short text answer inside a printed box
    pdfText(50, 418, 12, '3. What does HTTPS stand for? *', { bold: true }),
    pdfTextAnswerBox(54, 434, 420, 26),
    pdfText(64, 451, 12, 'Hypertext Transfer Protocol Secure'),

    // Browser print footer
    pdfText(36, 778, 9, 'https://forms.office.com/Pages/ResponsePage.aspx?id=sample', { rgb: [0.45, 0.45, 0.45] }),
    pdfText(550, 778, 9, '1/2', { rgb: [0.45, 0.45, 0.45] }),
  ].join('\n');

  const page2 = [
    pdfText(36, 16, 9, '11/16/26, 12:05 PM', { rgb: [0.45, 0.45, 0.45] }),

    // Q4: Numeric-looking options
    pdfText(50, 70, 12, '4. Which HTTP status code indicates Not Found?', { bold: true }),
    pdfRadio(66, 96, false),
    pdfText(84, 100, 12, '1. 200 OK'),
    pdfRadio(66, 124, true),
    pdfText(84, 128, 12, '2. 404 Not Found'),
    pdfRadio(66, 152, false),
    pdfText(84, 156, 12, '3. 500 Internal Server Error'),

    // Q5: Text question
    pdfText(50, 206, 12, '5. Briefly describe why Chrome Extensions use Manifest V3:', { bold: true }),
    pdfTextAnswerBox(54, 222, 460, 26),
    pdfText(64, 239, 12, 'Better security and service worker lifecycle'),

    // MS Forms footer boilerplate
    pdfText(50, 742, 11, 'Microsoft Forms', { bold: true, rgb: [0.35, 0.35, 0.35] }),
    pdfText(50, 758, 9, 'Never give out your password. Report abuse', { rgb: [0.45, 0.45, 0.45] }),

    // Browser print footer
    pdfText(550, 778, 9, '2/2', { rgb: [0.45, 0.45, 0.45] }),
  ].join('\n');

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const pdfBuffer = buildPdfDocument([page1, page2]);
  fs.writeFileSync(outPath, pdfBuffer);
  return outPath;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const written = generateSamplePdf();
  console.log(`Generated sample PDF: ${written}`);
}
