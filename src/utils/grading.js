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

  // Scope ranking to the student's own class
  const student = await Student.findById(studentId).select('class_id').lean();
  if (!student?.class_id) return 'Pending';

  const results = await Result.aggregate([
    {
      $match: {
        session_id: new mongoose.Types.ObjectId(sessionId),
        term_id: new mongoose.Types.ObjectId(termId)
      }
    },
    // Filter to classmates
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
    // Group: average per student
    {
      $group: {
        _id: '$student_id',
        total: { $sum: '$total' },
        subjectCount: { $sum: 1 },
        admission_number: { $first: '$studentDoc.admission_number' }
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
    // Same sort as computeClassPositions — highest average first, ties by admission number
    { $sort: { average: -1, admission_number: 1 } }
  ]);

  if (!results.length) return 'Pending';

  // Standard competition ranking — same logic as computeClassPositions
  let lastAverage = null;
  let studentsAbove = 0;

  for (let i = 0; i < results.length; i++) {
    const row = results[i];
    const avg = Math.round((row.average ?? 0) * 100) / 100;

    if (avg !== lastAverage) {
      studentsAbove = i; // number of students strictly above this group
      lastAverage = avg;
    }

    if (row._id?.toString() === studentId.toString()) {
      return studentsAbove + 1;
    }
  }

  return 'Pending';
}
