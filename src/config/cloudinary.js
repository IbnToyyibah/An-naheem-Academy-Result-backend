import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env variables in case this is loaded independently
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (process.env.CLOUDINARY_URL) {
  cloudinary.config({
    secure: true
  });
} else if (cloudName && apiKey && apiSecret) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true
  });
} else {
  console.warn('WARNING: Cloudinary is not configured. Image uploads will fail. Please set CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.');
}

/**
 * Uploads a file buffer to Cloudinary.
 * @param {Buffer} buffer - File buffer
 * @param {string} folder - Folder name in Cloudinary
 * @returns {Promise<object>} - Cloudinary upload result
 */
export const uploadToCloudinary = (buffer, folder = 'passports') => {
  const config = cloudinary.config();
  if (!config.cloud_name && !process.env.CLOUDINARY_URL) {
    return Promise.reject(
      new Error('Cloudinary is not configured. Please set CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.')
    );
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image'
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    uploadStream.end(buffer);
  });
};

/**
 * Deletes an image from Cloudinary using its secure URL or public ID.
 * @param {string} urlOrPublicId - Secure URL or public ID of the image
 * @returns {Promise<object>} - Cloudinary deletion result
 */
export const deleteFromCloudinary = async (urlOrPublicId) => {
  if (!urlOrPublicId) return null;

  const config = cloudinary.config();
  if (!config.cloud_name && !process.env.CLOUDINARY_URL) {
    console.warn('Cloudinary is not configured. Skipping image deletion for:', urlOrPublicId);
    return null;
  }

  // Extract public ID if a URL is passed
  let publicId = urlOrPublicId;
  if (urlOrPublicId.includes('res.cloudinary.com')) {
    // Robustly extract public ID by finding content after '/upload/' and stripping version & extension
    const match = urlOrPublicId.match(/\/upload\/(?:v\d+\/)?([^.]+)/);
    if (match && match[1]) {
      publicId = match[1];
    } else {
      // Fallback extraction
      const parts = urlOrPublicId.split('/');
      const uploadIndex = parts.indexOf('upload');
      if (uploadIndex !== -1 && parts.length > uploadIndex + 2) {
        const pathParts = parts.slice(uploadIndex + 2);
        const fullPath = pathParts.join('/');
        const lastDotIndex = fullPath.lastIndexOf('.');
        publicId = lastDotIndex !== -1 ? fullPath.substring(0, lastDotIndex) : fullPath;
      }
    }
  }

  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(publicId, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
  });
};

export default cloudinary;
