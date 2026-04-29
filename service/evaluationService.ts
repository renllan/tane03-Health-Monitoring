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
        const sleepData = await SleepService.getSleepData(imei, today, today);
        if (!sleepData.length) {
            await sendNotification(imei, "Cannot evaluate Sleep Score today, does not have today's sleep data");
            return "Invalid";
        }
        const current = sleepData[0]?.sleepScore;
        if (!current || current <= 0) {
            await sendNotification(imei, "Cannot evaluate Sleep Score today, sleep score data is missing or invalid");
            return "Invalid";
        }
        const baselineResult = await calculateBaselines.getSleepScoreBaseline(imei);
        if (baselineResult.status !== "Success" || !baselineResult.baseline) {
            await sendNotification(imei, "Cannot evaluate Sleep Score today, not enough data to calculate baseline");
            return "Invalid";
        }
        const level = evaluateDayLevel(current, baselineResult.baseline, 5, "other");
        if (level === "Poor") await sendNotification(imei, "Your Sleep Score dropped significantly today. Try to rest!");
        if (level === "Good") await sendNotification(imei, "Your Sleep Score was excellent. Keep it up!");
        return level;
    },

    /** Sleep Duration: ±30% of baseline threshold */
    async evaluateDayLevelSleepDuration(imei: string): Promise<Level> {
        const today = getDateOffset(0);
        const sleepData = await SleepService.getSleepData(imei, today, today);
        if (!sleepData.length) {
            await sendNotification(imei, "Cannot evaluate Sleep Duration today, does not have today's sleep data");
            return "Invalid";
        }
        const current = sleepData[0]?.minutes;
        if (!current || current <= 0) {
            await sendNotification(imei, "Cannot evaluate Sleep Duration today, sleep duration data is missing or invalid");
            return "Invalid";
        }
        const baselineResult = await calculateBaselines.getSleepDurationBaseline(imei);
        if (baselineResult.status !== "Success" || !baselineResult.durationBaseline) {
            await sendNotification(imei, "Cannot evaluate Sleep Duration today, not enough data to calculate baseline");
            return "Invalid";
        }
        const level = evaluateDayLevel(current, baselineResult.durationBaseline, baselineResult.durationBaseline * 0.3, "other");
        if (level === "Poor") await sendNotification(imei, "Your sleep duration was unusually short. Consider an early bedtime!");
        if (level === "Good") await sendNotification(imei, "Your sleep duration was excellent. Keep it up!");
        return level;
    },

    /** RHR: ±10% of baseline threshold (higher than baseline = Poor) */
    async evaluateDayLevelRHR(imei: string): Promise<Level> {
        const today = getDateOffset(0);
        const sleepData = await RHRService.queryRHR(imei, today, today);
        if (!sleepData.length) {
            await sendNotification(imei, "Cannot evaluate RHR today, does not have today's RHR data");
            return "Invalid";
        }
        const current = sleepData[0]?.rhr;
        if (!current || current <= 0) {
            await sendNotification(imei, "Cannot evaluate RHR today, RHR data is missing or invalid");
            return "Invalid";
        }
        const baselineResult = await calculateBaselines.getRHRBaseline(imei);
        if (baselineResult.status !== "Success" || !baselineResult.baseline) {
            await sendNotification(imei, "Cannot evaluate RHR today, not enough data to calculate baseline");
            return "Invalid";
        }
        const level = evaluateDayLevel(current, baselineResult.baseline, baselineResult.baseline * 0.10, "rhr");
        if (level === "Poor") await sendNotification(imei, "Your Resting Heart Rate is elevated. Your body might be under stress or recovering.");
        if (level === "Good") await sendNotification(imei, "Your Resting Heart Rate is excellent");
        return level;
    },

    /** HRV (RMSSD + SDNN): ±5% of baseline threshold */
    async evaluateDayLevelHRV(imei: string): Promise<{ RMSSDlevel: Level; SDNNlevel: Level }> {
        const today = getDateOffset(0);
        const startISO = `${today}T00:00:00.000Z`;
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
            await sendNotification(imei, "Cannot evaluate RMSSD today, does not have today's RMSSD data");
        } else if (RMSSDbaselineResult.status !== "Success" || !RMSSDbaselineResult.baseline) {
            await sendNotification(imei, "Cannot evaluate RMSSD today, not enough data to calculate baseline");
        } else {
            const currentRMSSD = rmssdValues.reduce((a, b) => a + b, 0) / rmssdValues.length;
            RMSSDlevel = evaluateDayLevel(currentRMSSD, RMSSDbaselineResult.baseline, RMSSDbaselineResult.baseline * 0.05, "other");
            if (RMSSDlevel === "Poor") await sendNotification(imei, "Your HRV (RMSSD) is low today, indicating high stress or poor recovery.");
            if (RMSSDlevel === "Good") await sendNotification(imei, "Your HRV (RMSSD) is excellent today. Great recovery!");
        }

        // ── SDNN ───────────────────────────────────────────────────────────────
        let SDNNlevel: Level = "Invalid";
        if (!sdnnValues.length) {
            await sendNotification(imei, "Cannot evaluate SDNN today, does not have today's SDNN data");
        } else if (SDNNbaselineResult.status !== "Success" || !SDNNbaselineResult.baseline) {
            await sendNotification(imei, "Cannot evaluate SDNN today, not enough data to calculate baseline");
        } else {
            const currentSDNN = sdnnValues.reduce((a, b) => a + b, 0) / sdnnValues.length;
            SDNNlevel = evaluateDayLevel(currentSDNN, SDNNbaselineResult.baseline, SDNNbaselineResult.baseline * 0.05, "other");
            if (SDNNlevel === "Poor") await sendNotification(imei, "Your HRV (SDNN) is low today, indicating high stress or poor recovery.");
            if (SDNNlevel === "Good") await sendNotification(imei, "Your HRV (SDNN) is excellent today. Great recovery!");
        }

        return { RMSSDlevel, SDNNlevel };
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
