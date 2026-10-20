import { Router } from 'express';
import { db } from '../db.js';
import { questions } from '../questions.js';

const router = Router();

router.get('/questions', (_req, res) => {
  res.json(questions);
});

router.get('/catalog/branches', (_req, res) => {
  const items = db.prepare('SELECT * FROM branches WHERE active = 1 ORDER BY name').all();
  res.json({ items });
});

router.get('/catalog/registers', (req, res) => {
  const branchId = Number(req.query.branch_id);
  if (!branchId) return res.status(400).json({ error: 'branch_id requerido' });
  const items = db
    .prepare('SELECT * FROM registers WHERE branch_id = ? AND active = 1 ORDER BY name')
    .all(branchId);
  res.json({ items });
});

router.get('/catalog/cashiers', (req, res) => {
  const branchId = Number(req.query.branch_id);
  if (!branchId) return res.status(400).json({ error: 'branch_id requerido' });
  const items = db
    .prepare('SELECT * FROM cashiers WHERE branch_id = ? AND active = 1 ORDER BY name')
    .all(branchId);
  res.json({ items });
});

export default router;
