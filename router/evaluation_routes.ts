import { Router } from 'express';
import { evaluationController } from '../controller/evaluationController';

const router = Router();

// Day-level evaluation — fetches today's data + baselines internally
// GET /api/evaluate/:imei/day
router.get('/evaluate/:imei/day', (req, res) => evaluationController.evaluateDay(req, res));

// Week-level trend evaluation — pass weekly averages as comma-separated query params
// GET /api/evaluate/:imei/week?sleepScore=80,77,74,70&rhr=54,55,56,58&rmssd=30,33,36,40

export default router;
