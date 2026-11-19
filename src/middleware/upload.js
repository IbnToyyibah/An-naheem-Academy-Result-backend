import multer from 'multer';

const storage = multer.memoryStorage();

export const uploadPassport = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/jpg', 'image/png'].includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only JPG, JPEG, and PNG images are allowed'));
  }
});

export const uploadCsv = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isCsvMime = [
      'text/csv',
      'application/vnd.ms-excel',
      'text/plain',
      'application/csv',
      'text/comma-separated-values'
    ].includes(file.mimetype);
    const isCsvExt = (file.originalname || '').toLowerCase().endsWith('.csv');
    if (isCsvMime || isCsvExt) return cb(null, true);
    cb(new Error('Only CSV files (.csv) are allowed'));
  }
});
