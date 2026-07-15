import mongoose from "mongoose";
import { Result, Student } from "../config/db.js";

/**
 * Calculate grade and remark
 */
export function calculateGrade(total) {
  if (total >= 70) return { grade: "A", remark: "Excellent" };
  if (total >= 60) return { grade: "B", remark: "Very Good" };
  if (total >= 50) return { grade: "C", remark: "Good" };
  if (total >= 45) return { grade: "D", remark: "Fair" };
  if (total >= 40) return { grade: "E", remark: "Poor" };

  return { grade: "F", remark: "Fail" };
}

/**
 * Validate score and calculate total
 */
export function normalizeScore(score) {
  const firstCa = Number(score.firstCa ?? score.first_ca ?? 0);
  const secondCa = Number(score.secondCa ?? score.second_ca ?? 0);
  const exam = Number(score.exam ?? 0);

  if (firstCa < 0 || firstCa > 20)
    throw new Error("First CA must be between 0 and 20");

  if (secondCa < 0 || secondCa > 20)
    throw new Error("Second CA must be between 0 and 20");

  if (exam < 0 || exam > 60)
    throw new Error("Exam must be between 0 and 60");

  const total = firstCa + secondCa + exam;

  return {
    firstCa,
    secondCa,
    exam,
    total,
    ...calculateGrade(total)
  };
}

/**
 * Calculate positions for ALL students
 */
export async function calculateStudentPositions(sessionId, termId, classId) {

  const results = await Result.aggregate([
    {
      $match: {
        session_id: new mongoose.Types.ObjectId(sessionId),
        term_id: new mongoose.Types.ObjectId(termId)
      }
    },

    // Join with students collection to get the student's class
    {
      $lookup: {
        from: 'students',
        localField: 'student_id',
        foreignField: '_id',
        as: 'student_info'
      }
    },
    { $unwind: '$student_info' },

    // Filter by the student's class
    {
      $match: {
        'student_info.class_id': new mongoose.Types.ObjectId(classId)
      }
    },

    {
      $group: {
        _id: "$student_id",

        grandTotal: {
          $sum: "$total"
        },

        average: {
          $avg: "$total"
        },

        subjects: {
          $sum: 1
        }
      }
    },

    {
      $sort: {
        grandTotal: -1,
        _id: 1
      }
    }
  ]);

  if (!results.length) return [];

  let previousTotal = null;
  let rank = 0;

  const rankedStudents = results.map((student, index) => {

    if (student.grandTotal !== previousTotal) {
      rank = index + 1;
    }

    previousTotal = student.grandTotal;

    return {
      studentId: student._id,
      grandTotal: student.grandTotal,
      average: Number(student.average.toFixed(2)),
      subjects: student.subjects,
      position: rank
    };
  });

  return rankedStudents;
}

/**
 * Calculate position for a SINGLE student within their class
 */
export async function calculateStudentPosition(sessionId, termId, studentId) {
  if (!sessionId || !termId || !studentId) return null;

  // Look up the student's class
  const student = await Student.findById(studentId).lean();
  if (!student || !student.class_id) return null;

  const rankings = await calculateStudentPositions(
    sessionId,
    termId,
    student.class_id.toString()
  );

  const entry = rankings.find(
    (r) => r.studentId.toString() === studentId.toString()
  );

  return entry ? entry.position : null;
}