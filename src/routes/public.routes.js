import { Router } from 'express';
import mongoose from 'mongoose';
import { Class, Student, serializeMany } from '../config/db.js';
import { uploadPassport } from '../middleware/upload.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../config/cloudinary.js';
import { logActivity } from '../utils/activity.js';
import { admissionExactRegex, isValidAdmissionNumber, normalizeAdmissionNumber } from '../utils/admission.js';

const router = Router();

router.get('/classes', async (_req, res, next) => {
  try {
    const classes = await Class.find().sort({ class_name: 1 });
    res.json(serializeMany(classes));
  } catch (error) {
    next(error);
  }
});

router.post('/student-passport', uploadPassport.single('passport'), async (req, res, next) => {
  try {
    const admissionNumber = normalizeAdmissionNumber(req.body.admissionNumber);
    const fullName = String(req.body.fullName || '').trim().replace(/\s+/g, ' ');
    const nameParts = fullName.split(' ');
    const classId = String(req.body.classId || '');
    const gender = String(req.body.gender || '');

    if (!isValidAdmissionNumber(admissionNumber)) {
      return res.status(400).json({ message: 'Enter a valid student admission number' });
    }
    if (nameParts.length < 2 || fullName.length > 100) {
      return res.status(400).json({ message: 'Enter the student’s full name' });
    }
    if (!mongoose.Types.ObjectId.isValid(classId) || !await Class.exists({ _id: classId })) {
      return res.status(400).json({ message: 'Select a valid class' });
    }
    if (!['Male', 'Female'].includes(gender)) {
      return res.status(400).json({ message: 'Select a valid gender' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'Choose a JPG or PNG passport image to upload' });
    }

    let student = await Student.findOne({
      admission_number: admissionExactRegex(admissionNumber)
    });

    const uploadResult = await uploadToCloudinary(req.file.buffer);
    if (!uploadResult?.secure_url) {
      throw new Error('Passport upload did not return an image URL');
    }
    const previousPassport = student?.passport_path;
    const isNewStudent = !student;

    try {
      if (student) {
        student.passport_path = uploadResult.secure_url;
      } else {
        student = new Student({
          admission_number: admissionNumber,
          first_name: nameParts[0],
          last_name: nameParts.slice(1).join(' '),
          class_id: classId,
          gender,
          passport_path: uploadResult.secure_url
        });
      }
      await student.save();
    } catch (error) {
      await deleteFromCloudinary(uploadResult.secure_url).catch((cleanupError) => {
        console.error('Failed to clean up uploaded passport after student update failed:', cleanupError);
      });
      if (error.code === 11000) {
        return res.status(409).json({ message: 'That student ID has already been registered. Please submit again.' });
      }
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

    await logActivity('Student', `${isNewStudent ? 'Registered' : 'Updated passport for'} ${student.admission_number}`);
    res.json({
      message: isNewStudent
        ? 'BIODATA submitted and student registered successfully.'
        : 'BIODATA submitted and passport updated successfully.'
    });
  } catch (error) {
    next(error);
  }
});

export default router;
