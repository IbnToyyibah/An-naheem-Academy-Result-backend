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

