import mongoose from 'mongoose';
import { Class, Student } from '../config/db.js';

export const admissionPattern = /^ANA\/(?:JSS|SS)[1-3]\/\d{3}[a-z]$/i;

export function normalizeAdmissionNumber(value = '') {
  const compact = String(value).trim().replace(/\\/g, '/');
  const match = compact.match(/^ana[\s/-]*(jss|ss)\s*([1-3])[\s/-]*(\d{1,3})[\s/-]*([a-z])$/i);

  if (!match) return compact.replace(/\s+/g, '');

  const prefix = match[1].toUpperCase();
  return `ANA/${prefix}${match[2]}/${match[3].padStart(3, '0')}${match[4].toLowerCase()}`;
}

export function isValidAdmissionNumber(value = '') {
  return admissionPattern.test(value);
}

export function admissionExactRegex(value = '') {
  const escaped = normalizeAdmissionNumber(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}$`, 'i');
}

/**
 * Automatically generate the next available sequential admission number
 * based on the class (e.g. JSS 1 -> ANA/JSS1/001a, JSS 2 -> ANA/JSS2/027a).
 */
export async function generateNextAdmissionNumber(classIdentifier) {
  let className = '';

  if (typeof classIdentifier === 'string' && mongoose.Types.ObjectId.isValid(classIdentifier)) {
    const classDoc = await Class.findById(classIdentifier);
    className = classDoc ? classDoc.class_name : '';
  } else if (classIdentifier && (classIdentifier.class_name || classIdentifier.name)) {
    className = classIdentifier.class_name || classIdentifier.name;
  } else {
    className = String(classIdentifier || '');
  }

  // Parse class code: "JSS 1" -> "JSS1", "JSS 2" -> "JSS2", "SS 1" -> "SS1", etc.
  const classCodeMatch = className.match(/(JSS|SS)\s*([1-3])/i);
  const classCode = classCodeMatch
    ? `${classCodeMatch[1].toUpperCase()}${classCodeMatch[2]}`
    : 'JSS1';

  // Find all existing admission numbers matching this class code
  const regex = new RegExp(`^ANA\/${classCode}\/(\\d{3})([a-z])?$`, 'i');
  const students = await Student.find({ admission_number: regex }).select('admission_number');

  let maxNum = 0;
  for (const st of students) {
    const m = (st.admission_number || '').match(regex);
    if (m && m[1]) {
      const num = parseInt(m[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }

  let nextNum = maxNum + 1;
  while (true) {
    const padded = String(nextNum).padStart(3, '0');
    const letter = String.fromCharCode(97 + ((nextNum - 1) % 26));
    const candidate = `ANA/${classCode}/${padded}${letter}`;

    const exists = await Student.exists({ admission_number: candidate });
    if (!exists) {
      return candidate;
    }
    nextNum++;
  }
}
