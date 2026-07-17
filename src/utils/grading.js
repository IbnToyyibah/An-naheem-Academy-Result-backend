import mongoose from 'mongoose';
import { Result, Student } from '../config/db.js';

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

  // Find the student's class so ranking is scoped to classmates only
  const student = await Student.findById(studentId).select('class_id').lean();
  if (!student?.class_id) return 'Pending';

  const results = await Result.aggregate([
    {
      $match: {
        session_id: new mongoose.Types.ObjectId(sessionId),
        term_id: new mongoose.Types.ObjectId(termId)
      }
    },
    // Join with students to filter by class
    {
      $lookup: {
        from: 'students',
        localField: 'student_id',
        foreignField: '_id',
        as: 'studentDoc'
      }
    },
    { $unwind: '$studentDoc' },
    { $match: { 'studentDoc.class_id': new mongoose.Types.ObjectId(student.class_id) } },
    // Group by student and compute average
    {
      $group: {
        _id: '$student_id',
        total: { $sum: '$total' },
        subjectCount: { $sum: 1 }
      }
    },
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
    // Higher average = better rank
    { $sort: { average: -1, _id: 1 } }
  ]);

  if (!results.length) return 'Pending';

  let rank = 1;
  let currentPosition = 1;
  let lastAverage = null;

  for (const row of results) {
    const avg = Math.round((row.average ?? 0) * 100) / 100;

    if (lastAverage !== null && avg !== lastAverage) {
      rank = currentPosition;
    }

    if (row._id?.toString() === studentId.toString()) {
      return rank;
    }

    lastAverage = avg;
    currentPosition += 1;
  }

  return 'Pending';
}
