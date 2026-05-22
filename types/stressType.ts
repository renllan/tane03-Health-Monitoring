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