import { SleepService } from "./sleepService";
import { HRVService } from "./calculateHRV";
import { calculateBaselines, Level } from "./calculateBaselines";
import { sendNotification } from "./sendNotification";
import { RHRService } from "./rhr_service";
import { StressService } from "./stress_service";
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
    async evaluateDayLevelSleepScore(imei: string, skipNotification = true, promises: Promise<any>[] = []): Promise<{ level: Level; value: number | null }> {
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
    async evaluateDayLevelSleepDuration(imei: string, skipNotification = true, promises: Promise<any>[] = []): Promise<{ level: Level; value: number | null }> {
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
    async evaluateDayLevelRHR(imei: string, skipNotification = true, promises: Promise<any>[] = []): Promise<{ level: Level; value: number | null }> {
        console.log("evaluate Day Level RHR");
        const today = getDateOffset(0);
        const previousSevenDays = getDateOffset(-7);
        const sleepData = await RHRService.queryRHR(imei, previousSevenDays, today);
        if (!sleepData.length) return { level: "Invalid", value: null };
        const valid = sleepData.filter(r => r.rhr && r.rhr > 0);
        if (!valid.length) return { level: "Invalid", value: null };
        const current = valid.reduce((acc, item) => acc + (item.rhr ?? 0), 0) / valid.length;
        if (!current || current <= 0) return { level: "Invalid", value: null };
        const baselineResult = await calculateBaselines.getRHRBaseline(imei);
        if (baselineResult.status !== "Success" || !baselineResult.baseline) return { level: "Invalid", value: null };
        const level = evaluateDayLevel(current, baselineResult.baseline, baselineResult.baseline * 0.3, "rhr");
        if (!skipNotification) promises.push(sendNotification(imei, "TESTING: Your Resting Heart Rate is elevated. Your body might be under stress or recovering."));
        return { level, value: current };
    },

    /** HRV RMSSD: ±30% of baseline threshold based on 7-day average of daily maximums */
    async evaluateDayLevelRMSSD(imei: string, skipNotification = true, promises: Promise<any>[] = []): Promise<{ metric: "RMSSD"; level: Level; value: number | null }> {
        console.log("evaluate Day Level RMSSD (7-day average)");
        const dates: string[] = [];
        for (let i = -7; i <= 0; i++) {
            dates.push(getDateOffset(i));
        }

        const results = await Promise.all(
            dates.map(date => HRVService.calculateRMSSD(imei, date).catch(() => null))
        );

        const dailyValues = results
            .filter((res) => res !== null && res !== undefined)
            .map(res => {
                const vals = res.values.map(v => v.value).filter(v => v > 0);
                return vals.length > 0 ? Math.max(...vals) : null;
            })
            .filter((v): v is number => v !== null && v > 0);

        if (!dailyValues.length) {
            return { metric: "RMSSD", level: "Invalid", value: null };
        }

        const baselineResult = await calculateBaselines.getRMSSDBaseline(imei);
        if (baselineResult.status !== "Success" || !baselineResult.baseline) {
            return { metric: "RMSSD", level: "Invalid", value: null };
        }

        const averageRMSSD = dailyValues.reduce((a, b) => a + b, 0) / dailyValues.length;
        const level = evaluateDayLevel(averageRMSSD, baselineResult.baseline, baselineResult.baseline * 0.3, "other");
        if (!skipNotification) promises.push(sendNotification(imei, "TESTING: Your HRV (RMSSD) is low today, indicating high stress or poor recovery."));
        return { metric: "RMSSD", level, value: averageRMSSD };
    },

    /** HRV SDNN: ±30% of baseline threshold based on 7-day average of daily maximums */
    async evaluateDayLevelSDNN(imei: string, skipNotification = true, promises: Promise<any>[] = []): Promise<{ metric: "SDNN"; level: Level; value: number | null }> {
        console.log("evaluate Day Level SDNN (7-day average)");
        const dates: string[] = [];
        for (let i = -7; i <= 0; i++) {
            dates.push(getDateOffset(i));
        }

        const results = await Promise.all(
            dates.map(date => HRVService.calculateSDNN(imei, date).catch(() => null))
        );

        const dailyValues = results
            .filter((res) => res !== null && res !== undefined)
            .map(res => {
                const vals = res.values.map(v => v.value).filter(v => v > 0);
                return vals.length > 0 ? Math.max(...vals) : null;
            })
            .filter((v): v is number => v !== null && v > 0);

        if (!dailyValues.length) {
            return { metric: "SDNN", level: "Invalid", value: null };
        }

        const baselineResult = await calculateBaselines.getSDNNBaseline(imei);
        if (baselineResult.status !== "Success" || !baselineResult.baseline) {
            return { metric: "SDNN", level: "Invalid", value: null };
        }

        const averageSDNN = dailyValues.reduce((a, b) => a + b, 0) / dailyValues.length;
        const level = evaluateDayLevel(averageSDNN, baselineResult.baseline, baselineResult.baseline * 0.3, "other");
        if (!skipNotification) promises.push(sendNotification(imei, "TESTING: Your HRV (SDNN) is low today, indicating high stress or poor recovery."));
        return { metric: "SDNN", level, value: averageSDNN };
    },
    /** Sleep Avg HR: ±30% of baseline threshold (higher than baseline = Poor) */
    async evaluateDayLevelSleepHeartRate(imei: string, skipNotification = true, promises: Promise<any>[] = []): Promise<{ level: Level; value: number | null }> {
        console.log("evaluating sleep heart rate");
        const today = getDateOffset(0);
        const previousSevenDays = getDateOffset(-7);
        const sleepHeartRateData = await SleepService.querySleepAvgHeartRate(imei, previousSevenDays, today);
        if (!sleepHeartRateData.length) return { level: "Invalid", value: null };
        const sleepHeartRateValues = sleepHeartRateData.map(r => r.avgHR).filter(v => v > 0);
        if (!sleepHeartRateValues.length) return { level: "Invalid", value: null };
        const sleepHeartRate = sleepHeartRateValues.reduce((acc, item) => acc + item, 0) / sleepHeartRateValues.length;
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

    /**
     * Optimized combined evaluator — fetches ALL shared data in one parallel batch:
     *   - Sleep records (D-7 → D0): used by sleepScore, sleepDuration, RHR, sleepAvgHR
     *   - HRV per day (RMSSD + SDNN together): 8 days × 2 metrics but in one pass
     *   - All 6 baselines: fetched in parallel (hits in-memory cache on warm Lambda)
     *
     * Replaces 10+ independent DB round-trips with 3 parallel batch fetches.
     */
    async evaluateDayAllMetrics(
        imei: string,
        skipNotification = false,
        promises: Promise<any>[] = []
    ): Promise<{
        sleepScore: { level: Level; value: number | null };
        sleepDuration: { level: Level; value: number | null };
        rhr: { level: Level; value: number | null };
        rmssd: { metric: "RMSSD"; level: Level; value: number | null };
        sdnn: { metric: "SDNN"; level: Level; value: number | null };
        sleepHeartRate: { level: Level; value: number | null };
        stress: { level: Level; value: number | null };
    }> {
        const today = getDateOffset(0);
        const D7 = getDateOffset(-7);
        const dates = Array.from({ length: 8 }, (_, i) => getDateOffset(i - 7)); // D-7 … D0

        // ── 1. Single parallel batch: sleep records + HRV per day + all baselines ──
        const [sleepRecords, hrvPerDay, baselines, stressScoreResult] = await Promise.all([
            SleepService.getSleepData(imei, D7, today),

            // Fetch RMSSD and SDNN together for each day (8 days × 2 = 16 calls,
            // but all fire concurrently; HRV repo caching means same-day data is shared)
            Promise.all(dates.map(async date => ({
                date,
                rmssd: await HRVService.calculateRMSSD(imei, date).catch(() => null),
                sdnn: await HRVService.calculateSDNN(imei, date).catch(() => null),
            }))),

            // All baselines in parallel; hits in-memory TTL cache on warm Lambda
            Promise.all([
                calculateBaselines.getSleepScoreBaseline(imei),
                calculateBaselines.getSleepDurationBaseline(imei),
                calculateBaselines.getRHRBaseline(imei),
                calculateBaselines.getRMSSDBaseline(imei),
                calculateBaselines.getSDNNBaseline(imei),
                calculateBaselines.getSleepAvgHRBaseline(imei),
                calculateBaselines.getStressBaseline(imei),
            ]),

            // Calculate the composite daily stress score
            StressService.calculateDailyStressScore(imei, today).catch(() => null),
        ]);

        const [blSleepScore, blSleepDuration, blRHR, blRMSSD, blSDNN, blSleepAvgHR, blStress] = baselines;

        // ── 2. Derive all averages from the pre-fetched sleep records ─────────────
        const validSleep = sleepRecords.filter(r => (r.minutes ?? 0) >= 60);

        // Sleep Score 7d avg (all records, including short ones)
        const avgSleepScore = sleepRecords.length > 0
            ? sleepRecords.reduce((a, r) => a + (r.sleepScore ?? 0), 0) / sleepRecords.length : null;

        // Sleep Duration 7d avg (all records)
        const avgSleepDuration = sleepRecords.length > 0
            ? sleepRecords.reduce((a, r) => a + (r.minutes ?? 0), 0) / sleepRecords.length : null;

        // RHR 7d avg (>= 60m sessions only)
        const validRHR = validSleep.filter(r => (r.rhr ?? 0) > 0);
        const avgRHR = validRHR.length > 0
            ? validRHR.reduce((a, r) => a + (r.rhr ?? 0), 0) / validRHR.length : null;

        // Sleep Avg HR 7d avg (>= 60m sessions only)
        const validAvgHR = validSleep.filter(r => (r.avgHR ?? 0) > 0);
        const avgSleepHR = validAvgHR.length > 0
            ? validAvgHR.reduce((a, r) => a + (r.avgHR ?? 0), 0) / validAvgHR.length : null;

        // ── 3. Derive RMSSD + SDNN averages from the pre-fetched HRV data ─────────
        const rmssdDailyMaxes = hrvPerDay
            .map(d => { const vals = d.rmssd?.values.map(v => v.value).filter(v => v > 0) ?? []; return vals.length ? Math.max(...vals) : null; })
            .filter((v): v is number => v !== null);
        const sdnnDailyMaxes = hrvPerDay
            .map(d => { const vals = d.sdnn?.values.map(v => v.value).filter(v => v > 0) ?? []; return vals.length ? Math.max(...vals) : null; })
            .filter((v): v is number => v !== null);

        const avgRMSSD = rmssdDailyMaxes.length ? rmssdDailyMaxes.reduce((a, b) => a + b, 0) / rmssdDailyMaxes.length : null;
        const avgSDNN = sdnnDailyMaxes.length ? sdnnDailyMaxes.reduce((a, b) => a + b, 0) / sdnnDailyMaxes.length : null;

        // ── 4. Evaluate each metric ────────────────────────────────────────────────
        const sleepScore: { level: Level; value: number | null } =
            avgSleepScore && blSleepScore.status === "Success" && blSleepScore.baseline
                ? (() => {
                    const level = evaluateDayLevel(avgSleepScore, blSleepScore.baseline, 10, "other");
                    if (!skipNotification) promises.push(sendNotification(imei, "TESTING: Your Sleep Score dropped significantly today. Try to rest!"));
                    return { level, value: avgSleepScore };
                })()
                : { level: "Invalid", value: null };

        const sleepDuration: { level: Level; value: number | null } =
            avgSleepDuration && blSleepDuration.status === "Success" && blSleepDuration.durationBaseline
                ? (() => {
                    const level = evaluateDayLevel(avgSleepDuration, blSleepDuration.durationBaseline, blSleepDuration.durationBaseline * 0.3, "other");
                    if (!skipNotification) promises.push(sendNotification(imei, "TESTING: Your sleep duration was unusually short. Consider an early bedtime!"));
                    return { level, value: avgSleepDuration };
                })()
                : { level: "Invalid", value: null };

        const rhr: { level: Level; value: number | null } =
            avgRHR && blRHR.status === "Success" && blRHR.baseline
                ? (() => {
                    const level = evaluateDayLevel(avgRHR, blRHR.baseline, blRHR.baseline * 0.3, "rhr");
                    if (!skipNotification) promises.push(sendNotification(imei, "TESTING: Your Resting Heart Rate is elevated. Your body might be under stress or recovering."));
                    return { level, value: avgRHR };
                })()
                : { level: "Invalid", value: null };

        const rmssd: { metric: "RMSSD"; level: Level; value: number | null } =
            avgRMSSD && blRMSSD.status === "Success" && blRMSSD.baseline
                ? (() => {
                    const level = evaluateDayLevel(avgRMSSD, blRMSSD.baseline, blRMSSD.baseline * 0.3, "other");
                    if (!skipNotification) promises.push(sendNotification(imei, "TESTING: Your HRV (RMSSD) is low today, indicating high stress or poor recovery."));
                    return { metric: "RMSSD" as const, level, value: avgRMSSD };
                })()
                : { metric: "RMSSD" as const, level: "Invalid", value: null };

        const sdnn: { metric: "SDNN"; level: Level; value: number | null } =
            avgSDNN && blSDNN.status === "Success" && blSDNN.baseline
                ? (() => {
                    const level = evaluateDayLevel(avgSDNN, blSDNN.baseline, blSDNN.baseline * 0.3, "other");
                    if (!skipNotification) promises.push(sendNotification(imei, "TESTING: Your HRV (SDNN) is low today, indicating high stress or poor recovery."));
                    return { metric: "SDNN" as const, level, value: avgSDNN };
                })()
                : { metric: "SDNN" as const, level: "Invalid", value: null };

        const sleepHeartRate: { level: Level; value: number | null } =
            avgSleepHR && blSleepAvgHR.status === "Success" && blSleepAvgHR.baseline
                ? (() => {
                    const level = evaluateDayLevel(avgSleepHR, blSleepAvgHR.baseline, blSleepAvgHR.baseline * 0.3, "rhr");
                    if (!skipNotification) promises.push(sendNotification(imei, "TESTING: Your Average Sleep Heart Rate is elevated. Your body might be under stress or recovering."));
                    return { level, value: avgSleepHR };
                })()
                : { level: "Invalid", value: null };

        // ── 5. Evaluate Stress (new) ──────────────────────────────────────────
        const stress: { level: Level; value: number | null } =
            stressScoreResult && stressScoreResult.stressScore !== null
                ? (() => {
                    const mappedLevel: Level = 
                        stressScoreResult.stressLevel === "Low" ? "Good" :
                        stressScoreResult.stressLevel === "Moderate" ? "Fair" :
                        stressScoreResult.stressLevel === "High" ? "Poor" : "Invalid";
                    if (!skipNotification && mappedLevel === "Poor") {
                        promises.push(sendNotification(imei, "TESTING: Your Daily Stress level is highly elevated today. Take some deep breaths and rest!"));
                    }
                    return { level: mappedLevel, value: stressScoreResult.stressScore };
                })()
                : { level: "Invalid", value: null };

        return { sleepScore, sleepDuration, rhr, rmssd, sdnn, sleepHeartRate, stress };
    },
};
