import { BaselineRepo } from "../repository/baseline_repo";
import { SleepService } from "./sleepService";
import { HRVService } from "./calculateHRV";
import { sendNotification } from "./sendNotification";
import { BaselineData, BaselineType } from "../types/baselineType";
import { SleepRepo } from "../repository/sleep_repo";
import { HRVData } from "../types/HRVType";
// ─── Types ───────────────────────────────────────────────────────────────────

export type Level = "Good" | "Fair" | "Poor" | "Invalid";

export interface BaselineResult {
    status: "Success" | "Error";
    message?: string;
    baseline?: number;
    durationBaseline?: number; // only used for Sleep
}

// ─── Date Helpers ─────────────────────────────────────────────────────────────

/**
 * Returns a "YYYY-MM-DD" date string offset from today.
 * Negative values go back in time (e.g., -28 = 28 days ago).
 */
function getDateOffset(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0];
}

// ─── Sliding Window Baseline ──────────────────────────────────────────────────

/**
 * Finds the best 7-day sliding window average from a chronologically sorted
 * array of daily values.
 *
 * Per spec:
 *  - Sleep Score / RMSSD / SDNN → "max" (higher is better)
 *  - RHR                        → "min" (lower is better)
 */
function slidingWindowBaseline(values: number[], pickBest: "max" | "min"): number {
    const WINDOW = 7;
    if (values.length < WINDOW) return 0;

    const windowAverages: number[] = [];
    for (let i = 0; i <= values.length - WINDOW; i++) {
        const slice = values.slice(i, i + WINDOW);
        windowAverages.push(slice.reduce((sum, v) => sum + v, 0) / WINDOW);
    }

    console.log("window averages", windowAverages);
    return pickBest === "max"
        ? Math.max(...windowAverages)
        : Math.min(...windowAverages);
}

// ─── Linear Regression Slope ─────────────────────────────────────────────────

/**
 * Calculates the linear regression slope from an array of weekly averages.
 * Used to determine trend direction and magnitude over the past 4 weeks.
 * Returns slope in units-per-week.
 */
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



// ─── Main Export ──────────────────────────────────────────────────────────────

