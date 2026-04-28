import { Router } from 'express';
import { HRVController } from '../controller/hrvController';

const router = Router();

router.get('/hrv', async (req, res, next) => {
    try {
        const { imei, timestamp } = req.query;
        if (!imei || !timestamp) {
            // This will be caught by the catch block below and sent cleanly to the user
            throw new Error("Missing required parameters: imei and timestamp");
        }
        const result = await HRVController.getHRV(imei as string, timestamp as string);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
});

router.get('/rmssd', async (req, res, next) => {
    try {
        const { imei, timestamp } = req.query;
        if (!imei || !timestamp) {
            throw new Error("Missing required parameters: imei and timestamp");
        }
        const result = await HRVController.getRMSSD(imei as string, timestamp as string);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
});

router.get('/sdnn', async (req, res, next) => {
    try {
        const { imei, timestamp } = req.query;
        if (!imei || !timestamp) {
            throw new Error("Missing required parameters: imei and timestamp");
        }
        const result = await HRVController.getSDNN(imei as string, timestamp as string);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
});

export default router;
