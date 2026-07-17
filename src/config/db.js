import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/annaheem_academy_result';
let connectionError = null;

mongoose.set('bufferCommands', false);

const options = {
  serverSelectionTimeoutMS: 8000,
  socketTimeoutMS: 20000
};

const lookupOptions = {
  timestamps: { createdAt: 'created_at', updatedAt: false },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
};

function idVirtual(schema) {
  schema.virtual('id').get(function getId() {
    return this._id.toString();
  });
}

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin'], default: 'admin' }
}, lookupOptions);
idVirtual(userSchema);

const classSchema = new mongoose.Schema({
  class_name: { type: String, required: true, unique: true, trim: true }
}, lookupOptions);
idVirtual(classSchema);

const parentSchema = new mongoose.Schema({
  name: { type: String, default: '', trim: true },
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  password: { type: String, required: true }
}, lookupOptions);
idVirtual(parentSchema);

const studentSchema = new mongoose.Schema({
  admission_number: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    match: [/^ANA\/JSS[1-3]\/\d{3}[a-z]$/, 'Admission number must look like ANA/JSS1/001a']
  },
  first_name: { type: String, required: true, trim: true },
  last_name: { type: String, required: true, trim: true },
  gender: { type: String, enum: ['Male', 'Female'], required: true },
  date_of_birth: { type: Date, default: null },
  class_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  parent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Parent' },
  passport_path: { type: String, default: null },
  /**
   * Date the next academic term begins for this student.
   * Default: 21 September 2026 (UTC).
   */
  next_term_begin: { type: Date, default: new Date('2026-09-21T00:00:00Z') }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});
idVirtual(studentSchema);

const subjectSchema = new mongoose.Schema({
  subject_name: { type: String, required: true, unique: true, trim: true }
}, lookupOptions);
idVirtual(subjectSchema);

const sessionSchema = new mongoose.Schema({
  session_name: { type: String, required: true, unique: true, trim: true },
  is_current: { type: Boolean, default: false }
}, lookupOptions);
idVirtual(sessionSchema);

const termSchema = new mongoose.Schema({
  term_name: { type: String, required: true, unique: true, trim: true }
}, lookupOptions);
idVirtual(termSchema);

const resultSchema = new mongoose.Schema({
  student_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  subject_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  session_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
  term_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Term', required: true },
  first_ca: { type: Number, default: 0 },
  second_ca: { type: Number, default: 0 },
  exam: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  grade: { type: String, required: true },
  remark: { type: String, required: true },
  attendance: { type: Number, default: null },
  principal_remark: { type: String, default: null }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});
resultSchema.index({ student_id: 1, subject_id: 1, session_id: 1, term_id: 1 }, { unique: true });
idVirtual(resultSchema);

const activityLogSchema = new mongoose.Schema({
  actor: { type: String, required: true },
  action: { type: String, required: true }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: false },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});
idVirtual(activityLogSchema);

export const User = mongoose.model('User', userSchema);
export const Class = mongoose.model('Class', classSchema);
export const Parent = mongoose.model('Parent', parentSchema);
export const Student = mongoose.model('Student', studentSchema);
export const Subject = mongoose.model('Subject', subjectSchema);
export const Session = mongoose.model('Session', sessionSchema);
export const Term = mongoose.model('Term', termSchema);
export const Result = mongoose.model('Result', resultSchema);
export const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

export function serialize(doc) {
  if (!doc) return null;
  const value = typeof doc.toObject === 'function' ? doc.toObject({ virtuals: true }) : doc;
  const { _id, __v, ...rest } = value;
  return { ...rest, id: value.id || _id?.toString() };
}

export function serializeMany(docs) {
  return docs.map(serialize);
}

export async function seedLookups() {
  await Promise.all([
    ...['JSS 1', 'JSS 2', 'JSS 3'].map((class_name) =>
      Class.updateOne({ class_name }, { $setOnInsert: { class_name } }, { upsert: true })
    ),
    ...[
      'Mathematics',
      'English Language',
      'Intermediate Science',
      'Social and Citizenship Education',
      'Islamic Religious Studies',
      'Business Studies',
      'Agricultural Science',
      'Digital Technology',
      'Physical and Health Education',
      'Home Economics',
      'Arabic Language'
    ].map((subject_name) =>
      Subject.updateOne({ subject_name }, { $setOnInsert: { subject_name } }, { upsert: true })
    ),
    Session.updateOne(
      { session_name: '2025/2026' },
      { $setOnInsert: { session_name: '2025/2026' }, $set: { is_current: true } },
      { upsert: true }
    ),
    Session.updateOne(
      { session_name: '2026/2027' },
      { $setOnInsert: { session_name: '2026/2027', is_current: false } },
      { upsert: true }
    ),
    ...['First Term', 'Second Term', 'Third Term'].map((term_name) =>
      Term.updateOne({ term_name }, { $setOnInsert: { term_name } }, { upsert: true })
    )
  ]);

  const adminPassword = await bcrypt.hash('admin123', 12);
  await User.updateOne(
    { email: 'admin' },
    { $set: { email: 'admin', password: adminPassword, role: 'admin' } },
    { upsert: true }
  );
}

export async function connectDb() {
  try {
    connectionError = null;
    await mongoose.connect(mongoUri, options);
    await seedLookups();
    console.log(`MongoDB connected: ${mongoose.connection.name}`);
  } catch (error) {
    connectionError = error;
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect().catch(() => { });
    }
    throw new Error(
      `MongoDB connection failed. Set MONGODB_URI in backend/.env or start local MongoDB. ${error.message}`
    );
  }
}

export function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

export function getDbConnectionError() {
  return connectionError;
}

export const pool = {
  async end() {
    await mongoose.connection.close();
  }
};
