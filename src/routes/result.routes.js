import { Router } from 'express';
import { Result, serialize, Student } from '../config/db.js';
import { computeClassPositions } from '../utils/ranking.js';
import mongoose from 'mongoose';
import { authenticate, requireRole } from '../middleware/auth.js';
import { normalizeScore } from '../utils/grading.js';
import { logActivity } from '../utils/activity.js';

const router = Router();
router.use(authenticate, requireRole('admin'));

// Bulk upload or update results for a single student (admin only)
router.post('/bulk', async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const {
      studentId,
      sessionId,
      termId,
      scores = [],
      attendance = null,
      principalRemark = null,
      principal_remark: principalRemarkSnake = null,
      attendance: attendanceSnake = null
    } = req.body;

    // ---------- basic validation ----------
    if (!studentId || !sessionId || !termId) {
      return res.status(400).json({ message: 'Missing required studentId, sessionId or termId' });
    }
    if (![studentId, sessionId, termId].every((value) => mongoose.Types.ObjectId.isValid(value))) {
      return res.status(400).json({ message: 'Invalid studentId, sessionId or termId' });
    }
    if (!Array.isArray(scores)) {
      return res.status(400).json({ message: 'Scores must be an array' });
    }
    // Detect duplicate subjectIds in the payload
    const subjectIds = scores.map(s => s.subjectId?.toString()).filter(Boolean);
    const duplicates = subjectIds.filter((id, i) => subjectIds.indexOf(id) !== i);
    if (duplicates.length) {
      return res.status(400).json({ message: 'Duplicate subjectId entries detected', duplicates });
    }
    const invalidSubject = scores.find((raw) => !mongoose.Types.ObjectId.isValid(raw.subjectId ?? raw.subject_id));
    if (invalidSubject) {
      return res.status(400).json({ message: 'Invalid subjectId in score payload' });
    }

    // Prepare bulk operations
    const ops = scores.map((raw) => {
      // Normalise field names (frontend may send snake_case)
      const score = {
        firstCa: raw.first_ca ?? raw.firstCa ?? raw.firstCA,
        secondCa: raw.second_ca ?? raw.secondCa ?? raw.secondCA,
        exam: raw.exam ?? raw.examination,
        subjectId: raw.subjectId ?? raw.subject_id
      };
      const calculated = normalizeScore(score);
      return {
        updateOne: {
          filter: {
            student_id: new mongoose.Types.ObjectId(studentId),
            subject_id: new mongoose.Types.ObjectId(score.subjectId),
            session_id: new mongoose.Types.ObjectId(sessionId),
            term_id: new mongoose.Types.ObjectId(termId)
          },
          update: {
            $set: {
              first_ca: calculated.firstCa,
              second_ca: calculated.secondCa,
              exam: calculated.exam,
              total: calculated.total,
              grade: calculated.grade,
              remark: calculated.remark,
              attendance: (attendance ?? attendanceSnake ?? '') === '' ? null : (attendance ?? attendanceSnake),
              principal_remark: principalRemark ?? principalRemarkSnake ?? null
            }
          },
          upsert: true
        }
      };
    });

    if (ops.length) {
      await Result.bulkWrite(ops, { session });
    }

    await logActivity('Admin', `Uploaded results for student #${studentId}`);
    await session.commitTransaction();
    res.json({ message: 'Results saved successfully' });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
});

// Edit a single result (admin only)
router.put('/:resultId', async (req, res, next) => {
  try {
    const { resultId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(resultId)) {
      return res.status(400).json({ message: 'Invalid resultId' });
    }
    // Fetch existing result
    const existing = await Result.findById(resultId);
    if (!existing) {
      return res.status(404).json({ message: 'Result not found' });
    }

    // Normalise incoming payload (accept camelCase or snake_case)
    const {
      first_ca,
      firstCa,
      second_ca,
      secondCa,
      exam,
      attendance,
      attendance: attendanceSnake,
      principalRemark,
      principal_remark: principalRemarkSnake,
    } = req.body;

    // Build a clean score object for recalculation
    const score = {
      firstCa: first_ca ?? firstCa ?? existing.first_ca,
      secondCa: second_ca ?? secondCa ?? existing.second_ca,
      exam: exam ?? existing.exam,
    };
    const normalized = normalizeScore(score);

    // Assemble the update object, preserving fields not supplied in the request
    const updateFields = {
      first_ca: score.firstCa,
      second_ca: score.secondCa,
      exam: score.exam,
      attendance:
        attendance !== undefined
          ? attendance === ''
            ? null
            : attendance
          : attendanceSnake !== undefined
          ? attendanceSnake === ''
            ? null
            : attendanceSnake
          : existing.attendance,
      principal_remark:
        principalRemark ?? principalRemarkSnake ?? existing.principal_remark,
      total: normalized.total,
      grade: normalized.grade,
      remark: normalized.remark,
    };

    const result = await Result.findByIdAndUpdate(resultId, { $set: updateFields }, { new: true });
    await logActivity('Admin', `Edited result #${resultId}`);
    res.json({ message: 'Result updated successfully', result: serialize(result) });
  } catch (error) {
    next(error);
  }
});

// Get results for a student (admin only). Populates subject, session and term for full info.
router.get('/class/:classId/positions', async (req, res, next) => {
  try {
    const { classId } = req.params;
    const { sessionId, termId } = req.query;
    if (!mongoose.Types.ObjectId.isValid(classId) || !mongoose.Types.ObjectId.isValid(sessionId) || !mongoose.Types.ObjectId.isValid(termId)) {
      return res.status(400).json({ message: 'Invalid classId, sessionId or termId' });
    }
    const { positions, classSize } = await computeClassPositions(classId, sessionId, termId);
    // map positions to include readable name
    const formatted = positions.map(p => ({
      studentId: p._id,
      firstName: p.first_name,
      lastName: p.last_name,
      total: p.total,
      position: p.position
    }));
    res.json({ classSize, positions: formatted });
  } catch (error) {
    next(error);
  }
});

router.get('/student/:studentId', async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const { sessionId, termId } = req.query;
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ message: 'Invalid studentId' });
    }
    if (!sessionId || !termId) {
      return res.status(400).json({ message: 'Missing sessionId or termId query parameters' });
    }
    if (!mongoose.Types.ObjectId.isValid(sessionId) || !mongoose.Types.ObjectId.isValid(termId)) {
      return res.status(400).json({ message: 'Invalid sessionId or termId query parameters' });
    }
    const rows = await Result.find({
      student_id: studentId,
      session_id: sessionId,
      term_id: termId
    })
      .populate('subject_id')
      .populate('session_id')
      .populate('term_id')
      .lean();

    const serialized = rows.map(row => ({
      ...serialize(row),
      subject_name: row.subject_id?.subject_name,
      session_name: row.session_id?.session_name,
      term_name: row.term_id?.term_name
    }));
    // compute position within class
    const student = await Student.findById(studentId);
    let positionInfo = null;
    if (student?.class_id) {
      const { positions, classSize } = await computeClassPositions(student.class_id.toString(), sessionId, termId);
      const thisPos = positions.find(p => p._id.toString() === studentId);
      if (thisPos) {
        positionInfo = { position: thisPos.position, classSize };
      }
    }
    // attach position info to each result row (same for all rows)
    const resultWithPos = serialized.map(r => ({ ...r, ...positionInfo }));
    resultWithPos.sort((a, b) => (a.subject_name || '').localeCompare(b.subject_name || ''));
    res.json(resultWithPos);
  } catch (error) {
    next(error);
  }
});

export default router;
