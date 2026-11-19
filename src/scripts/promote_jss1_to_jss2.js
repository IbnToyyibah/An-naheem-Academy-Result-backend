import { connectDb, Student, Class, ActivityLog } from '../config/db.js';

async function promote() {
  try {
    await connectDb();
    console.log('Connected to MongoDB');

    const jss2Class = await Class.findOne({ class_name: 'JSS 2' });
    if (!jss2Class) {
      throw new Error('Class "JSS 2" not found in database');
    }

    const students = await Student.find({
      admission_number: { $regex: /^ANA\/JSS1\//i }
    });

    console.log(`Found ${students.length} student(s) with JSS 1 admission numbers.`);

    let updatedCount = 0;
    for (const student of students) {
      const oldAdm = student.admission_number;
      const newAdm = oldAdm.replace(/^ANA\/JSS1\//i, 'ANA/JSS2/');

      student.admission_number = newAdm;
      student.class_id = jss2Class._id;
      await student.save();

      console.log(`Updated: ${oldAdm} -> ${newAdm} (${student.first_name} ${student.last_name}) | Class -> JSS 2`);
      updatedCount++;
    }

    await ActivityLog.create({
      actor: 'Admin',
      action: `Promoted ${updatedCount} student(s) from JSS 1 to JSS 2 (updated admission numbers to ANA/JSS2/...)`
    });

    console.log(`\nSuccessfully updated ${updatedCount} student(s) to JSS 2!`);
    process.exit(0);
  } catch (error) {
    console.error('Promotion failed:', error);
    process.exit(1);
  }
}

promote();
