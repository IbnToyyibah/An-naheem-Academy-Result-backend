import bcrypt from 'bcryptjs';
import { connectDb, Parent, Student, User, pool } from './config/db.js';

await connectDb();

const DEFAULT_PARENT_PASSWORD = '0823';
const password = await bcrypt.hash('admin', 12);
await User.updateOne(
  { email: 'admin' },
  { $set: { email: 'admin', password, role: 'admin' } },
  { upsert: true }
);

const students = await Student.find({ parent_id: { $ne: null } });
for (const student of students) {
  const parentPassword = await bcrypt.hash(DEFAULT_PARENT_PASSWORD, 12);
  await Parent.findByIdAndUpdate(student.parent_id, { password: parentPassword });
}

console.log(`Seed complete. Admin: admin / admin. Parent login: admission number / ${DEFAULT_PARENT_PASSWORD}.`);
await pool.end();
