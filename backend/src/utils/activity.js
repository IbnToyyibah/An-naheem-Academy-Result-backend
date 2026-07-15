import { ActivityLog } from '../config/db.js';

export async function logActivity(actor, action) {
  await ActivityLog.create({ actor, action });
}
