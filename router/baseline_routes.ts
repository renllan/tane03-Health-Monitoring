import { Router } from 'express';
import { baselineController } from '../controller/baselineController';

const router = Router();

// Endpoint to get all baselines for a specific device
router.get('/baselines/:imei', (req, res) => { baselineController.getAllBaselines(req, res) });

// Endpoint to get a specific baseline (e.g. /baselines/12345/rhr)
router.get('/baselines/:imei/:type', (req, res) => { baselineController.getBaseline(req, res) });

export default router;
