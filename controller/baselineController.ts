import { Request, Response } from 'express';
import { calculateBaselines } from '../service/calculateBaselines';

export const baselineController = {
    async getBaseline(req: Request, res: Response) {
        try {
            const { imei, type } = req.params;

            if (!imei || !type) {
                return res.status(400).json({ error: "Missing required parameter: imei or type" });
            }

            let result;

            switch (type.toLowerCase()) {
                case 'sleepduration':
                    result = await calculateBaselines.getSleepDurationBaseline(imei);
                    break;
                case 'sleepscore':
                    result = await calculateBaselines.getSleepScoreBaseline(imei);
                    break;
                case 'rhr':
                    result = await calculateBaselines.getRHRBaseline(imei);
                    break;
                case 'rmssd':
                    result = await calculateBaselines.getRMSSDBaseline(imei);
                    break;
                case 'sdnn':
                    result = await calculateBaselines.getSDNNBaseline(imei);
                    break;
                case 'sleepavghr':
                    result = await calculateBaselines.getSleepAvgHRBaseline(imei);
                    break;
                case 'stress':
                    result = await calculateBaselines.getStressBaseline(imei);
                    break;
                default:
                    return res.status(400).json({
                        error: `Invalid baseline type: ${type}. Valid types are sleepDuration, sleepScore, rhr, rmssd, sdnn, sleepAvgHR, stress.`
                    });
            }

            if (result?.status === "Error") {
                return res.status(422).json(result);
            }

            return res.status(200).json(result);

        } catch (error: any) {
            console.error(`Error in getBaseline:`, error);
            return res.status(500).json({ error: error.message || "Internal Server Error" });
        }
    },

    async getAllBaselines(req: Request, res: Response) {
        try {
            const { imei } = req.params;

            if (!imei) {
                return res.status(400).json({ error: "Missing required parameter: imei" });
            }

            // Preload 60-day sleep data first to populate DB cache and avoid concurrent Lambda thundering herds
            await calculateBaselines.preloadSleepData(imei);

            // Execute all baseline calculations concurrently
            const [sleepDuration, sleepScore, rhr, rmssd, sdnn, sleepAvgHR, stress] = await Promise.all([
                calculateBaselines.getSleepDurationBaseline(imei),
                calculateBaselines.getSleepScoreBaseline(imei),
                calculateBaselines.getRHRBaseline(imei),
                calculateBaselines.getRMSSDBaseline(imei),
                calculateBaselines.getSDNNBaseline(imei),
                calculateBaselines.getSleepAvgHRBaseline(imei),
                calculateBaselines.getStressBaseline(imei)
            ]);

            return res.status(200).json({
                imei,
                baselines: {
                    sleepDuration,
                    sleepScore,
                    rhr,
                    rmssd,
                    sdnn,
                    sleepAvgHR,
                    stress
                }
            });

        } catch (error: any) {
            console.error(`Error in getAllBaselines:`, error);
            return res.status(500).json({ error: error.message || "Internal Server Error" });
        }
    }
};
