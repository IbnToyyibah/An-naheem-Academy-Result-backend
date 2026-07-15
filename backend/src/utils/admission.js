export const admissionPattern = /^ANA\/JSS[1-3]\/\d{3}[a-z]$/;

export function normalizeAdmissionNumber(value = '') {
  const compact = String(value).trim().replace(/\\/g, '/');
  const match = compact.match(/^ana[\s/-]*jss\s*([1-3])[\s/-]*(\d{1,3})[\s/-]*([a-z])$/i);

  if (!match) return compact.replace(/\s+/g, '');

  return `ANA/JSS${match[1]}/${match[2].padStart(3, '0')}${match[3].toLowerCase()}`;
}

export function isValidAdmissionNumber(value = '') {
  return admissionPattern.test(value);
}

export function admissionExactRegex(value = '') {
  const escaped = normalizeAdmissionNumber(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}$`, 'i');
}
