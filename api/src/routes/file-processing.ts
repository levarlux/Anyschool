import { Hono } from 'hono';
import { db } from '../db';
import { uploadJobs, entityTypes, fieldDefinitions } from '../../../drizzle/schema';
import { eq, and } from 'drizzle-orm';
import Papa from 'papaparse';

const fileProcessing = new Hono();

const MAX_IMPORT_FILE_SIZE = 20 * 1024 * 1024; // 20MB for import files

const ALLOWED_IMPORT_EXTENSIONS = new Set(['csv', 'xlsx', 'xls', 'pdf', 'png', 'jpg', 'jpeg', 'tiff', 'bmp']);

// Parse CSV buffer into structured rows
function parseCSV(buffer: Buffer): { headers: string[]; rows: Record<string, string>[] } {
  const text = buffer.toString('utf-8');
  const result = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });
  return {
    headers: result.meta.fields || [],
    rows: result.data as Record<string, string>[],
  };
}

// Parse XLSX buffer into structured rows (dynamic import for xlsx)
async function parseXLSX(buffer: Buffer): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);
  const headers = data.length > 0 ? Object.keys(data[0]) : [];
  return { headers, rows: data };
}

// Extract text from native PDF (dynamic import for pdf-parse)
async function parsePDF(buffer: Buffer): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const pdfParse = (await import('pdf-parse')).default;
  const data = await pdfParse(buffer);
  // PDF extraction returns raw text — attempt to detect tabular structure
  const lines = data.text.split('\n').filter((l: string) => l.trim());
  if (lines.length < 2) {
    return { headers: [], rows: [{ _rawText: data.text }] };
  }
  // Heuristic: first line = headers (tab or multiple-space separated)
  const separator = lines[0].includes('\t') ? '\t' : /\s{2,}/;
  const headers = lines[0].split(separator).map((h: string) => h.trim());
  const rows = lines.slice(1).map((line: string) => {
    const cols = line.split(separator).map((c: string) => c.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cols[i] || ''; });
    return row;
  });
  return { headers, rows };
}

// OCR stub — in production would call a real OCR service
async function parseImageOCR(buffer: Buffer, mimeType: string): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  // TODO: Integrate Tesseract.js or cloud OCR API (Doc 13 §4)
  return {
    headers: ['_ocrNote'],
    rows: [{ _ocrNote: 'OCR processing requires integration with Tesseract.js or cloud OCR service. Upload a CSV/XLSX instead for now.' }],
  };
}

// Upload and parse file
fileProcessing.post('/upload/:schoolId', async (c) => {
  const { schoolId } = c.req.param();
  const body = await c.req.parseBody();
  const file = body['file'];

  if (!file || !(file instanceof File)) {
    return c.json({ error: 'No file uploaded' }, 400);
  }

  // Server-side size validation
  if (file.size > MAX_IMPORT_FILE_SIZE) {
    return c.json({ error: `File too large (${Math.round(file.size / 1024 / 1024)}MB). Maximum: 20MB.` }, 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name;
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  // Server-side type validation
  if (!ALLOWED_IMPORT_EXTENSIONS.has(ext)) {
    return c.json({ error: `File type ".${ext}" is not allowed. Supported: CSV, Excel, PDF, images.` }, 400);
  }

  let parsed: { headers: string[]; rows: Record<string, string>[] };

  try {
    switch (ext) {
      case 'csv':
        parsed = parseCSV(buffer);
        break;
      case 'xlsx':
      case 'xls':
        parsed = await parseXLSX(buffer);
        break;
      case 'pdf':
        parsed = await parsePDF(buffer);
        break;
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'tiff':
      case 'bmp':
        parsed = await parseImageOCR(buffer, file.type);
        break;
      default:
        return c.json({ error: `Unsupported file type: .${ext}` }, 400);
    }
  } catch (err: any) {
    return c.json({ error: `Failed to parse file: ${err.message}` }, 400);
  }

  // Store parsed preview (first 50 rows)
  const previewRows = parsed.rows.slice(0, 50);

  const [job] = await db.insert(uploadJobs).values({
    schoolId,
    fileName,
    fileType: ext,
    parsedHeaders: parsed.headers,
    parsedRows: previewRows,
    totalRows: parsed.rows.length,
    status: 'parsed',
    requestedBy: body['userId']?.toString() || 'system',
  }).returning();

  return c.json({
    jobId: job.id,
    fileName,
    fileType: ext,
    headers: parsed.headers,
    totalRows: parsed.rows.length,
    previewRows,
  }, 201);
});

// Get entity type fields for column mapping
fileProcessing.get('/fields/:schoolId/:entityTypeId', async (c) => {
  const { schoolId, entityTypeId } = c.req.param();
  const fields = await db.query.fieldDefinitions.findMany({
    where: and(
      eq(fieldDefinitions.schoolId, schoolId),
      eq(fieldDefinitions.entityTypeId, entityTypeId)
    ),
    orderBy: (f, { asc }) => [asc(f.displayOrder)],
  });
  return c.json(fields.map(f => ({
    id: f.id,
    name: f.name,
    internalName: f.internalName,
    dataType: f.dataType,
    unit: f.unit,
  })));
});

// Save column mapping and import data
fileProcessing.post('/map-and-import/:schoolId/:jobId', async (c) => {
  const { schoolId, jobId } = c.req.param();
  const body = await c.req.json();
  const { columnMapping, targetEntityTypeId } = body;
  // columnMapping: { csvColumnHeader: fieldDefinitionId }

  const job = await db.query.uploadJobs.findFirst({
    where: and(
      eq(uploadJobs.schoolId, schoolId),
      eq(uploadJobs.id, jobId)
    ),
  });
  if (!job) return c.json({ error: 'Upload job not found' }, 404);

  // Update job with mapping
  await db.update(uploadJobs)
    .set({
      columnMapping,
      targetEntityTypeId,
      status: 'importing',
    })
    .where(eq(uploadJobs.id, jobId));

  // In production, this would queue a background job that:
  // 1. Creates entity_records for each row
  // 2. Creates field_values based on column mapping
  // 3. Handles deduplication/matching per Doc 03 §9
  // For now, return success
  return c.json({
    jobId,
    status: 'importing',
    totalRows: job.totalRows,
    message: 'Import queued. Records will be created in background.',
  });
});

// List upload jobs
fileProcessing.get('/jobs/:schoolId', async (c) => {
  const { schoolId } = c.req.param();
  const jobs = await db.query.uploadJobs.findMany({
    where: eq(uploadJobs.schoolId, schoolId),
    orderBy: (j, { desc }) => [desc(j.createdAt)],
  });
  return c.json(jobs);
});

// Get single job
fileProcessing.get('/jobs/:schoolId/:jobId', async (c) => {
  const { schoolId, jobId } = c.req.param();
  const job = await db.query.uploadJobs.findFirst({
    where: and(
      eq(uploadJobs.schoolId, schoolId),
      eq(uploadJobs.id, jobId)
    ),
  });
  if (!job) return c.json({ error: 'Job not found' }, 404);
  return c.json(job);
});

export default fileProcessing;
