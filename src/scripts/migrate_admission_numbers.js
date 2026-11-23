import mongoose from 'mongoose';
import { ActivityLog, Student, connectDb } from '../config/db.js';

const applyChanges = process.argv.includes('--apply');
const CLASS_PATTERN = /^(JSS|SS)\s*([1-3])$/i;
const OLD_ADMISSION_PATTERN = /^ANA\/(?:JSS|SS)[1-3]\/(\d{3,})([a-z])?$/i;

function classCode(className) {
  const match = String(className || '').trim().match(CLASS_PATTERN);
  if (!match) {
    throw new Error(`Unsupported student class "${className || '(missing)'}".`);
  }
  return `${match[1].toUpperCase()}${match[2]}`;
}

async function buildPlan() {
  const students = await Student.find()
    .select('_id admission_number class_id created_at')
    .populate('class_id', 'class_name')
    .lean();
  const groups = new Map();

  for (const student of students) {
    const code = classCode(student.class_id?.class_name);
    const oldId = String(student.admission_number || '');
    const match = oldId.match(OLD_ADMISSION_PATTERN);
    if (!match) {
      throw new Error(`Student ${student._id} has an unsupported admission number.`);
    }

    if (!groups.has(code)) groups.set(code, []);
    groups.get(code).push({
      student,
      oldNumber: Number(match[1]),
      oldSuffix: (match[2] || '').toLowerCase()
    });
  }

  const plan = [];
  for (const [code, group] of groups) {
    group.sort((left, right) =>
      left.oldNumber - right.oldNumber
      || left.oldSuffix.localeCompare(right.oldSuffix)
      || new Date(left.student.created_at || 0) - new Date(right.student.created_at || 0)
      || String(left.student._id).localeCompare(String(right.student._id))
    );

    group.forEach(({ student }, index) => {
      plan.push({
        _id: student._id,
        admission_number: `ANA/${code}/${String(index + 1).padStart(3, '0')}`
      });
    });
  }

  return { plan, classCounts: [...groups].map(([code, group]) => [code, group.length]) };
}

async function migrate() {
  await connectDb({ seed: false });
  const { plan, classCounts } = await buildPlan();
  console.log(`Admission number migration ${applyChanges ? 'apply' : 'dry run'}: ${plan.length} student(s).`);
  for (const [code, count] of classCounts) console.log(`${code}: ${count}`);

  if (!applyChanges) {
    console.log('No student IDs were changed. Rerun with --apply to migrate them.');
    return;
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (plan.length) {
        await Student.collection.bulkWrite(
          plan.map(({ _id }) => ({
            updateOne: {
              filter: { _id },
              update: { $set: { admission_number: `__ADMISSION_MIGRATION__${_id}` } }
            }
          })),
          { session }
        );

        await Student.collection.bulkWrite(
          plan.map(({ _id, admission_number }) => ({
            updateOne: {
              filter: { _id },
              update: { $set: { admission_number } }
            }
          })),
          { session }
        );
      }

      await ActivityLog.create([{
        actor: 'Admin',
        action: `Renumbered ${plan.length} student admission number(s) by class`
      }], { session });
    });
  } finally {
    await session.endSession();
  }

  console.log(`Updated ${plan.length} student admission number(s).`);
}

migrate()
  .catch((error) => {
    console.error('Admission number migration failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
