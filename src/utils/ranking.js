import mongoose from 'mongoose';
import { Result } from '../config/db.js';

/**
 * Computes class positions ranked by average score (total / subjects sat).
 * Ties share the same rank. The next distinct average gets rank = (number of
 * students ranked above it + 1), i.e. standard competition / "1224" ranking.
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
        term_id: new mongoose.Types.ObjectId(termId)
      }
    },
    // 2. Join with students so we can filter by class and get names
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
    // 4. Group: sum totals and count subjects per student
    {
      $group: {
        _id: '$student_id',
        total: { $sum: '$total' },
        subjectCount: { $sum: 1 },
        first_name: { $first: '$student.first_name' },
        last_name: { $first: '$student.last_name' },
        // carry admission_number for stable tie-breaking
        admission_number: { $first: '$student.admission_number' }
      }
    },
    // 5. Compute average
    {
      $addFields: {
        average: {
          $cond: [
            { $gt: ['$subjectCount', 0] },
            { $divide: ['$total', '$subjectCount'] },
            0
          ]
        }
      }
    },
    // 6. Sort: highest average first; ties broken by admission number (alphabetical)
    { $sort: { average: -1, admission_number: 1 } }
  ]);

  // Assign positions using standard competition ranking (1,1,1,4,…)
  const positions = [];
  let lastAverage = null;
  let studentsAbove = 0; // number of students ranked strictly above the current group

  for (const entry of aggregation) {
    // Round to 2 dp to absorb floating-point noise
    const avg = Math.round(entry.average * 100) / 100;

    if (avg !== lastAverage) {
      // New average group — position = total students above this group + 1
      studentsAbove = positions.length;
      lastAverage = avg;
    }

    positions.push({ ...entry, average: avg, position: studentsAbove + 1 });
  }

  return { positions, classSize: positions.length };
}
