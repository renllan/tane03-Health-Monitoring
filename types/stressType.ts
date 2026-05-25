import { SleepData } from "./sleepDataType";
import { HRVData } from "./HRVType";

/**
 * Pre-fetched data passed into calculateDailyStressScore during bulk baseline
 * calculation. All 60 daily stress scores filter from this shared in-memory
 * context instead of each issuing 7+ independent DB/API calls.
 */
export interface PreloadedStressData {
    /** Full sleep records covering D-60 to D-1 */
    sleepData: SleepData[];
    /** Sleep avg HR records covering D-60 to D-1 */
    sleepAvgHR: { imei: string; date: string; avgHR: number | null }[];
    /** RMSSD HRV records keyed by "YYYY-MM-DD" covering D-67 to D-1 */
    rmssd: Record<string, HRVData | null>;
    /** The 5 static baselines fetched once for all 60 days */
    baselines: {
        rmssd: { status: string; baseline?: number };
        rhr: { status: string; baseline?: number };
        sleepAvgHR: { status: string; baseline?: number };
        sleepScore: { status: string; baseline?: number };
        sleepDuration: { status: string; durationBaseline?: number };
    };
}

export interface StressResultPoint {
    timestamp: string;
    stressIndex: number;
}

export interface DailyStressResult {
    imei: string;
    date: string;
    points: StressResultPoint[];
    summary: {
        lowHours: number;
        midHours: number;
        highHours: number;
    };
}

export interface StressMetricBreakdown {
    current: number | null;
    baseline: number | null;
    contribution: number | null; // 0-100 stress contribution (50 = neutral)
}

export interface DailyStressScore {
    imei: string;
    date: string;
    stressScore: number | null;         // 0–100 composite score (higher = more stress)
    stressLevel: "Low" | "Moderate" | "High" | "Invalid";

}