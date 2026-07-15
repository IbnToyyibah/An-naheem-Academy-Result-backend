import mongoose from 'mongoose';
import { Result } from '../config/db.js';

export function calculateGrade(total) {
  if (total >= 70) return { grade: 'A', remark: 'Excellent' };
  if (total >= 60) return { grade: 'B', remark: 'Very Good' };
  if (total >= 50) return { grade: 'C', remark: 'Good' };
  if (total >= 45) return { grade: 'D', remark: 'Fair' };
  if (total >= 40) return { grade: 'E', remark: 'Poor' };
  return { grade: 'F', remark: 'Fail' };
}

export function normalizeScore(score) {
  const firstCa = Number(score.firstCa ?? score.first_ca ?? 0);
  const secondCa = Number(score.secondCa ?? score.second_ca ?? 0);
  const exam = Number(score.exam ?? 0);

  if (firstCa < 0 || firstCa > 20) throw new Error('1st CA must be between 0 and 20');
  if (secondCa < 0 || secondCa > 20) throw new Error('2nd CA must be between 0 and 20');
  if (exam < 0 || exam > 60) throw new Error('Exam score must be between 0 and 60');

  const total = firstCa + secondCa + exam;
  return { firstCa, secondCa, exam, total, ...calculateGrade(total) };
}

export async function calculateStudentPosition(sessionId, termId, studentId) {
  if (!sessionId || !termId || !studentId) return 'Pending';

  const results = await Result.aggregate([
    {
      $match: {
        session_id: new mongoose.Types.ObjectId(sessionId),
        term_id: new mongoose.Types.ObjectId(termId)
      }
    },
    {
      $group: {
        _id: '$student_id',
        totalScore: { $sum: '$total' }
      }
    },
    {
      $sort: {
        totalScore: -1,
        _id: 1
      }
    }
  ]);

  if (!results.length) return 'Pending';

  let rank = 1;
  let currentPosition = 1;
  let lastTotal = null;

  for (const row of results) {
    const totalScore = Number(row.totalScore);

    if (lastTotal !== null && totalScore !== lastTotal) {
      rank = currentPosition;
    }

    if (row._id?.toString() === studentId.toString()) {
      return rank;
    }

    lastTotal = totalScore;
    currentPosition += 1;
  }

  return 'Pending';
}
