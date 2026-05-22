import { HRVService } from "./calculateHRV";
import { SleepService } from "./sleepService";
import { calculateBaselines } from "./calculateBaselines";
import { DailyStressScore, DailyStressResult, StressResultPoint } from "../types/stressType";
// ─── Types ───────────────────────────────────────────────────────────────────



// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDateOffset(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0];
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

/**
 * Maps a metric deviation to a 0–100 stress contribution.
 * - deviation = 0      → 50 (neutral)
 * - deviation = +threshold → 100 (max stress)
 * - deviation = -threshold → 0 (low stress / well recovered)
 * 
 * @param deviation   current - baseline (positive = stressed direction)
 * @param threshold   the ±boundary for "significant" deviation
 */
function deviationToStress(deviation: number, threshold: number): number {
    if (threshold <= 0) return 50;
    return clamp((deviation / threshold) * 50 + 50, 0, 100);
}

// ─── Main Service ─────────────────────────────────────────────────────────────

export const StressService = {

    /**
     * Hourly SDNN-based stress points for the day (existing logic).
     * Used by the stress chart in the dashboard.
     */
    async calculateDailyStress(imei: string, dateStr: string): Promise<DailyStressResult> {
        const sdnnRecord = await HRVService.calculateSDNN(imei, dateStr);

        const points: StressResultPoint[] = [];
        const summary = { lowHours: 0, midHours: 0, highHours: 0 };

        if (!sdnnRecord || !sdnnRecord.values || sdnnRecord.values.length === 0) {
            return { imei, date: dateStr, points, summary };
        }

        const baselineResult = await calculateBaselines.getSDNNBaseline(imei);
        const baselineSDNN = (baselineResult.status === "Success" && baselineResult.baseline && baselineResult.baseline > 0)
            ? baselineResult.baseline
            : 30;

        for (const item of sdnnRecord.values) {
            const sdnn = item.value;
            if (sdnn <= 0) continue;

            const changeRate = ((sdnn - baselineSDNN) / baselineSDNN) * 100;
            const scaleFactor = 1 / (1 + Math.abs(changeRate) * 0.01);
            const multiplier = changeRate < 0
                ? 0.4 + (1.0 - scaleFactor) * 0.2
                : 1.0 - scaleFactor * 0.3;
            const adjustedRate = changeRate * multiplier;
            const offset = Math.min(changeRate < 0 ? 55 : 45, Math.abs(adjustedRate));
            const index = changeRate < 0 ? 45 + offset : 45 - offset;
            const stressIndex = Math.max(0, Math.min(100, index));

            if (stressIndex <= 32) summary.lowHours++;
            else if (stressIndex <= 65) summary.midHours++;
            else summary.highHours++;

            points.push({
                timestamp: item.timestamps,
                stressIndex: Math.round(stressIndex * 10) / 10
            });
        }

        points.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        return { imei, date: dateStr, points, summary };
    },

    /**
     * Composite daily stress score (0–100) using 5 physiological metrics.
     * 
     * Weights:
     *   - RMSSD        35%  (lower RMSSD = more stress)
     *   - RHR          25%  (higher RHR   = more stress)
     *   - Sleep Avg HR 15%  (higher avgHR = more stress)
     *   - Sleep Score  15%  (lower score  = more stress)
     *   - Sleep Dur    10%  (shorter dur  = more stress)
     * 
     * Score 0–33 = Low, 34–66 = Moderate, 67–100 = High
     */
    async calculateDailyStressScore(imei: string, targetDateStr?: string): Promise<DailyStressScore> {
        const today = targetDateStr || getDateOffset(0);

        const getRelativeDateOffset = (offsetDays: number): string => {
            const d = new Date(today);
            d.setDate(d.getDate() + offsetDays);
            return d.toISOString().split("T")[0];
        };

        const sevenDaysAgo = getRelativeDateOffset(-7);

        // ── Fetch all data in parallel ────────────────────────────────────────
        const [
            sleepRecords,
            sleepAvgHRRecords,
            rmssdBaseline,
            rhrBaseline,
            sleepAvgHRBaseline,
            sleepScoreBaseline,
            sleepDurationBaseline,
        ] = await Promise.all([
            SleepService.getSleepData(imei, sevenDaysAgo, today),
            SleepService.querySleepAvgHeartRate(imei, sevenDaysAgo, today),
            calculateBaselines.getRMSSDBaseline(imei),
            calculateBaselines.getRHRBaseline(imei),
            calculateBaselines.getSleepAvgHRBaseline(imei),
            calculateBaselines.getSleepScoreBaseline(imei),
            calculateBaselines.getSleepDurationBaseline(imei),
        ]);

        // ── 7-day averages from RMSSD (daily max of each sleep window) ────────
        const rmssddates: string[] = [];
        for (let i = -7; i <= 0; i++) rmssddates.push(getRelativeDateOffset(i));
        const rmssdResults = await Promise.all(
            rmssddates.map(d => HRVService.calculateRMSSD(imei, d).catch(() => null))
        );
        const rmssdDailyMaxes = rmssdResults
            .filter(r => r !== null && r !== undefined)
            .map(r => {
                const vals = r!.values.map(v => v.value).filter(v => v > 0);
                return vals.length > 0 ? Math.max(...vals) : null;
            })
            .filter((v): v is number => v !== null && v > 0);
        const avgRMSSD = rmssdDailyMaxes.length > 0
            ? rmssdDailyMaxes.reduce((a, b) => a + b, 0) / rmssdDailyMaxes.length
            : null;

        // ── 7-day average RHR (only real sleep sessions >= 60m) ───────────────
        const validRHRRecords = sleepRecords.filter(r => (r.minutes ?? 0) >= 60 && (r.rhr ?? 0) > 0);
        const avgRHR = validRHRRecords.length > 0
            ? validRHRRecords.reduce((acc, r) => acc + (r.rhr ?? 0), 0) / validRHRRecords.length
            : null;

        // ── 7-day average Sleep Avg HR (only valid readings) ─────────────────
        const validAvgHRValues = sleepAvgHRRecords.map(r => r.avgHR).filter(v => v && v > 0);
        const avgSleepHR = validAvgHRValues.length > 0
            ? validAvgHRValues.reduce((a, b) => a + b, 0) / validAvgHRValues.length
            : null;

        // ── 7-day average Sleep Score & Duration (>= 60m sessions only) ──────
        const validSleepRecords = sleepRecords.filter(r => (r.minutes ?? 0) >= 60 && (r.sleepScore ?? 0) > 0);
        const avgSleepScore = validSleepRecords.length > 0
            ? validSleepRecords.reduce((acc, r) => acc + (r.sleepScore ?? 0), 0) / validSleepRecords.length
            : null;
        const avgSleepDuration = validSleepRecords.length > 0
            ? validSleepRecords.reduce((acc, r) => acc + (r.minutes ?? 0), 0) / validSleepRecords.length
            : null;

        // ── Extract baselines ────────────────────────────────────────────────
        const blRMSSD = rmssdBaseline.status === "Success" ? rmssdBaseline.baseline ?? null : null;
        const blRHR = rhrBaseline.status === "Success" ? rhrBaseline.baseline ?? null : null;
        const blSleepHR = sleepAvgHRBaseline.status === "Success" ? sleepAvgHRBaseline.baseline ?? null : null;
        const blSleepScore = sleepScoreBaseline.status === "Success" ? sleepScoreBaseline.baseline ?? null : null;
        const blSleepDuration = sleepDurationBaseline.status === "Success" ? sleepDurationBaseline.durationBaseline ?? null : null;

        // ── Compute stress contributions (0–100 each) ─────────────────────────
        // For RMSSD: lower = more stress → deviation = baseline - current (positive = stressed)
        const rmssdContrib = (avgRMSSD !== null && blRMSSD !== null)
            ? deviationToStress(blRMSSD - avgRMSSD, blRMSSD * 0.3) : null;

        // For RHR: higher = more stress → deviation = current - baseline (positive = stressed)
        const rhrContrib = (avgRHR !== null && blRHR !== null)
            ? deviationToStress(avgRHR - blRHR, blRHR * 0.3) : null;

        // For Sleep Avg HR: higher = more stress → deviation = current - baseline
        const sleepHRContrib = (avgSleepHR !== null && blSleepHR !== null)
            ? deviationToStress(avgSleepHR - blSleepHR, blSleepHR * 0.3) : null;

        // For Sleep Score: lower = more stress → deviation = baseline - current
        const sleepScoreContrib = (avgSleepScore !== null && blSleepScore !== null)
            ? deviationToStress(blSleepScore - avgSleepScore, 10) : null;

        // For Sleep Duration: lower = more stress → deviation = baseline - current
        const sleepDurContrib = (avgSleepDuration !== null && blSleepDuration !== null)
            ? deviationToStress(blSleepDuration - avgSleepDuration, blSleepDuration * 0.3) : null;

        // ── Weighted composite score ──────────────────────────────────────────
        const weights = [
            { contrib: rmssdContrib, weight: 0.35 },
            { contrib: rhrContrib, weight: 0.25 },
            { contrib: sleepHRContrib, weight: 0.15 },
            { contrib: sleepScoreContrib, weight: 0.15 },
            { contrib: sleepDurContrib, weight: 0.10 },
        ];

        const available = weights.filter(w => w.contrib !== null);
        let stressScore: number | null = null;

        if (available.length > 0) {
            const totalWeight = available.reduce((s, w) => s + w.weight, 0);
            const weightedSum = available.reduce((s, w) => s + w.contrib! * w.weight, 0);
            stressScore = Math.round((weightedSum / totalWeight) * 10) / 10;
        }

        const stressLevel = stressScore === null
            ? "Invalid"
            : stressScore <= 33 ? "Low"
                : stressScore <= 66 ? "Moderate"
                    : "High";

        return {
            imei,
            date: today,
            stressScore,
            stressLevel,
        };
    }
};
