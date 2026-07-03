// Updated auth middleware to ensure studentId is available
import jwt from 'jsonwebtoken';

const DEFAULT_JWT_SECRET = 'eiASbrKoj26i88TldlJaWlxlOEog3fXXNLfiHVjsQmy';

function inferRoleFromToken(payload) {
  if (payload?.role) return payload.role;
  if (payload?.studentId || payload?.admissionNumber) return 'parent';
  if (payload?.email) return 'admin';
  return null;
}

function normalizeUser(payload) {
  const user = { ...payload };
  user.id = user.id || user._id || undefined;
  user.role = inferRoleFromToken(user);

  if (user.role === 'parent') {
    user.studentId = user.studentId || user.student_id || undefined;
    user.admissionNumber = user.admissionNumber || user.admission_number || undefined;
  }

  if (user.role === 'admin') {
    user.email = user.email || user.emailAddress || undefined;
  }

  return user;
}

export function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET || DEFAULT_JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d'
  });
}

export function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return res.status(401).json({ message: 'Authentication token is required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || DEFAULT_JWT_SECRET);
    req.user = normalizeUser(decoded);

    if (!req.user.role) {
      return res.status(401).json({ message: 'Invalid token role' });
    }

    if (req.user.role === 'parent' && !req.user.studentId) {
      return res.status(401).json({ message: 'Parent token missing studentId' });
    }

    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ message: 'You do not have access to this resource' });
    }
    next();
  };
}
