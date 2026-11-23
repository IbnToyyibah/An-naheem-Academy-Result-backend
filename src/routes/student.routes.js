import { Router } from 'express';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { Class, Parent, serialize, Student } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { uploadCsv, uploadPassport } from '../middleware/upload.js';
import { logActivity } from '../utils/activity.js';
import { isValidAdmissionNumber, normalizeAdmissionNumber, generateNextAdmissionNumber } from '../utils/admission.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../config/cloudinary.js';
import { parseStudentRows } from '../utils/csv.js';

const router = Router();
router.use(authenticate, requireRole('admin'));

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

// Auto-generate the next sequential admission number based on class
router.get('/next-admission-number', async (req, res, next) => {
  try {
    const { classId } = req.query;
    if (!classId) {
      return res.status(400).json({ message: 'Missing classId query parameter' });
    }
    const admissionNumber = await generateNextAdmissionNumber(classId);
    res.json({ admissionNumber });
  } catch (error) {
    next(error);
  }
});

router.post('/upload-csv', uploadCsv.single('csvFile'), async (req, res, next) => {
  try {
    const rawCsv = req.file?.buffer?.toString('utf8');
    if (!rawCsv?.trim()) {
      return res.status(400).json({ message: 'Select a non-empty student CSV file to upload' });
    }

    let parsed;
    try {
      parsed = parseStudentRows(rawCsv);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    const errors = [...parsed.errors];
    const [classes, existingStudents] = await Promise.all([
      Class.find(),
      Student.find().select('admission_number')
    ]);
    const classesById = new Map(classes.map((item) => [item.id, item]));
    const normalizeClassKey = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const classesByName = new Map(classes.map((item) => [normalizeClassKey(item.class_name), item]));
    const fallbackClass = req.body.classId ? classesById.get(req.body.classId) : null;
    const usedAdmissionNumbers = new Set(
      existingStudents.map((student) => normalizeAdmissionNumber(student.admission_number).toLowerCase())
    );
    const nextNumbersByClass = new Map();
    const studentsToCreate = [];

    for (const entry of parsed.entries) {
      const classValue = entry.className || '';
      const classDoc = classValue
        ? ((mongoose.Types.ObjectId.isValid(classValue) && classesById.get(classValue))
          || classesByName.get(normalizeClassKey(classValue)))
        : fallbackClass;

      if (!classDoc) {
        errors.push(`Row ${entry.rowNumber}: Class "${classValue || '(not provided)'}" was not found. Include a valid class or select a default class.`);
        continue;
      }

      let admissionNumber = entry.admissionNumber
        ? normalizeAdmissionNumber(entry.admissionNumber)
        : '';
      if (!admissionNumber) {
        let sequence = nextNumbersByClass.get(classDoc.id);
        if (!sequence) {
          const firstNumber = await generateNextAdmissionNumber(classDoc.id);
          const match = firstNumber.match(/^ANA\/((?:JSS|SS)[1-3])\/(\d{3,})$/i);
          if (!match) {
            errors.push(`Row ${entry.rowNumber}: Could not generate an admission number for ${classDoc.class_name}`);
            continue;
          }
          sequence = { code: match[1].toUpperCase(), number: Number(match[2]) };
        }

        do {
          const padded = String(sequence.number).padStart(3, '0');
          admissionNumber = `ANA/${sequence.code}/${padded}`;
          sequence.number += 1;
        } while (usedAdmissionNumbers.has(admissionNumber.toLowerCase()));
        nextNumbersByClass.set(classDoc.id, sequence);
      }

      if (!isValidAdmissionNumber(admissionNumber)) {
        errors.push(`Row ${entry.rowNumber}: Admission number "${entry.admissionNumber}" must look like ANA/JSS1/001 or ANA/JSS2/001`);
        continue;
      }
      if (usedAdmissionNumbers.has(admissionNumber.toLowerCase())) {
        errors.push(`Row ${entry.rowNumber}: Admission number "${admissionNumber}" already exists`);
        continue;
      }
      usedAdmissionNumbers.add(admissionNumber.toLowerCase());

      let dateOfBirth = null;
      if (entry.dateOfBirth) {
        const parsedDate = new Date(`${entry.dateOfBirth}T00:00:00.000Z`);
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(entry.dateOfBirth)
          || Number.isNaN(parsedDate.getTime())
          || parsedDate.toISOString().slice(0, 10) !== entry.dateOfBirth
        ) {
          errors.push(`Row ${entry.rowNumber}: Date of birth must use YYYY-MM-DD format`);
          continue;
        }
        dateOfBirth = parsedDate;
      }

      studentsToCreate.push({
        ...entry,
        admissionNumber,
        classId: classDoc.id,
        dateOfBirth
      });
    }

    if (errors.length) {
      return res.status(400).json({
        message: `Student CSV validation failed: ${errors.slice(0, 20).join('; ')}`,
        errors,
        totalErrors: errors.length
      });
    }

    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      const defaultPassword = await bcrypt.hash(DEFAULT_PARENT_PASSWORD, 12);
      const parents = studentsToCreate.map((student) => new Parent({
        name: student.parentName,
        phone: student.parentPhone,
        email: student.parentEmail,
        password: defaultPassword
      }));
      await Parent.insertMany(parents, { session });

      const studentDocs = studentsToCreate.map((student, index) => ({
        admission_number: student.admissionNumber,
        first_name: student.firstName,
        last_name: student.lastName,
        gender: student.gender,
        date_of_birth: student.dateOfBirth,
        class_id: student.classId,
        parent_id: parents[index]._id
      }));
      await Student.insertMany(studentDocs, { session });
      await logActivity('Admin', `Imported ${studentsToCreate.length} students from CSV`);
      await session.commitTransaction();

      res.status(201).json({
        message: `Successfully imported ${studentsToCreate.length} student(s). Results can now be matched using each admission number.`,
        studentsCount: studentsToCreate.length,
        students: studentsToCreate.map(({ admissionNumber, firstName, lastName, classId }) => ({
          admissionNumber,
          name: `${firstName} ${lastName}`,
          classId
        }))
      });
    } catch (error) {
      if (session.inTransaction()) await session.abortTransaction();
      next(error);
    } finally {
      await session.endSession();
    }
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
    let admissionNumber = (body.admission_number || '').trim();

    if (!admissionNumber && body.class_id) {
      admissionNumber = await generateNextAdmissionNumber(body.class_id);
    } else {
      admissionNumber = normalizeAdmissionNumber(admissionNumber);
    }

    if (!validateAdmissionNumber(admissionNumber)) {
      return res.status(400).json({ message: 'Admission number must look like ANA/JSS1/001 or ANA/JSS2/001' });
    }

    let passportUrl = null;
    if (req.file) {
      const uploadResult = await uploadToCloudinary(req.file.buffer);
      passportUrl = uploadResult.secure_url;
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
      passport_path: passportUrl
    });
    await logActivity('Admin', `Added student ${admissionNumber}`);
    res.status(201).json({ id: student.id, message: 'Student created', admission_number: student.admission_number });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', uploadPassport.single('passport'), async (req, res, next) => {
  try {
    const existing = await Student.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Student not found' });

    const body = req.body;
    let admissionNumber = (body.admission_number || '').trim();
    if (!admissionNumber && body.class_id && body.class_id !== existing.class_id?.toString()) {
      admissionNumber = await generateNextAdmissionNumber(body.class_id);
    } else if (admissionNumber) {
      admissionNumber = normalizeAdmissionNumber(admissionNumber);
    } else {
      admissionNumber = existing.admission_number;
    }

    if (!validateAdmissionNumber(admissionNumber)) {
      return res.status(400).json({ message: 'Admission number must look like ANA/JSS1/001 or ANA/JSS2/001' });
    }

    let nextPassport = existing.passport_path;
    if (req.file) {
      if (existing.passport_path) {
        await deleteFromCloudinary(existing.passport_path).catch((err) => {
          console.error('Failed to delete old passport from Cloudinary:', err);
        });
      }
      const uploadResult = await uploadToCloudinary(req.file.buffer);
      nextPassport = uploadResult.secure_url;
    }

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
      if (student.passport_path.includes('res.cloudinary.com')) {
        await deleteFromCloudinary(student.passport_path).catch((err) => {
          console.error('Failed to delete passport from Cloudinary:', err);
        });
      }
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
    if (student) {
      if (student.passport_path) {
        if (student.passport_path.includes('res.cloudinary.com')) {
          await deleteFromCloudinary(student.passport_path).catch((err) => {
            console.error('Failed to delete passport from Cloudinary:', err);
          });
        }
      }
      if (student.parent_id) await Parent.findByIdAndDelete(student.parent_id);
      await logActivity('Admin', 'Deleted student record');
    }
    res.json({ message: 'Student deleted' });
  } catch (error) {
    next(error);
  }
});

export default router;
