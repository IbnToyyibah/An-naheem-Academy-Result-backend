import { Router } from 'express';
import { Class, serialize, serializeMany, Session, Subject, Term } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { logActivity } from '../utils/activity.js';

const router = Router();
router.use(authenticate, requireRole('admin'));

const models = {
  classes: Class,
  subjects: Subject,
  sessions: Session,
  terms: Term
};

function crudRoutes(table, column, label) {
  router.get(`/${table}`, async (_req, res, next) => {
    try {
      if (table === 'subjects') {
        const subjectOrder = [
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
        ];
        const subjects = await models[table].find();
        const ordered = subjectOrder
          .map((name) => subjects.find((item) => item.subject_name === name))
          .filter(Boolean);
        const remaining = subjects.filter((item) => !subjectOrder.includes(item.subject_name));
        return res.json(serializeMany([...ordered, ...remaining]));
      }

      const sort = table === 'sessions' ? { session_name: -1 } : { [column]: 1 };
      res.json(serializeMany(await models[table].find().sort(sort)));
    } catch (error) {
      next(error);
    }
  });

  router.post(`/${table}`, async (req, res, next) => {
    try {
      const value = req.body[column];
      const payload = { [column]: value };
      if (table === 'sessions') payload.is_current = Boolean(req.body.is_current);
      const result = await models[table].create(payload);
      await logActivity('Admin', `Created ${label}: ${value}`);
      res.status(201).json(serialize(result));
    } catch (error) {
      next(error);
    }
  });

  router.put(`/${table}/:id`, async (req, res, next) => {
    try {
      const value = req.body[column];
      const payload = { [column]: value };
      if (table === 'sessions') {
        payload.is_current = Boolean(req.body.is_current);
      }
      await models[table].findByIdAndUpdate(req.params.id, payload);
      await logActivity('Admin', `Updated ${label}: ${value}`);
      res.json({ message: `${label} updated` });
    } catch (error) {
      next(error);
    }
  });

  router.delete(`/${table}/:id`, async (req, res, next) => {
    try {
      await models[table].findByIdAndDelete(req.params.id);
      await logActivity('Admin', `Deleted ${label}`);
      res.json({ message: `${label} deleted` });
    } catch (error) {
      next(error);
    }
  });
}

crudRoutes('classes', 'class_name', 'class');
crudRoutes('subjects', 'subject_name', 'subject');
crudRoutes('sessions', 'session_name', 'session');
crudRoutes('terms', 'term_name', 'term');

export default router;
