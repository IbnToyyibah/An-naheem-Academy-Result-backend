// backend/src/scripts/update_next_term.js
import mongoose from 'mongoose';
import { Student, connectDb } from '../config/db.js';

async function run() {
  try {
    await connectDb();
    const filter = { next_term_begin: { $exists: false } };
    const update = { $set: { next_term_begin: new Date('2026-09-21T00:00:00Z') } };
    const { modifiedCount } = await Student.updateMany(filter, update);
    console.log(`🔧 Updated ${modifiedCount} student record(s) with next_term_begin.`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

run();
