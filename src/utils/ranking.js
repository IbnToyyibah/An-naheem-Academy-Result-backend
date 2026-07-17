import mongoose from 'mongoose';
import { Result, Student } from '../config/db.js';

/**
 
 * @param {string} classId   - ObjectId of the class
 * @param {string} sessionId - ObjectId of the session
 * @param {string} termId    - ObjectId of the term
 * @returns {Promise<{ positions: Array, classSize: number }>} - positions array includes each entry: { student_id, total, first_name, last_name, position }
 */
export async function computeClassPositions(classId, sessionId, termId) {
  if (!mongoose.Types.ObjectId.isValid(classId) || !mongoose.Types.ObjectId.isValid(sessionId) || !mongoose.Types.ObjectId.isValid(termId)) {
    throw new Error('Invalid classId, sessionId or termId');
  }

  // Aggregate sum of total scores per student within the specified class/session/term
  const aggregation = await Result.aggregate([
    // Match session and term
    { $match: { session_id: new mongoose.Types.ObjectId(sessionId), term_id: new mongoose.Types.ObjectId(termId) } },
    // Join with Student to filter by class
    {
      $lookup: {
        from: 'students',
        localField: 'student_id',
        foreignField: '_id',
        as: 'student'
      }
    },
    { $unwind: '$student' },
    // Keep only students belonging to the requested class
    { $match: { 'student.class_id': new mongoose.Types.ObjectId(classId) } },
    // Group by student and sum totals
    {
      $group: {
        _id: '$student_id',
        total: { $sum: '$total' },
        first_name: { $first: '$student.first_name' },
        last_name: { $first: '$student.last_name' }
      }
    },
    // Sort descending by total score
    { $sort: { total: -1 } }
  ]);

  const positions = [];
  let lastScore = null;
  let lastRank = 0;
  let index = 0;
  for (const entry of aggregation) {
    index++;
    if (entry.total === lastScore) {
      positions.push({ ...entry, position: lastRank });
    } else {
      lastScore = entry.total;
      lastRank = index;
      positions.push({ ...entry, position: lastRank });
    }
  }

  const classSize = positions.length; // only students with at least one result are counted
  return { positions, classSize };
}
