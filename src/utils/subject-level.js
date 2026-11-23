export function getClassLevel(className) {
  const match = String(className || '').trim().match(/^(JSS|SS)\s*([1-3])$/i);
  if (!match) return null;
  return match[1].toUpperCase() === 'SS' ? 'senior' : 'junior';
}

export function subjectSupportsClass(subject, className) {
  const classLevel = getClassLevel(className);
  if (!classLevel) return false;
  const levels = subject.class_levels?.length ? subject.class_levels : ['junior'];
  return levels.includes(classLevel);
}
