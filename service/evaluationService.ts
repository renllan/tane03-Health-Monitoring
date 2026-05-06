import { SleepService } from "./sleepService";
import { HRVService } from "./calculateHRV";
import { calculateBaselines, Level } from "./calculateBaselines";
import { sendNotification } from "./sendNotification";
import { RHRService } from "./rhr_service";
// ─── Helpers (private) ────────────────────────────────────────────────────────

function getDateOffset(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0];
}

function evaluateDayLevel(
    current: number,
    baseline: number,
    threshold: number,
    metric: "rhr" | "other"
): Level {
    const diff = current - baseline;
    if (metric === "rhr") {
        if (diff > threshold) return "Poor";
        if (diff < -threshold) return "Good";
    } else {
        if (diff > threshold) return "Good";
        if (diff < -threshold) return "Poor";
    }
    return "Fair";
}

function evaluateWeekLevel(
    slope: number,
    threshold: number,
    metric: "rhr" | "other"
): Level {
    if (metric === "rhr") {
        if (slope > threshold) return "Poor";
        if (slope < -threshold) return "Good";
    } else {
        if (slope > threshold) return "Good";
        if (slope < -threshold) return "Poor";
    }
    return "Fair";
}

function calculateSlope(weeklyAverages: number[]): number {
    const n = weeklyAverages.length;
    if (n < 2) return 0;
    const xMean = (n - 1) / 2;
    const yMean = weeklyAverages.reduce((s, v) => s + v, 0) / n;
    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
        numerator += (i - xMean) * (weeklyAverages[i] - yMean);
        denominator += (i - xMean) ** 2;
    }
    return denominator === 0 ? 0 : numerator / denominator;
}

// ─── Evaluation Service ───────────────────────────────────────────────────────