export const calculateBaselines = {

    async _getOrCalculate(
        imei: string,
        type: BaselineType,
        calculateFn: () => Promise<BaselineResult>,
        valueExtractor: (res: BaselineResult) => number | undefined = (res) => res.baseline,
        resultBuilder: (baselineValue: number) => BaselineResult = (val) => ({ status: "Success", baseline: val })
    ): Promise<BaselineResult> {
        // 1. Get from database first
        console.log(`get ${type} baseline for imei ${imei}`); 8
        const cached = await BaselineRepo.getBaseline(imei, type);
        if (cached) {
            return resultBuilder(cached.baselineValue);
        }

        // 2. Calculate if missing
        const result = await calculateFn();
        if (result.status === "Success") {
            const val = valueExtractor(result);
            if (val !== undefined) {
                const data: BaselineData = {
                    imei,
                    type,
                    baselineValue: val,
                    lastUpdated: new Date().toISOString()
                };
                await BaselineRepo.saveBaseline(data);
            }
        }
        return result;
    },

    async getSleepDurationBaseline(imei: string): Promise<BaselineResult> {
        return this._getOrCalculate(
            imei,
            BaselineType.SleepDuration,
            () => this.calculateSleepBaseline(imei),
            (res) => res.durationBaseline,
            (val) => ({ status: "Success", durationBaseline: val })
        );
    },

    async getSleepScoreBaseline(imei: string): Promise<BaselineResult> {
        return this._getOrCalculate(
            imei,
            BaselineType.SleepScore,
            () => this.calculateSleepBaseline(imei)
        );
    },

    async getRHRBaseline(imei: string): Promise<BaselineResult> {
        return this._getOrCalculate(
            imei,
            BaselineType.RHR,
            () => this.calculateRHRBaseline(imei)
        );
    },

    async getRMSSDBaseline(imei: string): Promise<BaselineResult> {
        return this._getOrCalculate(
            imei,
            BaselineType.RMSSD,
            () => this.calculateRMSSDBaseline(imei)
        );
    },

    async getSDNNBaseline(imei: string): Promise<BaselineResult> {
        return this._getOrCalculate(
            imei,
            BaselineType.SDNN,
            () => this.calculateSDNNBaseline(imei)
        );
    },

    async getSleepAvgHRBaseline(imei: string): Promise<BaselineResult> {
        return this._getOrCalculate(
            imei,
            BaselineType.SleepAvgHR,
            () => this.calculateSleepAvgHRBaseline(imei)
        );
    },


    async calculateSleepAvgHRBaseline(imei: string): Promise<BaselineResult> {
        console.log("calculating sleep avg hr baseline for imei", imei)
        const startDate = getDateOffset(-28);
        const endDate = getDateOffset(-1);
        const records = await SleepService.getSleepData(imei, startDate, endDate);
        const valid = records
            .filter((r: any) => r.minutes >= 60 && r.avgHR && r.avgHR > 0)
            .map((r: any) => r.avgHR);

        if (valid.length < 7) {
            return { status: "Error", message: "Not enough sleep data (with duration >= 60m) for baseline calculation." };
        }

        return {
            status: "Success",
            baseline: slidingWindowBaseline(valid, "min"),
        }
    },

    // ── Sleep Baseline ────────────────────────────────────────────────────────

    /**
     * Baseline = highest 7-day sliding window average of sleep score.
     * Query range: D-60 to D-1.
     * Excludes days with missing or zero sleep score / duration.
     */
    async calculateSleepBaseline(imei: string): Promise<BaselineResult> {
        console.log("calculating sleep baseline for imei", imei)
        const startDate = getDateOffset(-60); // D-28
        const endDate = getDateOffset(-1);  // D-1

        // Use the service directly, which handles both fetching from cache and backfilling missing data via Lambda
        const records = await SleepService.getSleepData(imei, startDate, endDate);
        const valid = records.filter((r: any) => r.sleepScore > 0 && r.minutes >= 60);

        if (valid.length < 7) {
            return { status: "Error", message: "Not enough sleep data even after calculation. Requires at least 7 valid days." };
        }

        return {
            status: "Success",
            baseline: slidingWindowBaseline(valid.map((r: any) => r.sleepScore), "max"),
            durationBaseline: slidingWindowBaseline(valid.map((r: any) => r.minutes), "max"),
        };
    },

    // ── RHR Baseline ──────────────────────────────────────────────────────────

    /**
     * Baseline = lowest 7-day sliding window average of RHR.
     * RHR data is sourced from sleep records (recorded during sleep).
     * Query range: D-60 to D-1.
     */
    async calculateRHRBaseline(imei: string): Promise<BaselineResult> {
        console.log("calculating rhr baseline for imei", imei)
        const startDate = getDateOffset(-60);
        const endDate = getDateOffset(-1);

        // Use the service directly, which handles both fetching from cache and backfilling missing data via Lambda
        const records = await SleepService.getSleepData(imei, startDate, endDate);
        const valid = records.filter((r: any) => r.minutes >= 60 && r.rhr && r.rhr > 0);

        if (valid.length < 7) {
            return { status: "Error", message: "Not enough RHR data even after calculation. Requires at least 7 valid days." };
        }

        return {
            status: "Success",
            // Lower RHR = better cardiovascular fitness → pick minimum window
            baseline: slidingWindowBaseline(valid.map((r: any) => r.rhr), "min"),
        };
    },

    // ── RMSSD Baseline ────────────────────────────────────────────────────────

    /**
     * Baseline = highest 7-day sliding window average of daily RMSSD.
     * Sources RMSSD values from sleep records (pre-calculated by the Sleep Lambda
     * from sleep-time HR segments — more accurate than using all-day HR data).
     * Query range: D-28 to D-1.
     */
    async calculateRMSSDBaseline(imei: string): Promise<BaselineResult> {
        console.log("calculating rmssd baseline for imei", imei)

        const dates: string[] = [];
        for (let i = -60; i <= -1; i++) {
            dates.push(getDateOffset(i));
        }

        const results: (HRVData | null)[] = await Promise.all(
            dates.map(date => HRVService.calculateRMSSD(imei, date).catch(() => null))
        );

        // Sort results chronologically by timestamp (date) before extracting daily values
        const dailyValues = results
            .filter((res): res is HRVData => res !== null && res !== undefined)
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
            .map(res => {
                const vals = res.values.map(v => v.value).filter(v => v > 0);
                return vals.length > 0 ? Math.max(...vals) : null;
            })
            .filter((v): v is number => v !== null && v > 0);

        if (dailyValues.length < 7) {
            return { status: "Error", message: "Not enough RMSSD data. Requires at least 7 valid sleep days." };
        }
        console.log(dailyValues);
        return {
            status: "Success",
            // Higher RMSSD = better autonomic recovery → pick maximum window
            baseline: slidingWindowBaseline(dailyValues, "max"),
        };
    },

    // ── SDNN Baseline ─────────────────────────────────────────────────────────

    /**
     * Baseline = highest 7-day sliding window average of daily SDNN.
     * SDNN is computed here from the sleep segments' hrList stored in sleep records,
     * using the same HR data that the Sleep Lambda used for sleep detection.
     * Query range: D-28 to D-1.
     */
    async calculateSDNNBaseline(imei: string): Promise<BaselineResult> {
        console.log("calculating sdnn baseline for imei", imei)

        const dates: string[] = [];
        for (let i = -60; i <= -1; i++) {
            dates.push(getDateOffset(i));
        }

        const results: (HRVData | null)[] = await Promise.all(
            dates.map(date => HRVService.calculateSDNN(imei, date).catch(() => null))
        );

        // Sort results chronologically by timestamp (date) before extracting daily values
        const dailyValues = results
            .filter((res): res is HRVData => res !== null && res !== undefined)
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
            .map(res => {
                const vals = res.values.map(v => v.value).filter(v => v > 0);
                return vals.length > 0 ? Math.max(...vals) : null;
            })
            .filter((v): v is number => v !== null && v > 0);

        if (dailyValues.length < 7) {
            return { status: "Error", message: "Not enough SDNN data. Requires at least 7 valid sleep days." };
        }

        return {
            status: "Success",
            // Higher SDNN = better heart rate variability → pick maximum window
            baseline: slidingWindowBaseline(dailyValues, "max"),
        };
    },



    // ── Private Helper ────────────────────────────────────────────────────────

    /**
     * Groups raw HRV records (multiple readings per day) by date and
     * computes the daily average for the given metric.
     * Skips entries with zero or missing values.
     *
     * @param records  Raw HRV records from the repository
     * @param metric   "rmssd" or "sdnn"
     * @returns        Chronologically sorted array of daily averages
     */
    _groupAndAverageByDate(records: any[], metric: "rmssd" | "sdnn"): number[] {
        const byDate: Record<string, number[]> = {};

        for (const record of records) {
            const date = (record.date ?? "").split("T")[0];
            const value = Number(record[metric] ?? 0);
            if (!date || value <= 0) continue;

            if (!byDate[date]) byDate[date] = [];
            byDate[date].push(value);
        }

        return Object.keys(byDate)
            .sort()
            .map(date => {
                const values = byDate[date];
                return values.reduce((sum, v) => sum + v, 0) / values.length;
            });
    },
};