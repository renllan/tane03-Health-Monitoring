import { Router } from 'express';
import { SchedulerController } from '../controller/scheduler_controller';

const router = Router();
const schedulerController = new SchedulerController();

// Define the route to schedule an evaluation
router.post('/schedule/:imei', schedulerController.scheduleEvaluation);


export default router;
