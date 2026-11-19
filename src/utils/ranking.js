import mongoose from 'mongoose';
import { Result } from '../config/db.js';

/**
 * Computes class positions ranked by total score (sum of all subject totals).
 * Students with the same total share the same rank.
 * The next distinct total gets rank = (number of students ranked above + 1),
 * i.e. standard competition / "1224" ranking.
 *
 * @param {string} classId   - ObjectId of the class
 * @param {string} sessionId - ObjectId of the session
 * @param {string} termId    - ObjectId of the term
 * @returns {Promise<{ positions: Array, classSize: number }>}
 */
export async function computeClassPositions(classId, sessionId, termId) {
  if (
    !mongoose.Types.ObjectId.isValid(classId) ||
    !mongoose.Types.ObjectId.isValid(sessionId) ||
    !mongoose.Types.ObjectId.isValid(termId)
  ) {
    throw new Error('Invalid classId, sessionId or termId');
  }

  const aggregation = await Result.aggregate([
    // 1. Filter to the requested session + term
    {
      $match: {
        session_id: new mongoose.Types.ObjectId(sessionId),
        term_id: new mongoose.Types.ObjectId(termId),
        total: { $gt: 0 }   // exclude zero-score rows so blank entries don't distort totals
      }
    },
    {
      $lookup: {
        from: 'students',
        localField: 'student_id',
        foreignField: '_id',
        as: 'student'
      }
    },
    { $unwind: '$student' },
    // 3. Keep only students in the requested class
    { $match: { 'student.class_id': new mongoose.Types.ObjectId(classId) } },
    // 4. Group: sum all subject totals per student
    {
      $group: {
        _id: '$student_id',
        total: { $sum: '$total' },
        subjectCount: { $sum: 1 },
        first_name: { $first: '$student.first_name' },
        last_name: { $first: '$student.last_name' },
        admission_number: { $first: '$student.admission_number' }
      }
    },
    // 5. Sort: highest total first; ties broken by admission number (stable, alphabetical)
    { $sort: { total: -1, admission_number: 1 } }
  ]);

  // Assign positions using standard competition ranking (1, 1, 3, 4, …)
  const positions = [];
  let lastTotal = null;
  let studentsAbove = 0;

  for (const entry of aggregation) {
    if (entry.total !== lastTotal) {
      studentsAbove = positions.length; // students strictly above this group
      lastTotal = entry.total;
    }
    positions.push({ ...entry, position: studentsAbove + 1 });
  }

  return { positions, classSize: positions.length };
}
