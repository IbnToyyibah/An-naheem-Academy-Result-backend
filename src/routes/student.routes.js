import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { Parent, serialize, Student } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { uploadPassport } from '../middleware/upload.js';
import { logActivity } from '../utils/activity.js';
import { isValidAdmissionNumber, normalizeAdmissionNumber } from '../utils/admission.js';

const router = Router();
router.use(authenticate, requireRole('admin'));
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '..', '..', 'uploads');

const passportPath = (file) => (file ? `/uploads/${file.filename}` : null);
const DEFAULT_PARENT_PASSWORD = '0823';

function validateAdmissionNumber(value) {
  return isValidAdmissionNumber(value);
}

function studentRow(student) {
  const row = serialize(student);
  const parent = student.parent_id;
  const klass = student.class_id;
  return {
    ...row,
    class_id: klass?.id || klass?.toString?.() || row.class_id,
    class_name: klass?.class_name,
    parent_id: parent?.id || parent?.toString?.() || row.parent_id,
    parent_name: parent?.name,
    parent_phone: parent?.phone,
    parent_email: parent?.email,
    date_of_birth: row.date_of_birth ? new Date(row.date_of_birth).toISOString().slice(0, 10) : row.date_of_birth
  };
}

router.get('/', async (req, res, next) => {
  try {
    const search = req.query.search || '';
    const filter = search
      ? {
        $or: [
          { admission_number: new RegExp(search, 'i') },
          { first_name: new RegExp(search, 'i') },
          { last_name: new RegExp(search, 'i') }
        ]
      }
      : {};
    const students = await Student.find(filter)
      .populate('class_id')
      .populate('parent_id')
      .sort({ admission_number: 1 });
    res.json(students.map(studentRow));
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const student = await Student.findById(req.params.id).populate('class_id').populate('parent_id');
    if (!student) return res.status(404).json({ message: 'Student not found' });
    res.json(studentRow(student));
  } catch (error) {
    next(error);
  }
});

router.post('/', uploadPassport.single('passport'), async (req, res, next) => {
  try {
    const body = req.body;
    const admissionNumber = normalizeAdmissionNumber(body.admission_number);
    if (!validateAdmissionNumber(admissionNumber)) {
      return res.status(400).json({ message: 'Admission number must look like ANA/JSS1/001a' });
    }

    const password = await bcrypt.hash(DEFAULT_PARENT_PASSWORD, 12);
    const parent = await Parent.create({
      name: '',
      phone: '',
      email: '',
      password
    });
    const student = await Student.create({
      admission_number: admissionNumber,
      first_name: body.first_name,
      last_name: body.last_name,
      gender: body.gender,
      date_of_birth: body.date_of_birth || null,
      class_id: body.class_id,
      parent_id: parent.id,
      passport_path: passportPath(req.file)
    });
    await logActivity('Admin', `Added student ${admissionNumber}`);
    res.status(201).json({ id: student.id, message: 'Student created' });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', uploadPassport.single('passport'), async (req, res, next) => {
  try {
    const existing = await Student.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Student not found' });

    const body = req.body;
    const admissionNumber = normalizeAdmissionNumber(body.admission_number);
    if (!validateAdmissionNumber(admissionNumber)) {
      return res.status(400).json({ message: 'Admission number must look like ANA/JSS1/001a' });
    }

    const nextPassport = passportPath(req.file) || existing.passport_path;
    await Student.findByIdAndUpdate(req.params.id, {
      admission_number: admissionNumber,
      first_name: body.first_name,
      last_name: body.last_name,
      gender: body.gender,
      date_of_birth: body.date_of_birth || null,
      class_id: body.class_id,
      passport_path: nextPassport
    });
    await logActivity('Admin', `Updated student ${admissionNumber}`);
    res.json({ message: 'Student updated' });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id/passport', async (req, res, next) => {
  try {
    const student = await Student.findById(req.params.id);
    if (student?.passport_path) {
      await fs.unlink(path.join(uploadsDir, path.basename(student.passport_path))).catch(() => { });
      student.passport_path = null;
      await student.save();
    }
    res.json({ message: 'Passport deleted' });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const student = await Student.findByIdAndDelete(req.params.id);
    if (student?.parent_id) await Parent.findByIdAndDelete(student.parent_id);
    await logActivity('Admin', 'Deleted student record');
    res.json({ message: 'Student deleted' });
  } catch (error) {
    next(error);
  }
});

export default router;
