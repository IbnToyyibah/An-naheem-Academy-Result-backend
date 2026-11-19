import { Router } from 'express';
import { Result, serialize, Student, Subject, Session, Term, Class } from '../config/db.js';
import { computeClassPositions } from '../utils/ranking.js';
import mongoose from 'mongoose';
import { authenticate, requireRole } from '../middleware/auth.js';
import { uploadCsv } from '../middleware/upload.js';
import { normalizeScore } from '../utils/grading.js';
import { logActivity } from '../utils/activity.js';
import { normalizeAdmissionNumber } from '../utils/admission.js';
import { parseResultsFromCsv, generateCsvTemplate } from '../utils/csv.js';

const router = Router();
router.use(authenticate, requireRole('admin'));

const SUBJECT_ALIASES = {
  'math': 'mathematics',
  'maths': 'mathematics',
  'mathematics': 'mathematics',
  'english': 'english language',
  'english language': 'english language',
  'intermediate science': 'intermediate science',
  'basic science': 'intermediate science',
  'science': 'intermediate science',
  'social studies': 'social and citizenship education',
  'social and citizenship education': 'social and citizenship education',
  'social and citizenship': 'social and citizenship education',
  'civic education': 'social and citizenship education',
  'civic': 'social and citizenship education',
  'agric': 'agricultural science',
  'agriculture': 'agricultural science',
  'agricultural science': 'agricultural science',
  'home economics': 'home economics',
  'home econs': 'home economics',
  'home econ': 'home economics',
  'business studies': 'business studies',
  'business': 'business studies',
  'physical and health education': 'physical and health education',
  'phe': 'physical and health education',
  'p.h.e': 'physical and health education',
  'p.h.e.': 'physical and health education',
  'digital technology': 'digital technology',
  'computer': 'digital technology',
  'computer studies': 'digital technology',
  'ict': 'digital technology',
  'digital tech': 'digital technology',
  'islamic religious studies': 'islamic religious studies',
  'irs': 'islamic religious studies',
  'i.r.s': 'islamic religious studies',
  'islamic studies': 'islamic religious studies',
  'nigerian history': 'nigerian history',
  'history': 'nigerian history',
  'yoruba': 'yoruba',
  'cultural and creative arts': 'cultural and creative arts',
  'cca': 'cultural and creative arts',
  'c.c.a': 'cultural and creative arts',
  'creative arts': 'cultural and creative arts',
  'fine art': 'cultural and creative arts',
  'arabic language': 'arabic language',
  'arabic': 'arabic language'
};

