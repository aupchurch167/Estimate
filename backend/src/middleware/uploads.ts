/**
 * Multer-backed upload helpers.
 *
 * `csvUpload` is a single-file in-memory parser limited to 10 MB and
 * CSV-ish MIME types. The handler reads the buffer at req.file.buffer.
 */

import multer from 'multer';
import type { Request } from 'express';
import { ValidationError } from '../lib/errors.js';

const CSV_MIMES = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'text/x-csv',
  'text/plain',
  'application/octet-stream',
]);

export const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req: Request, file, cb) => {
    if (!CSV_MIMES.has(file.mimetype)) {
      cb(new ValidationError('Only CSV uploads are supported', { mimetype: file.mimetype }));
      return;
    }
    cb(null, true);
  },
}).single('file');