export const EvaluationService = {

    // ── Day-Level Evaluators ──────────────────────────────────────────────────
    // Fetches today's actual value + baseline via service, then evaluates.

    /** Sleep Score: ±5 points threshold */
    async evaluateDayLevelSleepScore(imei: string): Promise<Level> {
        const today = getDateOffset(0);
        const previousSevenDays = getDateOffset(-7);
        const sleepData = await SleepService.getSleepData(imei, previousSevenDays, today);
        if (!sleepData.length) {
            return "Invalid";
        }
        const sleepScore = sleepData.reduce((acc, item) => acc + item.sleepScore, 0) / sleepData.length;  //average of last 7 days
        if (!sleepScore || sleepScore <= 0) {
            return "Invalid";
        }
        const baselineResult = await calculateBaselines.getSleepScoreBaseline(imei);
        if (baselineResult.status !== "Success" || !baselineResult.baseline) {
            return "Invalid";
        }
        const level = evaluateDayLevel(sleepScore, baselineResult.baseline, 10, "other");
        if (level === "Poor") sendNotification(imei, "Your Sleep Score dropped significantly today. Try to rest!");
        return level;
    },

    /** Sleep Duration: ±30% of baseline threshold */
    async evaluateDayLevelSleepDuration(imei: string): Promise<Level> {
        const today = getDateOffset(0);
        const previousSevenDays = getDateOffset(-7);

        const sleepData = await SleepService.getSleepData(imei, previousSevenDays, today);
        if (!sleepData.length) {
            return "Invalid";
        }
        const sleepDuration = sleepData.reduce((acc, item) => acc + item.minutes, 0) / sleepData.length; //average of last 7 days
        if (!sleepDuration || sleepDuration <= 0) {
            return "Invalid";
        }
        const baselineResult = await calculateBaselines.getSleepDurationBaseline(imei);
        if (baselineResult.status !== "Success" || !baselineResult.durationBaseline) {

            return "Invalid";
        }
        const level = evaluateDayLevel(sleepDuration, baselineResult.durationBaseline, baselineResult.durationBaseline * 0.3, "other");
        if (level === "Poor") sendNotification(imei, "Your sleep duration was unusually short. Consider an early bedtime!");
        return level;
    },

    /** RHR: ±10% of baseline threshold (higher than baseline = Poor) */
    async evaluateDayLevelRHR(imei: string): Promise<Level> {
        const today = getDateOffset(0);
        const previousSevenDays = getDateOffset(-7);

        const sleepData = await RHRService.queryRHR(imei, previousSevenDays, today);
        if (!sleepData.length) {
            return "Invalid";
        }
        const rhr = sleepData.reduce((acc, item) => acc + item.rhr, 0) / sleepData.length;  //average of last 7 days
        const current = rhr;
        if (!current || current <= 0) {
            return "Invalid";
        }
        const baselineResult = await calculateBaselines.getRHRBaseline(imei);
        if (baselineResult.status !== "Success" || !baselineResult.baseline) {
            return "Invalid";
        }
        const level = evaluateDayLevel(current, baselineResult.baseline, baselineResult.baseline * 0.3, "rhr");
        if (level === "Poor") sendNotification(imei, "Your Resting Heart Rate is elevated. Your body might be under stress or recovering.");
        return level;
    },

    /** HRV (RMSSD + SDNN): ±5% of baseline threshold */
    async evaluateDayLevelHRV(imei: string): Promise<{ RMSSDlevel: Level; SDNNlevel: Level }> {
        const today = getDateOffset(0);
        const previousSevenDays = getDateOffset(-7);

        const startISO = `${previousSevenDays}T00:00:00.000Z`;
        const endISO = `${today}T23:59:59.999Z`;

        const hrvRecords = await HRVService.calculateHRVForTimeRange(imei, startISO, endISO);

        // Separate valid RMSSD and SDNN values
        const rmssdValues = hrvRecords.map(r => r.rmssd).filter(v => v > 0);
        const sdnnValues = hrvRecords.map(r => r.sdnn).filter(v => v > 0);

        if (!rmssdValues.length && !sdnnValues.length) {
            await sendNotification(imei, "Cannot evaluate HRV today, does not have today's HRV data");
            return { RMSSDlevel: "Invalid", SDNNlevel: "Invalid" };
        }

        // Fetch both baselines in parallel
        const [RMSSDbaselineResult, SDNNbaselineResult] = await Promise.all([
            calculateBaselines.getRMSSDBaseline(imei),
            calculateBaselines.getSDNNBaseline(imei),
        ]);

        // ── RMSSD ──────────────────────────────────────────────────────────────
        let RMSSDlevel: Level = "Invalid";
        if (!rmssdValues.length) {
            RMSSDlevel = "Invalid"
        } else if (RMSSDbaselineResult.status !== "Success" || !RMSSDbaselineResult.baseline) {
            RMSSDlevel = "Invalid"
        } else {
            const currentRMSSD = rmssdValues.reduce((a, b) => a + b, 0) / rmssdValues.length;
            RMSSDlevel = evaluateDayLevel(currentRMSSD, RMSSDbaselineResult.baseline, RMSSDbaselineResult.baseline * 0.3, "other");
            if (RMSSDlevel === "Poor") sendNotification(imei, "Your HRV (RMSSD) is low today, indicating high stress or poor recovery.");
        }

        // ── SDNN ───────────────────────────────────────────────────────────────
        let SDNNlevel: Level = "Invalid";
        if (!sdnnValues.length) {
            SDNNlevel = "Invalid";
        } else if (SDNNbaselineResult.status !== "Success" || !SDNNbaselineResult.baseline) {
            SDNNlevel = "Invalid";
        } else {
            const currentSDNN = sdnnValues.reduce((a, b) => a + b, 0) / sdnnValues.length;
            SDNNlevel = evaluateDayLevel(currentSDNN, SDNNbaselineResult.baseline, SDNNbaselineResult.baseline * 0.3, "other");
            if (SDNNlevel === "Poor") sendNotification(imei, "Your HRV (SDNN) is low today, indicating high stress or poor recovery.");
        }

        return { RMSSDlevel, SDNNlevel };
    },

    async evaluateDayLevelSleepHeartRate(imei: string): Promise<Level> {
        //get the sleep heartrate baseline
        //get the sleep heartrate data
        //compare and evaluate
        console.log("evaluating sleep heart rate");
        const today = getDateOffset(0);
        const previousSevenDays = getDateOffset(-7);
        const sleepHeartRateData = await SleepService.querySleepAvgHeartRate(imei, previousSevenDays, today);
        if (!sleepHeartRateData.length) {
            return "Invalid";
        }
        const sleepHeartRate = sleepHeartRateData.reduce((acc, item) => acc + item.avgHR, 0) / sleepHeartRateData.length;  //average of last 7 days
        if (!sleepHeartRate || sleepHeartRate <= 0) {
            return "Invalid";
        }
        const baselineResult = await calculateBaselines.getSleepAvgHRBaseline(imei);
        if (baselineResult.status !== "Success" || !baselineResult.baseline) {
            return "Invalid";
        }
        const level = evaluateDayLevel(sleepHeartRate, baselineResult.baseline, baselineResult.baseline * 0.3, "rhr");
        if (level === "Poor") sendNotification(imei, "Your Average Sleep Heart Rate is elevated. Your body might be under stress or recovering.");
        return level;
    },
    // ── Week-Level Evaluators ─────────────────────────────────────────────────
    // Accepts an array of weekly averages and evaluates the trend slope.

    /** Sleep Score Trend: ±1.5 points/week */
    evaluateWeekTrendSleepScore(weeklyAverages: number[]): Level {
        return evaluateWeekLevel(calculateSlope(weeklyAverages), 1.5, "other");
    },

    /** Sleep Duration Trend: ±15 minutes/week */
    evaluateWeekTrendSleepDuration(weeklyAverages: number[]): Level {
        return evaluateWeekLevel(calculateSlope(weeklyAverages), 15, "other");
    },

    /** RHR Trend: ±1.0 bpm/week (rising slope = Poor) */
    evaluateWeekTrendRHR(weeklyAverages: number[]): Level {
        return evaluateWeekLevel(calculateSlope(weeklyAverages), 1.0, "rhr");
    },

    /** RMSSD Trend: ±3 ms/week */
    evaluateWeekTrendRMSSD(weeklyAverages: number[]): Level {
        return evaluateWeekLevel(calculateSlope(weeklyAverages), 3, "other");
    },

    /** SDNN Trend: ±3 ms/week */
    evaluateWeekTrendSDNN(weeklyAverages: number[]): Level {
        return evaluateWeekLevel(calculateSlope(weeklyAverages), 3, "other");
    },
};