// -------------------------------------------------------------
// Download CSV Template (blank or pre-filled with real students)
// -------------------------------------------------------------
router.get('/csv-template', async (req, res, next) => {
  try {
    const { sessionId, termId, classId, includeStudents } = req.query;
    const shouldIncludeStudents = includeStudents === 'true' || includeStudents === '1' || includeStudents === true;

    let students = [];
    let subjects = [];

    if (shouldIncludeStudents) {
      const studentFilter = classId && mongoose.Types.ObjectId.isValid(classId) ? { class_id: classId } : {};
      students = await Student.find(studentFilter)
        .populate('class_id')
        .sort({ admission_number: 1 });
    }

    subjects = await Subject.find().sort({ subject_name: 1 });

    const csvContent = generateCsvTemplate({
      students,
      subjects,
      includeStudents: shouldIncludeStudents
    });

    const filename = shouldIncludeStudents ? 'results_template_with_students.csv' : 'results_upload_sample.csv';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (error) {
    next(error);
  }
});

// -------------------------------------------------------------
// Bulk Upload Results via CSV File
// -------------------------------------------------------------
router.post('/upload-csv', uploadCsv.single('csvFile'), async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let rawCsv = '';
    if (req.file && req.file.buffer) {
      rawCsv = req.file.buffer.toString('utf8');
    } else if (req.body && req.body.csvText) {
      rawCsv = req.body.csvText;
    }

    if (!rawCsv || !rawCsv.trim()) {
      return res.status(400).json({ message: 'No CSV file or CSV text was uploaded' });
    }

    // Determine target session and term
    let targetSessionId = req.body.sessionId || req.query.sessionId;
    let targetTermId = req.body.termId || req.query.termId;

    let targetSession = null;
    let targetTerm = null;

    if (targetSessionId && mongoose.Types.ObjectId.isValid(targetSessionId)) {
      targetSession = await Session.findById(targetSessionId);
    }
    if (!targetSession) {
      targetSession = await Session.findOne({ is_current: true }) || await Session.findOne();
      targetSessionId = targetSession?._id?.toString();
    }

    if (targetTermId && mongoose.Types.ObjectId.isValid(targetTermId)) {
      targetTerm = await Term.findById(targetTermId);
    }
    if (!targetTerm) {
      targetTerm = await Term.findOne({ is_current: true }) || await Term.findOne();
      targetTermId = targetTerm?._id?.toString();
    }

    if (!targetSessionId || !targetTermId) {
      return res.status(400).json({ message: 'Active academic session and term could not be determined' });
    }

    // Parse CSV
    const { entries, errors: parseErrors } = parseResultsFromCsv(rawCsv, {
      sessionId: targetSessionId,
      termId: targetTermId,
      sessionName: targetSession?.session_name,
      termName: targetTerm?.term_name
    });

    if (parseErrors.length && !entries.length) {
      return res.status(400).json({
        message: 'CSV parsing failed',
        errors: parseErrors
      });
    }

    if (!entries.length) {
      return res.status(400).json({ message: 'No valid result rows found in the CSV file' });
    }

    // Load all students and subjects to build in-memory maps
    const [allStudents, allSubjects, allSessions, allTerms] = await Promise.all([
      Student.find().populate('class_id'),
      Subject.find(),
      Session.find(),
      Term.find()
    ]);

    // Student mapping: by canonical admission number, raw admission number, and ID
    const studentMap = new Map();
    allStudents.forEach((st) => {
      studentMap.set(st.admission_number, st);
      studentMap.set(normalizeAdmissionNumber(st.admission_number), st);
      studentMap.set(st.admission_number.toLowerCase(), st);
      studentMap.set(st.id || st._id.toString(), st);
    });

    // Subject mapping: by lowercase name and aliases
    const subjectMap = new Map();
    allSubjects.forEach((sub) => {
      subjectMap.set(sub.subject_name.toLowerCase().trim(), sub);
    });

    // Session and Term maps for optional per-row overrides
    const sessionNameMap = new Map();
    allSessions.forEach((s) => sessionNameMap.set(s.session_name.toLowerCase().trim(), s));

    const termNameMap = new Map();
    allTerms.forEach((t) => termNameMap.set(t.term_name.toLowerCase().trim(), t));

    // Validate each row
    const validationErrors = [...parseErrors];
    const validOperations = [];
    const studentMetadata = new Map(); // studentId -> { attendance, principalRemark, studentDoc }

    for (const entry of entries) {
      const rowNum = entry.rowNumber;

      // 1. Resolve student
      const normAdm = normalizeAdmissionNumber(entry.admissionNumber);
      const studentDoc = studentMap.get(normAdm) || studentMap.get(entry.admissionNumber) || studentMap.get(entry.admissionNumber.toLowerCase());

      if (!studentDoc) {
        validationErrors.push(`Row ${rowNum}: Student with admission number "${entry.admissionNumber}" was not found.`);
        continue;
      }

      // 2. Resolve subject
      const cleanSubName = String(entry.subject || '').toLowerCase().trim();
      let matchedSubject = subjectMap.get(cleanSubName);
      if (!matchedSubject && SUBJECT_ALIASES[cleanSubName]) {
        matchedSubject = subjectMap.get(SUBJECT_ALIASES[cleanSubName]);
      }
      if (!matchedSubject) {
        // Fallback partial match
        for (const [sName, sDoc] of subjectMap.entries()) {
          if (cleanSubName.includes(sName) || sName.includes(cleanSubName)) {
            matchedSubject = sDoc;
            break;
          }
        }
      }

      if (!matchedSubject) {
        validationErrors.push(`Row ${rowNum}: Subject "${entry.subject}" was not recognized. Available subjects: ${allSubjects.map(s => s.subject_name).join(', ')}.`);
        continue;
      }

      // 3. Resolve session & term
      let entrySessionId = targetSessionId;
      if (entry.session && sessionNameMap.has(entry.session.toLowerCase().trim())) {
        entrySessionId = sessionNameMap.get(entry.session.toLowerCase().trim())._id.toString();
      }

      let entryTermId = targetTermId;
      if (entry.term && termNameMap.has(entry.term.toLowerCase().trim())) {
        entryTermId = termNameMap.get(entry.term.toLowerCase().trim())._id.toString();
      }

      // 4. Validate and calculate scores
      let calculated;
      try {
        calculated = normalizeScore({
          firstCa: entry.firstCa,
          secondCa: entry.secondCa,
          exam: entry.exam
        });
      } catch (scoreErr) {
        validationErrors.push(`Row ${rowNum} (${entry.admissionNumber} - ${matchedSubject.subject_name}): ${scoreErr.message}`);
        continue;
      }

      // Attendance validation
      let attendanceVal = null;
      if (entry.attendance !== null && entry.attendance !== undefined && entry.attendance !== '') {
        const attNum = Number(entry.attendance);
        if (isNaN(attNum) || attNum < 0) {
          validationErrors.push(`Row ${rowNum}: Invalid attendance value "${entry.attendance}". Must be a non-negative number.`);
          continue;
        }
        attendanceVal = attNum;
      }

      const remarkVal = entry.principalRemark ? String(entry.principalRemark).trim() : null;

      // Track student metadata (attendance & remark)
      const stIdKey = studentDoc._id.toString();
      if (!studentMetadata.has(stIdKey)) {
        studentMetadata.set(stIdKey, {
          studentDoc,
          sessionId: entrySessionId,
          termId: entryTermId,
          attendance: attendanceVal,
          principalRemark: remarkVal
        });
      } else {
        const meta = studentMetadata.get(stIdKey);
        if (attendanceVal !== null) meta.attendance = attendanceVal;
        if (remarkVal !== null) meta.principalRemark = remarkVal;
      }

      validOperations.push({
        updateOne: {
          filter: {
            student_id: studentDoc._id,
            subject_id: matchedSubject._id,
            session_id: new mongoose.Types.ObjectId(entrySessionId),
            term_id: new mongoose.Types.ObjectId(entryTermId)
          },
          update: {
            $set: {
              first_ca: calculated.firstCa,
              second_ca: calculated.secondCa,
              exam: calculated.exam,
              total: calculated.total,
              grade: calculated.grade,
              remark: calculated.remark,
              ...(attendanceVal !== null ? { attendance: attendanceVal } : {}),
              ...(remarkVal !== null ? { principal_remark: remarkVal } : {})
            }
          },
          upsert: true
        }
      });
    }

    // If validation errors exist, stop and return them so the user knows what to fix
    if (validationErrors.length > 0) {
      await session.abortTransaction();
      return res.status(400).json({
        message: `Validation failed for ${validationErrors.length} row(s) in the CSV`,
        errors: validationErrors.slice(0, 50), // return first 50 errors
        totalErrors: validationErrors.length,
        parsedRowsCount: entries.length
      });
    }

    if (!validOperations.length) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'No valid result entries could be processed' });
    }

    // Execute bulk writes
    await Result.bulkWrite(validOperations, { session });

    // Ensure student-wide attendance and principal_remark are applied across all rows for that session & term
    for (const [stIdKey, meta] of studentMetadata.entries()) {
      const metaUpdates = {};
      if (meta.attendance !== null && meta.attendance !== undefined) metaUpdates.attendance = meta.attendance;
      if (meta.principalRemark !== null && meta.principalRemark !== undefined) metaUpdates.principal_remark = meta.principalRemark;

      if (Object.keys(metaUpdates).length > 0) {
        await Result.updateMany(
          {
            student_id: new mongoose.Types.ObjectId(stIdKey),
            session_id: new mongoose.Types.ObjectId(meta.sessionId),
            term_id: new mongoose.Types.ObjectId(meta.termId)
          },
          { $set: metaUpdates },
          { session }
        );
      }
    }

    const uniqueStudentsCount = studentMetadata.size;
    const studentList = Array.from(studentMetadata.values()).map((m) => ({
      id: m.studentDoc.id || m.studentDoc._id.toString(),
      admissionNumber: m.studentDoc.admission_number,
      name: `${m.studentDoc.first_name} ${m.studentDoc.last_name}`,
      className: m.studentDoc.class_id?.class_name || ''
    }));

    await logActivity('Admin', `Uploaded CSV results for ${uniqueStudentsCount} student(s) across ${validOperations.length} subject record(s)`);
    await session.commitTransaction();

    res.json({
      success: true,
      message: `Successfully uploaded results for ${uniqueStudentsCount} individual student(s) (${validOperations.length} subject entries)`,
      studentsCount: uniqueStudentsCount,
      resultsCount: validOperations.length,
      sessionName: targetSession?.session_name,
      termName: targetTerm?.term_name,
      students: studentList
    });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
});

