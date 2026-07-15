import mongoose from 'mongoose';
import { connectDb, Student, Session, Term } from './config/db.js';
import { calculateStudentPosition } from './utils/grading.js';

(async () => {
  try {
    await connectDb();
    const student = await Student.findOne({
      $or: [
        { first_name: { $regex: '^ATOFARATI$', $options: 'i' } },
        { last_name: { $regex: '^ATOFARATI$', $options: 'i' } }
      ]
    }).lean();
    if (!student) {
      console.log('Student not found');
      process.exit(0);
    }
    const session = await Session.findOne({ is_current: true }).lean();
    const term = await Term.findOne({}).lean(); // picks first term
    if (!session || !term) {
      console.log('Session or term not found');
      process.exit(0);
    }
    const position = await calculateStudentPosition(session.id, term.id, student.id);
    console.log(`Student ${student.first_name} ${student.last_name} (ID ${student.id}) position: ${position}`);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
})();
