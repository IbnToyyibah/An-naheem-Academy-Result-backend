/**
 * Robust CSV parser and generator for result uploads.
 * Complies with RFC 4180 (quotes, commas, newlines within quotes, escaped quotes)
 * and supports BOM, auto-delimiter detection (comma, semicolon, tab),
 * both row-by-row and wide matrix format.
 */

/**
 * Parses raw CSV string or Buffer into array of string arrays.
 */
export function parseCsvText(rawText) {
  if (!rawText) return [];

  // Strip BOM if present
  let text = String(rawText);
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }

  // Detect delimiter by checking the first non-empty line
  const firstLine = text.split(/\r\n|\n|\r/)[0] || '';
  let delimiter = ',';
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;

  if (semiCount > commaCount && semiCount > tabCount) {
    delimiter = ';';
  } else if (tabCount > commaCount && tabCount > semiCount) {
    delimiter = '\t';
  }

  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let insideQuote = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        // Escaped quote
        currentCell += '"';
        i++;
      } else {
        // Toggle quote state
        insideQuote = !insideQuote;
      }
    } else if (char === delimiter && !insideQuote) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if ((char === '\r' || char === '\n') && !insideQuote) {
      // Handle CRLF or LF
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentCell.trim());
      currentCell = '';

      // Ignore empty trailing rows
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentCell += char;
    }
  }

  // Final cell and row if file did not end with newline
  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((cell) => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Standardize column header strings for flexible matching.
 */
export function normalizeHeaderKey(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Student header synonym mappings
 */
export const STUDENT_FIELD_SYNONYMS = {
  first_name: ['first_name', 'firstname', 'first', 'fname', 'given_name', 'first_names'],
  last_name: ['last_name', 'lastname', 'surname', 'last', 'lname', 'family_name'],
  student_name: ['student_name', 'name', 'full_name', 'studentname', 'student', 'learner_name', 'pupil_name'],
  admission_number: ['admission_number', 'admission_no', 'adm_no', 'adm_number', 'admissionno', 'reg_no', 'student_id', 'admission'],
  class_name: ['class', 'class_name', 'classname', 'grade', 'class_id', 'target_class', 'level', 'arm'],
  gender: ['gender', 'sex'],
  date_of_birth: ['date_of_birth', 'dob', 'birth_date', 'birthdate', 'dateofbirth'],
  parent_name: ['parent_name', 'parent', 'guardian_name', 'guardian', 'father_name', 'mother_name', 'parent_guardian'],
  parent_phone: ['parent_phone', 'phone', 'phone_number', 'mobile', 'parent_mobile', 'guardian_phone', 'telephone'],
  parent_email: ['parent_email', 'email', 'parent_email_address', 'guardian_email']
};

export function matchStudentField(headerKey) {
  for (const [field, synonyms] of Object.entries(STUDENT_FIELD_SYNONYMS)) {
    if (synonyms.includes(headerKey)) return field;
  }
  return null;
}

export function parseStudentRows(csvText) {
  const rows = parseCsvText(csvText);
  if (!rows.length) {
    throw new Error('CSV file is empty');
  }

  const headers = rows[0].map(normalizeHeaderKey);
  const columns = headers.map(matchStudentField);
  const hasNameFields = columns.includes('first_name') || columns.includes('last_name');
  const hasStudentName = columns.includes('student_name');

  if (!hasNameFields && !hasStudentName) {
    throw new Error('CSV must include first_name and last_name, or a student_name column');
  }

  const entries = [];
  const errors = [];

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    if (!row.some((cell) => cell.trim())) continue;

    const record = {};
    row.forEach((value, columnIndex) => {
      const field = columns[columnIndex];
      if (field) record[field] = value.trim();
    });

    let firstName = record.first_name || '';
    let lastName = record.last_name || '';
    if ((!firstName || !lastName) && record.student_name) {
      const nameParts = record.student_name.trim().split(/\s+/);
      firstName = firstName || nameParts.shift() || '';
      lastName = lastName || nameParts.join(' ');
    }

    if (!firstName || !lastName) {
      errors.push(`Row ${rowIndex + 1}: First and last names are required`);
      continue;
    }

    const gender = record.gender
      ? record.gender.charAt(0).toUpperCase() + record.gender.slice(1).toLowerCase()
      : 'Male';
    if (!['Male', 'Female'].includes(gender)) {
      errors.push(`Row ${rowIndex + 1}: Gender must be Male or Female`);
      continue;
    }

    entries.push({
      rowNumber: rowIndex + 1,
      firstName,
      lastName,
      admissionNumber: record.admission_number || '',
      className: record.class_name || '',
      gender,
      dateOfBirth: record.date_of_birth || '',
      parentName: record.parent_name || '',
      parentPhone: record.parent_phone || '',
      parentEmail: record.parent_email || ''
    });
  }

  if (!entries.length && !errors.length) {
    errors.push('CSV contains no student rows');
  }

  return { entries, errors };
}

/**
 * Header synonym mappings
 */
const FIELD_SYNONYMS = {
  admission_number: [
    'admission_number', 'admission_no', 'adm_no', 'adm_number', 'admissionno',
    'student_id', 'admission', 'reg_no', 'registration_number', 'student_admission_number'
  ],
  student_name: [
    'student_name', 'name', 'full_name', 'student', 'studentname'
  ],
  subject: [
    'subject', 'subject_name', 'course', 'course_name', 'subjectname'
  ],
  first_ca: [
    'first_ca', '1st_ca', 'ca1', 'ca_1', 'firstca', '1stca', 'test_1', 'assessment_1',
    'first_continuous_assessment', 'first_ca_20', '1st_ca_20'
  ],
  second_ca: [
    'second_ca', '2nd_ca', 'ca2', 'ca_2', 'secondca', '2ndca', 'test_2', 'assessment_2',
    'second_continuous_assessment', 'second_ca_20', '2nd_ca_20'
  ],
  exam: [
    'exam', 'examination', 'exam_score', 'exams', 'exam_60', 'examination_60', 'final_exam'
  ],
  attendance: [
    'attendance', 'attendance_score', 'attendance_days', 'days_present', 'present'
  ],
  principal_remark: [
    'principal_remark', 'principal_remarks', 'remark', 'remarks', 'comment',
    'principal_comment', 'comments', 'teacher_remark'
  ],
  session: [
    'session', 'session_name', 'academic_session'
  ],
  term: [
    'term', 'term_name', 'academic_term'
  ]
};

function matchKnownField(headerKey) {
  for (const [field, synonyms] of Object.entries(FIELD_SYNONYMS)) {
    if (synonyms.includes(headerKey)) return field;
  }
  return null;
}

/**
 * Parse rows into structured result objects.
 * Supports both row-by-row format and wide table format.
 */
export function parseResultsFromCsv(csvText, fallbackMeta = {}) {
  const rows = parseCsvText(csvText);
  if (!rows.length) {
    throw new Error('CSV file is empty');
  }

  const rawHeaders = rows[0];
  const headerKeys = rawHeaders.map(normalizeHeaderKey);

  // Map column index to recognized field
  const columnIndexToField = {};
  headerKeys.forEach((key, index) => {
    const matched = matchKnownField(key);
    if (matched) {
      columnIndexToField[index] = matched;
    }
  });

  // Check if this is a standard row-by-row format (contains a 'subject' column)
  const hasSubjectCol = Object.values(columnIndexToField).includes('subject');

  const parsedEntries = [];
  const errors = [];

  if (hasSubjectCol) {
    // -------------------------------------------------------------
    // ROW-BY-ROW FORMAT
    // Each row represents a score for one student and one subject
    // -------------------------------------------------------------
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const rowNum = r + 1; // 1-indexed for user display

      // skip empty rows
      if (!row || !row.some((cell) => String(cell).trim().length > 0)) continue;

      const record = {
        rowNumber: rowNum,
        sessionId: fallbackMeta.sessionId || null,
        termId: fallbackMeta.termId || null,
        sessionName: fallbackMeta.sessionName || null,
        termName: fallbackMeta.termName || null
      };

      row.forEach((cellValue, colIndex) => {
        const field = columnIndexToField[colIndex];
        if (field) {
          record[field] = cellValue.trim();
        }
      });

      if (!record.admission_number) {
        errors.push(`Row ${rowNum}: Missing admission number`);
        continue;
      }
      if (!record.subject) {
        errors.push(`Row ${rowNum}: Missing subject for student ${record.admission_number}`);
        continue;
      }

      parsedEntries.push({
        rowNumber: rowNum,
        admissionNumber: record.admission_number,
        studentName: record.student_name || '',
        subject: record.subject,
        firstCa: record.first_ca !== undefined && record.first_ca !== '' ? Number(record.first_ca) : 0,
        secondCa: record.second_ca !== undefined && record.second_ca !== '' ? Number(record.second_ca) : 0,
        exam: record.exam !== undefined && record.exam !== '' ? Number(record.exam) : 0,
        attendance: record.attendance !== undefined && record.attendance !== '' ? Number(record.attendance) : null,
        principalRemark: record.principal_remark || null,
        session: record.session || record.sessionName || null,
        term: record.term || record.termName || null
      });
    }
  } else {
    // -------------------------------------------------------------
    // WIDE FORMAT (Multiple subjects per student row)
    // Headers might look like: Mathematics_1stCA, Mathematics_Exam, etc.
    // -------------------------------------------------------------
    const subjectColumnRegex = /^(.+?)_(?:1st_?ca|first_?ca|ca_?1|2nd_?ca|second_?ca|ca_?2|exam|examination)$/i;
    const wideSubjectColumns = [];

    headerKeys.forEach((key, index) => {
      const match = key.match(subjectColumnRegex);
      if (match) {
        const rawSubject = match[1].replace(/_/g, ' ').trim();
        let scoreType = 'exam';
        if (/1st|first|ca_?1/i.test(key)) scoreType = 'first_ca';
        else if (/2nd|second|ca_?2/i.test(key)) scoreType = 'second_ca';

        wideSubjectColumns.push({
          index,
          subjectName: rawSubject,
          scoreType
        });
      }
    });

    if (!wideSubjectColumns.length) {
      throw new Error(
        'Could not detect "subject" column in CSV. Expected headers: admission_number, subject, first_ca, second_ca, exam'
      );
    }

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const rowNum = r + 1;
      if (!row || !row.some((cell) => String(cell).trim().length > 0)) continue;

      let admissionNumber = '';
      let studentName = '';
      let attendance = null;
      let principalRemark = null;

      row.forEach((cellValue, colIndex) => {
        const field = columnIndexToField[colIndex];
        if (field === 'admission_number') admissionNumber = cellValue.trim();
        if (field === 'student_name') studentName = cellValue.trim();
        if (field === 'attendance' && cellValue.trim() !== '') attendance = Number(cellValue.trim());
        if (field === 'principal_remark') principalRemark = cellValue.trim();
      });

      if (!admissionNumber) {
        errors.push(`Row ${rowNum}: Missing admission number`);
        continue;
      }

      // Group wide subject columns for this student
      const subjectMap = {};
      wideSubjectColumns.forEach((col) => {
        const val = row[col.index];
        if (val !== undefined && val !== '') {
          if (!subjectMap[col.subjectName]) {
            subjectMap[col.subjectName] = { firstCa: 0, secondCa: 0, exam: 0 };
          }
          if (col.scoreType === 'first_ca') subjectMap[col.subjectName].firstCa = Number(val);
          if (col.scoreType === 'second_ca') subjectMap[col.subjectName].secondCa = Number(val);
          if (col.scoreType === 'exam') subjectMap[col.subjectName].exam = Number(val);
        }
      });

      for (const [subjectName, scores] of Object.entries(subjectMap)) {
        parsedEntries.push({
          rowNumber: rowNum,
          admissionNumber,
          studentName,
          subject: subjectName,
          firstCa: scores.firstCa,
          secondCa: scores.secondCa,
          exam: scores.exam,
          attendance,
          principalRemark,
          session: fallbackMeta.sessionName || null,
          term: fallbackMeta.termName || null
        });
      }
    }
  }

  return { entries: parsedEntries, errors };
}

