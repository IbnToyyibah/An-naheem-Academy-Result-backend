import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { Parent, Student, User, Result, Session, Term, Subject, serialize, serializeMany } from '../config/db.js';
import { authenticate, requireRole, signToken } from '../middleware/auth.js';
import { admissionExactRegex, isValidAdmissionNumber, normalizeAdmissionNumber } from '../utils/admission.js';
import { normalizeScore, calculateStudentPosition } from '../utils/grading.js';

const router = Router();
const DEFAULT_PARENT_PASSWORD = '0823';

router.post('/admin/login', async (req, res, next) => {
  try {
    const { username, email, password } = req.body;
    const loginId = username || email;
    const admin = await User.findOne({ email: loginId, role: 'admin' });
    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const token = signToken({ id: admin.id, role: 'admin', email: admin.email });
    res.json({ token, user: { id: admin.id, email: admin.email, role: 'admin' } });
  } catch (error) {
    next(error);
  }
});

router.post('/parent/login', async (req, res, next) => {
  try {
    const { admissionNumber, password } = req.body;
    if (!admissionNumber || !password) {
      return res.status(400).json({ message: 'Admission number and password are required' });
    }

    const normalizedAdmissionNumber = normalizeAdmissionNumber(admissionNumber);
    if (!isValidAdmissionNumber(normalizedAdmissionNumber)) {
      return res.status(400).json({ message: 'Admission number must look like ANA/JSS1/001a' });
    }

    const student = await Student.findOne({ admission_number: admissionExactRegex(normalizedAdmissionNumber) })
      .populate('parent_id')
      .populate('class_id');
    if (!student) {
      return res.status(404).json({ message: 'No student found with this admission number' });
    }

    if (password !== DEFAULT_PARENT_PASSWORD) {
      return res.status(401).json({ message: 'Parent password is the school default: 0823' });
    }

    let parent = student.parent_id;
    if (!parent) {
      parent = await Parent.create({
        name: '',
        phone: '',
        email: '',
        password: await bcrypt.hash(DEFAULT_PARENT_PASSWORD, 12)
      });
      student.parent_id = parent.id;
      await student.save();
    }

    if (!(await bcrypt.compare(DEFAULT_PARENT_PASSWORD, parent.password))) {
      parent.password = await bcrypt.hash(DEFAULT_PARENT_PASSWORD, 12);
      await parent.save();
    }

    // prepare sessions/terms and latest result lookups
    const [sessions, terms, subjects] = await Promise.all([
      Session.find().sort({ session_name: -1 }),
      Term.find().sort({ created_at: 1 }),
      Subject.find()
    ]);
    const subjectOrder = [
      'Mathematics',
      'English Language',
      'Intermediate Science',
      'Social and Citizenship Education',
      'Islamic Religious Studies',
      'Business Studies',
      'Agricultural Science',
      'Digital Technology',
      'Physical and Health Education',
      'Home Economics',

    ];
    const orderedSubjects = subjectOrder
      .map((name) => subjects.find((item) => item.subject_name === name))
      .filter(Boolean);
    const remainingSubjects = subjects.filter((item) => !subjectOrder.includes(item.subject_name));

    const latestResult = await Result.findOne({ student_id: student.id })
      .sort({ updated_at: -1, created_at: -1 })
      .populate('session_id')
      .populate('term_id');

    const latestSessionId = latestResult ? (latestResult.session_id?.id || latestResult.session_id?.toString?.()) : (sessions.find((s) => s.is_current)?.id || sessions[0]?.id || null);
    const latestTermId = latestResult ? (latestResult.term_id?.id || latestResult.term_id?.toString?.()) : (terms[0]?.id || null);

    // fetch results for the selected session/term if available
    let resultsRows = [];
    if (latestSessionId && latestTermId) {
      const rows = await Result.find({
        student_id: student.id,
        session_id: latestSessionId,
        term_id: latestTermId
      }).populate('subject_id').populate('session_id').populate('term_id');

      resultsRows = rows.map((row) => ({
        ...serialize(row),
        subject_name: row.subject_id?.subject_name,
        session_name: row.session_id?.session_name,
        term_name: row.term_id?.term_name
      })).sort((a, b) => (a.subject_name || '').localeCompare(b.subject_name || ''));
    }

    const totalScore = resultsRows.reduce((sum, r) => sum + Number(r.total || 0), 0);
    const averageScore = resultsRows.length ? Number((totalScore / resultsRows.length).toFixed(2)) : 0;
    const position = await calculateStudentPosition(latestSessionId, latestTermId, student.id);

    const token = signToken({
      id: parent.id,
      role: 'parent',
      studentId: student.id,
      admissionNumber: student.admission_number
    });

    res.json({
      token,
      user: {
        id: parent.id,
        role: 'parent',
        name: parent.name,
        studentId: student.id,
        admissionNumber: student.admission_number,
        first_name: student.first_name,
        last_name: student.last_name,
        gender: student.gender,
        date_of_birth: student.date_of_birth ? new Date(student.date_of_birth).toISOString().slice(0, 10) : null,
        class_id: student.class_id?.id,
        class_name: student.class_id?.class_name,
        passport_path: student.passport_path,
        parent_name: parent.name,
        parent_phone: parent.phone,
        parent_email: parent.email,
        lookups: {
          sessions: serializeMany(sessions),
          terms: serializeMany(terms),
          subjects: serializeMany([...orderedSubjects, ...remainingSubjects]),
          latestResult: latestResult
            ? { sessionId: latestSessionId, termId: latestTermId }
            : null
        },
        results: {
          results: resultsRows,
          summary: {
            totalScore,
            averageScore,
            position,
            attendance: resultsRows[0]?.attendance || null,
            principalRemark: resultsRows[0]?.principal_remark || null
          }
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

export default router;
