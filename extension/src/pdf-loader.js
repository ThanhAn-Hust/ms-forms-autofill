import * as pdfjsLib from '../lib/pdf.min.mjs';

if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.mjs');
}

export async function extractPagesDataFromPdf(arrayBuffer, { scale = 2.0 } = {}) {
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDoc = await loadingTask.promise;
  const pagesData = [];

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const unscaledViewport = page.getViewport({ scale: 1.0 });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const textContent = await page.getTextContent();
    const textItems = textContent.items
      .filter((item) => item && typeof item.str === 'string' && item.str.trim().length > 0)
      .map((item) => {
        const tx = pdfjsLib.Util.transform(unscaledViewport.transform, item.transform);
        const fontHeight = Math.hypot(tx[2], tx[3]) || item.height || 12;
        const topY = tx[5] - fontHeight * 0.85;
        return {
          str: item.str,
          x: tx[4],
          y: topY,
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
      rgbaData: imgData.data,
      imgWidth: canvas.width,
      imgHeight: canvas.height,
    });
  }

  return pagesData;
}

export async function parsePdfFile(arrayBuffer) {
  const pagesData = await extractPagesDataFromPdf(arrayBuffer, { scale: 2.0 });
  return globalThis.MSFormsAutofill.parsePdfPages(pagesData);
}
