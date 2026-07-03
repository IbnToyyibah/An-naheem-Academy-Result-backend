import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { ActivityLog, Class, Parent, Result, serializeMany, Session, Student, Subject } from '../config/db.js';

const router = Router();
router.use(authenticate, requireRole('admin'));

router.get('/dashboard', async (_req, res, next) => {
  try {
    const [students, parents, subjects, classes, results, session, activities] = await Promise.all([
      Student.countDocuments(),
      Parent.countDocuments(),
      Subject.countDocuments(),
      Class.countDocuments(),
      Result.countDocuments(),
      Session.findOne({ is_current: true }),
      ActivityLog.find().sort({ created_at: -1 }).limit(8)
    ]);

    res.json({
      totals: {
        students,
        parents,
        subjects,
        classes,
        uploadedResults: results
      },
      currentSession: session?.session_name || null,
      recentActivities: serializeMany(activities)
    });
  } catch (error) {
    next(error);
  }
});

export default router;
