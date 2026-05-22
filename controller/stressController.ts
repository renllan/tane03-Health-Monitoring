import { Request, Response } from 'express';
import { StressService } from '../service/stress_service';

export const stressController = {
    async getDailyStress(req: Request, res: Response) {
        try {
            const { imei } = req.params;
            if (!imei) {
                return res.status(400).json({ error: "Missing required parameter: imei" });
            }

            // Default to today in YYYY-MM-DD if date not provided
            const dateStr = (req.query.date as string) || new Date().toISOString().split('T')[0];

            console.log(`Calculating stress for imei ${imei} on date ${dateStr}`);
            const result = await StressService.calculateDailyStress(imei, dateStr);

            return res.status(200).json(result);
        } catch (error: any) {
            console.error("Error in getDailyStress:", error);
            return res.status(500).json({ error: error.message || "Internal Server Error" });
        }
    }
};
