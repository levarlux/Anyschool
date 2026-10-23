// PDF Generation Engine (Doc 13 §3, Doc 14 §4)
// Renders document templates to PDF using HTML-to-PDF approach.
// Reuses the same design-token styling as the rest of the app.

export interface DocumentBlock {
  id: string;
  type: 'text' | 'number' | 'table' | 'mergeField' | 'image' | 'signature' | 'divider' | 'spacer';
  x: number;
  y: number;
  width: number;
  height: number;
  config: Record<string, any>;
}

export interface DocumentLayout {
  pageSize: 'A4' | 'Letter' | 'Legal';
  orientation: 'portrait' | 'landscape';
  margins: { top: number; right: number; bottom: number; left: number };
  header: DocumentBlock[] | null;
  footer: DocumentBlock[] | null;
  blocks: DocumentBlock[];
}

export interface DocumentTheme {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
}

// Page dimensions in mm
const PAGE_SIZES: Record<string, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  Letter: { width: 216, height: 279 },
  Legal: { width: 216, height: 356 },
};

/**
 * Convert mm to CSS px (at 96 DPI).
 */
function mmToPx(mm: number): string {
  return `${(mm / 25.4) * 96}px`;
}

/**
 * Render a single block to HTML.
 */
function renderBlock(block: DocumentBlock, mergeData: Record<string, any>, theme: DocumentTheme): string {
  const style = `
    position: absolute;
    left: ${mmToPx(block.x)};
    top: ${mmToPx(block.y)};
    width: ${mmToPx(block.width)};
    font-family: ${theme.fontFamily}, sans-serif;
    font-size: ${theme.fontSize}pt;
    line-height: ${theme.lineHeight};
    color: #1a1a1a;
  `;

  switch (block.type) {
    case 'text':
      return `<div style="${style}">${block.config.content || ''}</div>`;

    case 'number':
      return `<div style="${style}">${block.config.prefix || ''}${block.config.value ?? 0}${block.config.suffix || ''}</div>`;

    case 'mergeField': {
      const value = mergeData[block.config.fieldName] ?? block.config.fallback ?? '';
      return `<div style="${style}">${value}</div>`;
    }

    case 'table': {
      const columns = block.config.columns || [];
      const rows = block.config.rows || [];
      const headers = columns.map((col: any) =>
        `<th style="border:1px solid #ddd;padding:6px 8px;background:${theme.primaryColor};color:#fff;text-align:left;font-weight:600;">${col.label}</th>`
      ).join('');
      const body = rows.map((row: any) =>
        `<tr>${columns.map((col: any) =>
          `<td style="border:1px solid #ddd;padding:6px 8px;">${row[col.field] ?? ''}</td>`
        ).join('')}</tr>`
      ).join('');
      return `<table style="${style}border-collapse:collapse;width:100%;"><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table>`;
    }

    case 'image':
      return `<img src="${block.config.src || ''}" style="${style}max-width:100%;object-fit:contain;" />`;

    case 'signature':
      return `<div style="${style}border-top:1px solid #333;padding-top:4px;width:${mmToPx(block.width)};">${block.config.label || 'Signature'}</div>`;

    case 'divider':
      return `<hr style="${style}border:none;border-top:1px solid #ddd;width:100%;" />`;

    case 'spacer':
      return `<div style="${style}height:${mmToPx(block.height)};"></div>`;

    default:
      return '';
  }
}

/**
 * Render the full document layout to HTML.
 */
export function renderDocumentToHTML(
  layout: DocumentLayout,
  theme: DocumentTheme,
  mergeData: Record<string, any>,
  schoolBranding?: { logo?: string; name?: string }
): string {
  const page = PAGE_SIZES[layout.pageSize] || PAGE_SIZES.A4;
  const isLandscape = layout.orientation === 'landscape';
  const pageWidth = isLandscape ? page.height : page.width;
  const pageHeight = isLandscape ? page.width : page.height;

  const headerHtml = layout.header?.map(b => renderBlock(b, mergeData, theme)).join('') || '';
  const footerHtml = layout.footer?.map(b => renderBlock(b, mergeData, theme)).join('') || '';
  const blocksHtml = layout.blocks.map(b => renderBlock(b, mergeData, theme)).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page {
    size: ${isLandscape ? 'landscape' : 'portrait'};
    margin: 0;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: ${theme.fontFamily}, -apple-system, sans-serif;
    font-size: ${theme.fontSize}pt;
    line-height: ${theme.lineHeight};
    color: #1a1a1a;
  }
  .page {
    width: ${mmToPx(pageWidth)};
    height: ${mmToPx(pageHeight)};
    position: relative;
    padding: ${mmToPx(layout.margins.top)} ${mmToPx(layout.margins.right)} ${mmToPx(layout.margins.bottom)} ${mmToPx(layout.margins.left)};
    background: #fff;
    page-break-after: always;
    overflow: hidden;
  }
  .page:last-child { page-break-after: auto; }
  .school-brand {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
  }
  .school-brand img { height: 40px; }
  .school-brand .name { font-size: 16pt; font-weight: 700; color: ${theme.primaryColor}; }
</style>
</head>
<body>
  <div class="page">
    ${schoolBranding?.logo ? `<div class="school-brand"><img src="${schoolBranding.logo}" /><span class="name">${schoolBranding.name || ''}</span></div>` : ''}
    ${headerHtml}
    ${blocksHtml}
    ${footerHtml}
  </div>
</body>
</html>`;
}

/**
 * Generate PDF from template + merge data.
 * Returns HTML string that can be sent to a headless browser (Puppeteer)
 * or rendered client-side for preview.
 */
export function generateDocumentPDF(
  layout: DocumentLayout,
  theme: DocumentTheme,
  mergeData: Record<string, any>,
  schoolBranding?: { logo?: string; name?: string }
): string {
  return renderDocumentToHTML(layout, theme, mergeData, schoolBranding);
}
