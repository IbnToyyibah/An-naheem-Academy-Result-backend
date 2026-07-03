import { Router } from 'express';
import mongoose from 'mongoose';
import { Result, serialize, serializeMany, Session, Student, Term, Subject } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { calculateStudentPosition } from '../utils/grading.js';

const router = Router();
router.use(authenticate);
router.use(requireRole('parent'));

router.get('/lookups', async (req, res, next) => {
  try {
    const latestResult = await Result.findOne({ student_id: req.user.studentId })
      .sort({ updated_at: -1, created_at: -1 })
      .populate('session_id')
      .populate('term_id');
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
      'Arabic Language'
    ];
    const orderedSubjects = subjectOrder
      .map((name) => subjects.find((item) => item.subject_name === name))
      .filter(Boolean);
    const remainingSubjects = subjects.filter((item) => !subjectOrder.includes(item.subject_name));
    res.json({
      sessions: serializeMany(sessions),
      terms: serializeMany(terms),
      subjects: serializeMany([...orderedSubjects, ...remainingSubjects]),
      latestResult: latestResult
        ? {
          sessionId: latestResult.session_id?.id || latestResult.session_id?.toString?.(),
          termId: latestResult.term_id?.id || latestResult.term_id?.toString?.()
        }
        : null
    });
  } catch (error) {
    next(error);
  }
});

router.get('/profile', async (req, res, next) => {
  try {
    const profile = await Student.findById(req.user.studentId).populate('class_id').populate('parent_id');
    if (!profile) {
      return res.status(404).json({ message: 'Student profile not found for this parent account' });
    }

    const row = serialize(profile);
    res.json({
      ...row,
      class_name: profile?.class_id?.class_name,
      parent_name: profile?.parent_id?.name,
      parent_phone: profile?.parent_id?.phone,
      parent_email: profile?.parent_id?.email,
      date_of_birth: row.date_of_birth ? new Date(row.date_of_birth).toISOString().slice(0, 10) : row.date_of_birth
    });
  } catch (error) {
    next(error);
  }
});

router.get('/results', async (req, res, next) => {
  try {
    const { sessionId, termId } = req.query;
    const rows = (await Result.find({
      student_id: req.user.studentId,
      session_id: new mongoose.Types.ObjectId(sessionId),
      term_id: new mongoose.Types.ObjectId(termId)
    }).populate('subject_id').populate('session_id').populate('term_id'))
      .map((row) => ({
        ...serialize(row),
        subject_name: row.subject_id?.subject_name,
        session_name: row.session_id?.session_name,
        term_name: row.term_id?.term_name
      }))
      .sort((a, b) => (a.subject_name || '').localeCompare(b.subject_name || ''));

    const totalScore = rows.reduce((sum, row) => sum + Number(row.total), 0);
    const averageScore = rows.length ? Number((totalScore / rows.length).toFixed(2)) : 0;
    const position = await calculateStudentPosition(sessionId, termId, req.user.studentId);
    res.json({
      results: rows,
      summary: {
        totalScore,
        averageScore,
        position,
        attendance: rows[0]?.attendance || null,
        principalRemark: rows[0]?.principal_remark || null
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
