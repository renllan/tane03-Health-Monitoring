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
    async evaluateDayLevelSleepScore(imei: string, skipNotification = false, promises: Promise<any>[] = []): Promise<{ level: Level; value: number | null }> {
        console.log("evaluate Day Level SleepScore");
        const today = getDateOffset(0);
        const previousSevenDays = getDateOffset(-7);
        const sleepData = await SleepService.getSleepData(imei, previousSevenDays, today);
        if (!sleepData.length) return { level: "Invalid", value: null };
        const sleepScore = sleepData.reduce((acc, item) => acc + (item.sleepScore ?? 0), 0) / sleepData.length;
        if (!sleepScore || sleepScore <= 0) return { level: "Invalid", value: null };
        const baselineResult = await calculateBaselines.getSleepScoreBaseline(imei);
        if (baselineResult.status !== "Success" || !baselineResult.baseline) return { level: "Invalid", value: null };
        const level = evaluateDayLevel(sleepScore, baselineResult.baseline, 10, "other");
        if (!skipNotification) promises.push(sendNotification(imei, "TESTING: Your Sleep Score dropped significantly today. Try to rest!"));
        return { level, value: sleepScore };
    },

    /** Sleep Duration: ±30% of baseline threshold */
    async evaluateDayLevelSleepDuration(imei: string, skipNotification = false, promises: Promise<any>[] = []): Promise<{ level: Level; value: number | null }> {
        console.log("evaluate Day Level sleep Duration");
        const today = getDateOffset(0);
        const previousSevenDays = getDateOffset(-7);
        const sleepData = await SleepService.getSleepData(imei, previousSevenDays, today);
        if (!sleepData.length) return { level: "Invalid", value: null };
        const sleepDuration = sleepData.reduce((acc, item) => acc + (item.minutes ?? 0), 0) / sleepData.length;
        if (!sleepDuration || sleepDuration <= 0) return { level: "Invalid", value: null };
        const baselineResult = await calculateBaselines.getSleepDurationBaseline(imei);
        if (baselineResult.status !== "Success" || !baselineResult.durationBaseline) return { level: "Invalid", value: null };
        const level = evaluateDayLevel(sleepDuration, baselineResult.durationBaseline, baselineResult.durationBaseline * 0.3, "other");
        if (!skipNotification) promises.push(sendNotification(imei, "TESTING: Your sleep duration was unusually short. Consider an early bedtime!"));
        return { level, value: sleepDuration };
    },

    /** RHR: ±10% of baseline threshold (higher than baseline = Poor) */
    async evaluateDayLevelRHR(imei: string, skipNotification = false, promises: Promise<any>[] = []): Promise<{ level: Level; value: number | null }> {
        console.log("evaluate Day Level RHR");
        const today = getDateOffset(0);
        const previousSevenDays = getDateOffset(-7);
        const sleepData = await RHRService.queryRHR(imei, previousSevenDays, today);
        if (!sleepData.length) return { level: "Invalid", value: null };
        const current = sleepData.reduce((acc, item) => acc + (item.rhr ?? 0), 0) / sleepData.length;
        if (!current || current <= 0) return { level: "Invalid", value: null };
        const baselineResult = await calculateBaselines.getRHRBaseline(imei);
        if (baselineResult.status !== "Success" || !baselineResult.baseline) return { level: "Invalid", value: null };
        const level = evaluateDayLevel(current, baselineResult.baseline, baselineResult.baseline * 0.3, "rhr");
        if (!skipNotification) promises.push(sendNotification(imei, "TESTING: Your Resting Heart Rate is elevated. Your body might be under stress or recovering."));
        return { level, value: current };
    },

    /** HRV RMSSD: ±30% of baseline threshold */
    async evaluateDayLevelRMSSD(imei: string, skipNotification = false, promises: Promise<any>[] = []): Promise<{ metric: "RMSSD"; level: Level; value: number | null }> {
        console.log("evaluate Day Level RMSSD");
        const today = getDateOffset(0);
        const hrvRecords = await HRVService.calculateRMSSD(imei, today);
        const rmssdValues = hrvRecords?.values.map(v => v.value);
        if (!rmssdValues?.length) {
            return { metric: "RMSSD", level: "Invalid", value: null };
        }

        const baselineResult = await calculateBaselines.getRMSSDBaseline(imei);
        if (baselineResult.status !== "Success" || !baselineResult.baseline) {
            return { metric: "RMSSD", level: "Invalid", value: null };
        }

        const currentRMSSD = rmssdValues.reduce((a, b) => a + b, 0) / rmssdValues.length;
        const level = evaluateDayLevel(currentRMSSD, baselineResult.baseline, baselineResult.baseline * 0.3, "other");
        if (!skipNotification) promises.push(sendNotification(imei, "TESTING: Your HRV (RMSSD) is low today, indicating high stress or poor recovery."));
        return { metric: "RMSSD", level, value: currentRMSSD };
    },

    /** HRV SDNN: ±30% of baseline threshold */
    async evaluateDayLevelSDNN(imei: string, skipNotification = false, promises: Promise<any>[] = []): Promise<{ metric: "SDNN"; level: Level; value: number | null }> {
        console.log("evaluate Day Level SDNN");
        const today = getDateOffset(0);
        const hrvRecords = await HRVService.calculateSDNN(imei, today);
        const sdnnValues = hrvRecords?.values.map(v => v.value);

        if (!sdnnValues?.length) {
            return { metric: "SDNN", level: "Invalid", value: null };
        }

        const baselineResult = await calculateBaselines.getSDNNBaseline(imei);
        if (baselineResult.status !== "Success" || !baselineResult.baseline) {
            return { metric: "SDNN", level: "Invalid", value: null };
        }

        const currentSDNN = sdnnValues.reduce((a, b) => a + b, 0) / sdnnValues.length;
        const level = evaluateDayLevel(currentSDNN, baselineResult.baseline, baselineResult.baseline * 0.3, "other");
        if (!skipNotification) promises.push(sendNotification(imei, "TESTING: Your HRV (SDNN) is low today, indicating high stress or poor recovery."));
        return { metric: "SDNN", level, value: currentSDNN };
    },

    /** Sleep Avg HR: ±30% of baseline threshold (higher than baseline = Poor) */
    async evaluateDayLevelSleepHeartRate(imei: string, skipNotification = false, promises: Promise<any>[] = []): Promise<{ level: Level; value: number | null }> {
        console.log("evaluating sleep heart rate");
        const today = getDateOffset(0);
        const previousSevenDays = getDateOffset(-7);
        const sleepHeartRateData = await SleepService.querySleepAvgHeartRate(imei, previousSevenDays, today);
        if (!sleepHeartRateData.length) return { level: "Invalid", value: null };
        const sleepHeartRateValues = sleepHeartRateData.map(r => r.avgHR).filter(v => v > 0);
        if (!sleepHeartRateValues.length) return { level: "Invalid", value: null };
        const sleepHeartRate = sleepHeartRateValues.reduce((acc, item) => acc + item, 0) / sleepHeartRateData.length;
        if (!sleepHeartRate || sleepHeartRate <= 0) return { level: "Invalid", value: null };
        const baselineResult = await calculateBaselines.getSleepAvgHRBaseline(imei);
        if (baselineResult.status !== "Success" || !baselineResult.baseline) return { level: "Invalid", value: null };
        const level = evaluateDayLevel(sleepHeartRate, baselineResult.baseline, baselineResult.baseline * 0.3, "rhr");
        if (!skipNotification) promises.push(sendNotification(imei, "TESTING: Your Average Sleep Heart Rate is elevated. Your body might be under stress or recovering."));
        return { level, value: sleepHeartRate };
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
