import { HRVService } from "./calculateHRV";
import { SleepService } from "./sleepService";
import { calculateBaselines } from "./calculateBaselines";
import { DailyStressScore, DailyStressResult, StressResultPoint, PreloadedStressData } from "../types/stressType";
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
     * 
     * @param preloaded  Optional bulk-preloaded context. When provided (e.g.
     *                   during baseline calculation), ALL data is retrieved
     *                   from memory — zero DB or API calls are made. When
     *                   omitted, falls back to individual async queries.
     */
    async calculateDailyStressScore(
        imei: string,
        targetDateStr?: string,
        preloaded?: PreloadedStressData
    ): Promise<DailyStressScore> {
        const today = targetDateStr || getDateOffset(0);

        const getRelativeDateOffset = (offsetDays: number): string => {
            const d = new Date(today);
            d.setDate(d.getDate() + offsetDays);
            return d.toISOString().split("T")[0];
        };

        const sevenDaysAgo = getRelativeDateOffset(-7);

        // ── Fetch data: in-memory (preloaded) or individual DB queries ────────
        let sleepRecords: any[];
        let sleepAvgHRRecords: any[];
        let rmssdBaseline: any;
        let rhrBaseline: any;
        let sleepAvgHRBaseline: any;
        let sleepScoreBaseline: any;
        let sleepDurationBaseline: any;
        let rmssdResults: any[];

        if (preloaded) {
            // ── Fast in-memory path (bulk baseline mode) ─────────────────────
            // Filter the pre-fetched arrays by the 7-day window for this date.
            sleepRecords = preloaded.sleepData.filter(
                r => r.date >= sevenDaysAgo && r.date <= today
            );
            sleepAvgHRRecords = preloaded.sleepAvgHR.filter(
                r => r.date >= sevenDaysAgo && r.date <= today
            );
            rmssdBaseline      = preloaded.baselines.rmssd;
            rhrBaseline        = preloaded.baselines.rhr;
            sleepAvgHRBaseline = preloaded.baselines.sleepAvgHR;
            sleepScoreBaseline = preloaded.baselines.sleepScore;
            sleepDurationBaseline = preloaded.baselines.sleepDuration;

            // Build the 8-day RMSSD list from the preloaded map
            const rmssddates: string[] = [];
            for (let i = -7; i <= 0; i++) rmssddates.push(getRelativeDateOffset(i));
            rmssdResults = rmssddates.map(d => preloaded.rmssd[d] ?? null);
        } else {
            // ── Original async path (single-day real-time evaluation) ─────────
            [
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

            const rmssddates: string[] = [];
            for (let i = -7; i <= 0; i++) rmssddates.push(getRelativeDateOffset(i));
            rmssdResults = await Promise.all(
                rmssddates.map(d => HRVService.calculateRMSSD(imei, d).catch(() => null))
            );
        }

        // ── 7-day averages from RMSSD (daily max of each sleep window) ────────
        const rmssdDailyMaxes = rmssdResults
            .filter(r => r !== null && r !== undefined)
            .map(r => {
                const vals = r!.values.map((v: any) => v.value).filter((v: number) => v > 0);
                return vals.length > 0 ? Math.max(...vals) : null;
            })
            .filter((v): v is number => v !== null && v > 0);
        const avgRMSSD = rmssdDailyMaxes.length > 0
            ? rmssdDailyMaxes.reduce((a, b) => a + b, 0) / rmssdDailyMaxes.length
            : null;

        // ── 7-day average RHR (only real sleep sessions >= 60m) ───────────────
        const validRHRRecords = sleepRecords.filter(r => (r.minutes ?? 0) >= 60 && (r.rhr ?? 0) > 0);
        const avgRHR = validRHRRecords.length > 0
            ? validRHRRecords.reduce((acc: number, r: any) => acc + (r.rhr ?? 0), 0) / validRHRRecords.length
            : null;

        // ── 7-day average Sleep Avg HR (only valid readings) ─────────────────
        const validAvgHRValues = sleepAvgHRRecords.map((r: any) => r.avgHR).filter((v: any) => v && v > 0);
        const avgSleepHR = validAvgHRValues.length > 0
            ? validAvgHRValues.reduce((a: number, b: number) => a + b, 0) / validAvgHRValues.length
            : null;

        // ── 7-day average Sleep Score & Duration (>= 60m sessions only) ──────
        const validSleepRecords = sleepRecords.filter(r => (r.minutes ?? 0) >= 60 && (r.sleepScore ?? 0) > 0);
        const avgSleepScore = validSleepRecords.length > 0
            ? validSleepRecords.reduce((acc: number, r: any) => acc + (r.sleepScore ?? 0), 0) / validSleepRecords.length
            : null;
        const avgSleepDuration = validSleepRecords.length > 0
            ? validSleepRecords.reduce((acc: number, r: any) => acc + (r.minutes ?? 0), 0) / validSleepRecords.length
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