/**
 * Escapes a cell value for standard CSV output.
 */
function escapeCsvCell(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates CSV string for template download.
 */
export function generateCsvTemplate({ students = [], subjects = [], includeStudents = true, sessionName = '', termName = '' }) {
  const headers = [
    'admission_number',
    'student_name',
    'class',
    'subject',
    'first_ca',
    'second_ca',
    'exam',
    'attendance',
    'principal_remark'
  ];

  const lines = [headers.join(',')];

  if (includeStudents && students.length && subjects.length) {
    // Generate pre-populated rows for all students and subjects
    students.forEach((student) => {
      const adm = student.admission_number;
      const name = `${student.first_name || ''} ${student.last_name || ''}`.trim();
      const className = student.class_id?.class_name || student.class_name || '';

      subjects.forEach((subject) => {
        const subName = subject.subject_name;
        lines.push([
          escapeCsvCell(adm),
          escapeCsvCell(name),
          escapeCsvCell(className),
          escapeCsvCell(subName),
          '', // first_ca (empty ready to fill)
          '', // second_ca (empty ready to fill)
          '', // exam (empty ready to fill)
          '', // attendance
          ''  // principal_remark
        ].join(','));
      });
    });
  } else {
    // Provide sample rows
    lines.push([
      'ANA/JSS1/001a',
      'Bashar Muhd',
      'JSS 1',
      'Mathematics',
      '18',
      '17',
      '50',
      '95',
      'Outstanding academic performance'
    ].map(escapeCsvCell).join(','));

    lines.push([
      'ANA/JSS1/001a',
      'Bashar Muhd',
      'JSS 1',
      'English Language',
      '16',
      '15',
      '48',
      '95',
      'Outstanding academic performance'
    ].map(escapeCsvCell).join(','));

    lines.push([
      'ANA/JSS1/002b',
      'Yusuf Abdullahi',
      'JSS 1',
      'Mathematics',
      '14',
      '15',
      '42',
      '88',
      'Good effort, keep it up'
    ].map(escapeCsvCell).join(','));
  }

  return lines.join('\r\n');
}

/**
 * Parse student CSV rows into structured student records.
 * Supports flexible column naming, auto-splitting single "student_name",
 * and optional integrated subject score columns.
 */
export function parseStudentsFromCsv(rawText, fallbackMeta = {}) {
  const rows = parseCsvText(rawText);
  if (!rows.length) {
    throw new Error('The CSV file is empty');
  }

  const rawHeaders = rows[0];
  const headerKeys = rawHeaders.map(normalizeHeaderKey);

  const colToField = {};
  headerKeys.forEach((key, index) => {
    const matched = matchStudentField(key);
    if (matched) colToField[index] = matched;
  });

  // Check if any score columns are present (either row-by-row or wide)
  const scoreColIndices = {};
  headerKeys.forEach((key, index) => {
    const matchedScore = matchKnownField(key);
    if (matchedScore) scoreColIndices[index] = matchedScore;
  });

  const subjectColRegex = /^(.+?)_(?:1st_?ca|first_?ca|ca_?1|2nd_?ca|second_?ca|ca_?2|exam|examination)$/i;
  const wideScoreCols = [];
  headerKeys.forEach((key, index) => {
    const match = key.match(subjectColRegex);
    if (match) {
      const subjectName = match[1].replace(/_/g, ' ').trim();
      let scoreType = 'exam';
      if (/1st|first|ca_?1/i.test(key)) scoreType = 'first_ca';
      else if (/2nd|second|ca_?2/i.test(key)) scoreType = 'second_ca';
      wideScoreCols.push({ index, subjectName, scoreType });
    }
  });

  const students = [];
  const errors = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const rowNum = r + 1;
    if (!row || !row.some((cell) => String(cell).trim().length > 0)) continue;

    const record = {};
    row.forEach((cell, idx) => {
      const f = colToField[idx];
      if (f) record[f] = cell.trim();
    });

    let firstName = record.first_name || '';
    let lastName = record.last_name || '';

    if (!firstName && !lastName && record.student_name) {
      const parts = record.student_name.trim().split(/\s+/);
      firstName = parts[0] || '';
      lastName = parts.slice(1).join(' ') || parts[0] || '';
    }

    if (!firstName && !lastName) {
      errors.push(`Row ${rowNum}: Missing student name`);
      continue;
    }

    let gender = 'Male';
    const rawGender = String(record.gender || '').trim().toLowerCase();
    if (rawGender.startsWith('f') || rawGender === 'girl' || rawGender === 'woman') {
      gender = 'Female';
    } else if (rawGender.startsWith('m') || rawGender === 'boy' || rawGender === 'man') {
      gender = 'Male';
    }

    const className = record.class_name || fallbackMeta.className || '';
    const admissionNumber = record.admission_number || '';

    // Collect optional scores if present on this row
    const scores = [];
    if (wideScoreCols.length > 0) {
      const subMap = {};
      wideScoreCols.forEach((col) => {
        const val = row[col.index];
        if (val !== undefined && val !== '') {
          if (!subMap[col.subjectName]) subMap[col.subjectName] = { firstCa: 0, secondCa: 0, exam: 0 };
          if (col.scoreType === 'first_ca') subMap[col.subjectName].firstCa = Number(val);
          if (col.scoreType === 'second_ca') subMap[col.subjectName].secondCa = Number(val);
          if (col.scoreType === 'exam') subMap[col.subjectName].exam = Number(val);
        }
      });
      for (const [sub, sc] of Object.entries(subMap)) {
        scores.push({ subject: sub, ...sc });
      }
    } else {
      let subject = '';
      let firstCa = 0;
      let secondCa = 0;
      let exam = 0;
      row.forEach((cell, idx) => {
        const sf = scoreColIndices[idx];
        if (sf === 'subject') subject = cell.trim();
        if (sf === 'first_ca' && cell.trim() !== '') firstCa = Number(cell.trim());
        if (sf === 'second_ca' && cell.trim() !== '') secondCa = Number(cell.trim());
        if (sf === 'exam' && cell.trim() !== '') exam = Number(cell.trim());
      });
      if (subject) {
        scores.push({ subject, firstCa, secondCa, exam });
      }
    }

    students.push({
      rowNumber: rowNum,
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`.trim(),
      className,
      gender,
      admissionNumber,
      dateOfBirth: record.date_of_birth || null,
      parentName: record.parent_name || '',
      parentPhone: record.parent_phone || '',
      parentEmail: record.parent_email || '',
      scores
    });
  }

  return { students, errors };
}

/**
 * Generates sample CSV template string for student bulk upload.
 */
export function generateStudentCsvTemplate({ classes = [], includeSamples = true }) {
  const headers = [
    'first_name',
    'last_name',
    'class',
    'gender',
    'admission_number',
    'parent_phone',
    'parent_email'
  ];

  const lines = [headers.join(',')];

  if (includeSamples) {
    const class1 = classes[0]?.class_name || 'JSS 1';
    const class2 = classes[1]?.class_name || 'JSS 2';

    lines.push([
      'Muhd Bashar',
      'Atofarati',
      class1,
      'Male',
      'ANA/JSS1/001a',
      '08012345678',
      'parent1@example.com'
    ].map(escapeCsvCell).join(','));

    lines.push([
      'Yusuf',
      'Abdullahi',
      class1,
      'Male',
      'ANA/JSS1/002b',
      '08023456789',
      'parent2@example.com'
    ].map(escapeCsvCell).join(','));

    lines.push([
      'Fatima',
      'Ibrahim',
      class1,
      'Female',
      '', // Leave empty to auto-generate sequential number!
      '08034567890',
      'parent3@example.com'
    ].map(escapeCsvCell).join(','));

    lines.push([
      'Maryam',
      'Aliyu',
      class2,
      'Female',
      '', // Auto-generate for class 2
      '08045678901',
      'parent4@example.com'
    ].map(escapeCsvCell).join(','));
  }

  return lines.join('\r\n');
}
