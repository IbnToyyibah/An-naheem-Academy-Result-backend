import { Router } from 'express';
import { Student } from '../config/db.js';
import { uploadPassport } from '../middleware/upload.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../config/cloudinary.js';
import { logActivity } from '../utils/activity.js';
import { admissionExactRegex, isValidAdmissionNumber, normalizeAdmissionNumber } from '../utils/admission.js';

const router = Router();

router.post('/student-passport', uploadPassport.single('passport'), async (req, res, next) => {
  try {
    const admissionNumber = normalizeAdmissionNumber(req.body.admissionNumber);

    if (!isValidAdmissionNumber(admissionNumber)) {
      return res.status(400).json({ message: 'Enter a valid student admission number' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'Choose a JPG or PNG passport image to upload' });
    }

    const student = await Student.findOne({
      admission_number: admissionExactRegex(admissionNumber)
    });
    if (!student) {
      return res.status(403).json({
        message: 'Student could not be found. Check the student ID or contact the school.'
      });
    }

    const uploadResult = await uploadToCloudinary(req.file.buffer);
    if (!uploadResult?.secure_url) {
      throw new Error('Passport upload did not return an image URL');
    }
    const previousPassport = student.passport_path;
    student.passport_path = uploadResult.secure_url;

    try {
      await student.save();
    } catch (error) {
      await deleteFromCloudinary(uploadResult.secure_url).catch((cleanupError) => {
        console.error('Failed to clean up uploaded passport after student update failed:', cleanupError);
      });
      throw error;
    }

    if (
      previousPassport
      && previousPassport !== uploadResult.secure_url
      && previousPassport.includes('res.cloudinary.com')
    ) {
      await deleteFromCloudinary(previousPassport).catch((error) => {
        console.error('Failed to delete replaced passport from Cloudinary:', error);
      });
    }

    await logActivity('Student', `Uploaded passport for ${student.admission_number}`);
    res.json({ message: 'Passport uploaded successfully. It will appear on the student result.' });
  } catch (error) {
    next(error);
  }
});

export default router;