// -------------------------------------------------------------
// Bulk upload or update results for a single student (admin only)
// -------------------------------------------------------------
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

    // Always update attendance and principal_remark on existing rows for this
    // student/session/term — even when no score changes were submitted.
    const remarkValue = principalRemark ?? principalRemarkSnake ?? undefined;
    const attendanceValue = (attendance ?? attendanceSnake ?? '') === '' ? null : (attendance ?? attendanceSnake);

    const metaUpdateFields = {};
    if (remarkValue !== undefined) metaUpdateFields.principal_remark = remarkValue;
    if (attendance !== undefined || attendanceSnake !== undefined) {
      metaUpdateFields.attendance = attendanceValue;
    }

    if (Object.keys(metaUpdateFields).length) {
      await Result.updateMany(
        {
          student_id: new mongoose.Types.ObjectId(studentId),
          session_id: new mongoose.Types.ObjectId(sessionId),
          term_id: new mongoose.Types.ObjectId(termId)
        },
        { $set: metaUpdateFields },
        { session }
      );
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

// -------------------------------------------------------------
// Update all results for a student (alias/handler for PUT /results/student/:studentId)
// -------------------------------------------------------------
router.put('/student/:studentId', async (req, res, next) => {
  const { studentId } = req.params;
  const sessionId = req.body.sessionId || req.query.sessionId;
  const termId = req.body.termId || req.query.termId;

  req.body.studentId = studentId;
  req.body.sessionId = sessionId;
  req.body.termId = termId;

  // Delegate to bulk upsert logic
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const {
      scores = [],
      attendance = null,
      principalRemark = null,
      principal_remark: principalRemarkSnake = null,
      attendance: attendanceSnake = null
    } = req.body;

    if (!studentId || !sessionId || !termId) {
      return res.status(400).json({ message: 'Missing required studentId, sessionId or termId' });
    }
    if (![studentId, sessionId, termId].every((value) => mongoose.Types.ObjectId.isValid(value))) {
      return res.status(400).json({ message: 'Invalid studentId, sessionId or termId' });
    }

    const ops = (scores || []).map((raw) => {
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

    const remarkValue = principalRemark ?? principalRemarkSnake ?? undefined;
    const attendanceValue = (attendance ?? attendanceSnake ?? '') === '' ? null : (attendance ?? attendanceSnake);

    const metaUpdateFields = {};
    if (remarkValue !== undefined) metaUpdateFields.principal_remark = remarkValue;
    if (attendance !== undefined || attendanceSnake !== undefined) {
      metaUpdateFields.attendance = attendanceValue;
    }

    if (Object.keys(metaUpdateFields).length) {
      await Result.updateMany(
        {
          student_id: new mongoose.Types.ObjectId(studentId),
          session_id: new mongoose.Types.ObjectId(sessionId),
          term_id: new mongoose.Types.ObjectId(termId)
        },
        { $set: metaUpdateFields },
        { session }
      );
    }

    await logActivity('Admin', `Updated results for student #${studentId}`);
    await session.commitTransaction();
    res.json({ message: 'Results updated successfully' });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
});

// -------------------------------------------------------------
// Edit a single result by resultId (admin only)
// -------------------------------------------------------------
router.put('/:resultId', async (req, res, next) => {
  try {
    const { resultId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(resultId)) {
      return res.status(400).json({ message: 'Invalid resultId' });
    }
    const existing = await Result.findById(resultId);
    if (!existing) {
      return res.status(404).json({ message: 'Result not found' });
    }

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

    const score = {
      firstCa: first_ca ?? firstCa ?? existing.first_ca,
      secondCa: second_ca ?? secondCa ?? existing.second_ca,
      exam: exam ?? existing.exam,
    };
    const normalized = normalizeScore(score);

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

// -------------------------------------------------------------
// Get class positions
// -------------------------------------------------------------
router.get('/class/:classId/positions', async (req, res, next) => {
  try {
    const { classId } = req.params;
    const { sessionId, termId } = req.query;
    if (!mongoose.Types.ObjectId.isValid(classId) || !mongoose.Types.ObjectId.isValid(sessionId) || !mongoose.Types.ObjectId.isValid(termId)) {
      return res.status(400).json({ message: 'Invalid classId, sessionId or termId' });
    }
    const { positions, classSize } = await computeClassPositions(classId, sessionId, termId);
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

// -------------------------------------------------------------
// Get results for a student (admin only)
// -------------------------------------------------------------
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
      .lean({ virtuals: true });

    const serialized = rows.map(row => {
      const subjectDoc = row.subject_id || {};
      const sessionDoc = row.session_id || {};
      const termDoc = row.term_id || {};

      return {
        id: row._id.toString(),
        student_id: row.student_id?.toString?.() ?? row.student_id,
        subject_id: subjectDoc._id?.toString?.() ?? subjectDoc.id ?? subjectDoc,
        session_id: sessionDoc._id?.toString?.() ?? sessionDoc.id ?? sessionDoc,
        term_id: termDoc._id?.toString?.() ?? termDoc.id ?? termDoc,
        subject_name: subjectDoc.subject_name ?? null,
        session_name: sessionDoc.session_name ?? null,
        term_name: termDoc.term_name ?? null,
        first_ca: row.first_ca,
        second_ca: row.second_ca,
        exam: row.exam,
        total: row.total,
        grade: row.grade,
        remark: row.remark,
        attendance: row.attendance,
        principal_remark: row.principal_remark,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    });

    const student = await Student.findById(studentId);
    let positionInfo = null;
    if (student?.class_id) {
      const { positions, classSize } = await computeClassPositions(student.class_id.toString(), sessionId, termId);
      const thisPos = positions.find(p => p._id.toString() === studentId);
      if (thisPos) {
        positionInfo = { position: thisPos.position, classSize };
      }
    }

    const resultWithPos = serialized.map(r => ({ ...r, ...positionInfo }));
    resultWithPos.sort((a, b) => (a.subject_name || '').localeCompare(b.subject_name || ''));
    res.json(resultWithPos);
  } catch (error) {
    next(error);
  }
});

export default router;
