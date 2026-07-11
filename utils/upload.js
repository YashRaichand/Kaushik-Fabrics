const multer = require('multer');

const ALLOWED_MIMETYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE_BYTES = 3 * 1024 * 1024; // 3MB per image
const MAX_FILES = 4;

const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIMETYPES.has(file.mimetype)) {
    return cb(new Error('INVALID_FILE_TYPE'));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: MAX_FILES }
});

// Wraps multer's upload.array so a bad upload renders a friendly page
// instead of crashing the request with an unhandled multer error.
function handleImageUpload(fieldName) {
  const middleware = upload.array(fieldName, MAX_FILES);
  return (req, res, next) => {
    middleware(req, res, (err) => {
      if (!err) return next();
      req.imageUploadError =
        err.message === 'INVALID_FILE_TYPE'
          ? 'Only JPEG, PNG, or WEBP images are allowed.'
          : err.code === 'LIMIT_FILE_SIZE'
          ? 'Each image must be under 3MB.'
          : err.code === 'LIMIT_FILE_COUNT'
          ? 'You can upload up to 4 images.'
          : 'Could not process the uploaded images.';
      req.files = [];
      next();
    });
  };
}

module.exports = { handleImageUpload, MAX_FILES, MAX_FILE_SIZE_BYTES };
