import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

router.get('/branches', (req, res) => {
  const onlyActive = req.query.active !== '0';
  const rows = db
    .prepare(
      `SELECT id, name, active FROM branches
       ${onlyActive ? 'WHERE active = 1' : ''}
       ORDER BY name`
    )
    .all();
  res.json({ items: rows });
});

router.get('/branches/:id/registers', (req, res) => {
  const onlyActive = req.query.active !== '0';
  const rows = db
    .prepare(
      `SELECT id, branch_id, name, active FROM registers
       WHERE branch_id = ? ${onlyActive ? 'AND active = 1' : ''}
       ORDER BY name`
    )
    .all(Number(req.params.id));
  res.json({ items: rows });
});

router.get('/branches/:id/cashiers', (req, res) => {
  const onlyActive = req.query.active !== '0';
  const rows = db
    .prepare(
      `SELECT id, branch_id, name, active FROM cashiers
       WHERE branch_id = ? ${onlyActive ? 'AND active = 1' : ''}
       ORDER BY name`
    )
    .all(Number(req.params.id));
  res.json({ items: rows });
});

export default router;
