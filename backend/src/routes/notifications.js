import { Router } from 'express';
import { requireAuth } from '../middleware.js';
import {
  dismissNotification,
  dismissRead,
  listNotifications,
  markAllRead,
  markNotification,
} from '../notifications.js';

const router = Router();

// Cada usuario ve las de su rol y lleva su propio estado de leída / borrada.
router.use('/notifications', requireAuth());

router.get('/notifications', (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  res.json(listNotifications(req.session.user_id, { unreadOnly: req.query.unread === '1', limit }));
});

router.post('/notifications/read-all', (req, res) => {
  markAllRead(req.session.user_id);
  res.json(listNotifications(req.session.user_id));
});

router.delete('/notifications', (req, res) => {
  dismissRead(req.session.user_id);
  res.json(listNotifications(req.session.user_id));
});

function byId(action) {
  return (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || !action(req.session.user_id, id)) {
      return res.status(404).json({ error: 'La notificación ya no existe' });
    }
    res.json(listNotifications(req.session.user_id));
  };
}

router.post('/notifications/:id/read', byId((user, id) => markNotification(user, id, true)));
router.post('/notifications/:id/unread', byId((user, id) => markNotification(user, id, false)));
router.delete('/notifications/:id', byId(dismissNotification));

export default router;
