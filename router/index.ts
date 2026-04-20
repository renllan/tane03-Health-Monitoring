import { Router } from 'express';
import { notificationController } from '../controller/notificationController';
import { ASSWatchLoginController } from '../controller/ASSWatchLoginController';
import hrvRoutes from './hrv_routes';

const router = Router();
router.use('/', hrvRoutes);

// Define routes
router.post('/send-notification', async (req, res) => {
  try {
    return notificationController.send(req, res);
  } catch (error) {
    console.error("Error sending notification:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
});

router.post('/login-to-AAASWatch', async (req, res) => {
  try {
    return ASSWatchLoginController.login(req, res);
  } catch (error) {
    console.error("Error logging in:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
});

// Health check route
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

export default router;
