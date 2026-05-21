import { Request, Response } from 'express';
import { EvaluationService } from '../service/evaluationService';
import { loginToAAASWatch } from '../service/loginToAAASWatch';

export const evaluationController = {

    // GET /api/evaluate/:imei/day
    // Runs all 4 day-level evaluators and returns the levels
    async evaluateDay(req: Request, res: Response) {
        try {
            const { imei } = req.params;
            if (!imei) return res.status(400).json({ error: "Missing required parameter: imei" });

            const skipNotification = req.query.skipNotification === 'true';
            const notificationPromises: Promise<any>[] = [];

            if (!skipNotification) {
                // Pre-warm the cache so concurrent evaluations don't trigger multiple logins
                await loginToAAASWatch(imei).catch(err => console.error("Cache pre-warm failed:", err));
            }

            const [sleepScore, sleepDuration, rhr, rmssd, sdnn, sleepHeartRate] = await Promise.all([
                EvaluationService.evaluateDayLevelSleepScore(imei, skipNotification, notificationPromises),
                EvaluationService.evaluateDayLevelSleepDuration(imei, skipNotification, notificationPromises),
                EvaluationService.evaluateDayLevelRHR(imei, skipNotification, notificationPromises),
                EvaluationService.evaluateDayLevelRMSSD(imei, skipNotification, notificationPromises),
                EvaluationService.evaluateDayLevelSDNN(imei, skipNotification, notificationPromises),
                EvaluationService.evaluateDayLevelSleepHeartRate(imei, skipNotification, notificationPromises)
            ]);

            if (notificationPromises.length > 0) {
                await Promise.allSettled(notificationPromises);
            }

            return res.status(200).json({
                imei,
                date: new Date().toISOString().split('T')[0],
                evaluation: {
                    sleepScore,
                    sleepDuration,
                    rhr,
                    rmssd,
                    sdnn,
                    sleepHeartRate
                }
            });
        } catch (error: any) {
            console.error("Error in evaluateDay:", error);
            return res.status(500).json({ error: error.message || "Internal Server Error" });
        }
    },

    // GET /api/evaluate/:imei/week
    // Accepts weekly averages as query params and returns trend levels
    // Query: ?sleepScore=80,77,74,70&sleepDuration=420,418,422,419&rhr=54,55,56,58&rmssd=30,33,36,40&sdnn=45,44,46,45
    // async evaluateWeek(req: Request, res: Response) {
    //     try {
    //         const { imei } = req.params;
    //         if (!imei) return res.status(400).json({ error: "Missing required parameter: imei" });

    //         const parseWeekly = (param: string | undefined): number[] | null => {
    //             if (!param) return null;
    //             const values = param.split(',').map(Number);
    //             if (values.some(isNaN) || values.length < 2) return null;
    //             return values;
    //         };

    //         const { sleepScore, sleepDuration, rhr, rmssd, sdnn } = req.query as Record<string, string>;

    //         const result: Record<string, any> = { imei };

    //         const scoreArr = parseWeekly(sleepScore);
    //         if (scoreArr) result.sleepScore = EvaluationService.evaluateWeekTrendSleepScore(scoreArr);

    //         const durationArr = parseWeekly(sleepDuration);
    //         if (durationArr) result.sleepDuration = EvaluationService.evaluateWeekTrendSleepDuration(durationArr);

    //         const rhrArr = parseWeekly(rhr);
    //         if (rhrArr) result.rhr = EvaluationService.evaluateWeekTrendRHR(rhrArr);

    //         const rmssdArr = parseWeekly(rmssd);
    //         if (rmssdArr) result.rmssd = EvaluationService.evaluateWeekTrendRMSSD(rmssdArr);

    //         const sdnnArr = parseWeekly(sdnn);
    //         if (sdnnArr) result.sdnn = EvaluationService.evaluateWeekTrendSDNN(sdnnArr);

    //         if (Object.keys(result).length === 1) {
    //             return res.status(400).json({ error: "Provide at least one weekly averages query param (sleepScore, sleepDuration, rhr, rmssd, sdnn)" });
    //         }

    //         return res.status(200).json(result);
    //     } catch (error: any) {
    //         console.error("Error in evaluateWeek:", error);
    //         return res.status(500).json({ error: error.message || "Internal Server Error" });
    //     }
    // }
};
