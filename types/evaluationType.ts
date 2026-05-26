import { Level } from "../service/calculateBaselines";

// Re-export Level so consumers only need to import from evaluationType
export type { Level };

export type MetricResult = {
    level: Level;
    value: number | null;
};

/**
 * The shape of a daily evaluation record stored in DynamoDB.
 * PK: imei (String)
 * SK: date (String, YYYY-MM-DD)
 */
export type DailyEvaluationRecord = {
    imei: string;
    date: string;           // YYYY-MM-DD
    lastUpdated: string;    // ISO-8601

    sleepScore: MetricResult;
    sleepDuration: MetricResult;
    rhr: MetricResult;
    rmssd: MetricResult;
    sdnn: MetricResult;
    sleepHeartRate: MetricResult;
    stress: MetricResult;
};
