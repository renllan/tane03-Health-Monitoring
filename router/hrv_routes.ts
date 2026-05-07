import { Router } from 'express';
import { HRVController } from '../controller/hrvController';

const router = Router();

router.get('/hrv/:imei/:timestamp', async (req, res, next) => {
    try {
        const { imei, timestamp } = req.params;
        const result = await HRVController.getHRV(imei as string, timestamp as string);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
});

router.get('/rmssd/:imei/:timestamp', async (req, res, next) => {
    try {
        const { imei, timestamp } = req.params;
        const result = await HRVController.getRMSSD(imei as string, timestamp as string);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
});

router.get('/sdnn/:imei/:timestamp', async (req, res, next) => {
    try {
        const { imei, timestamp } = req.params;
        const result = await HRVController.getSDNN(imei as string, timestamp as string);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
});

export default router;
