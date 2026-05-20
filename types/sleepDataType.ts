export interface HeartRateData {
    timestamp: string;
    value: number;
}

export interface SleepSegment {
    startTime: string;
    endTime: string;
    hrList: HeartRateData[];
}

export interface SleepData {
    imei: string;
    date: string;
    minutes: number | null;
    sleepScore: number | null;
    segments: SleepSegment[] | any[];
    avgHR: number | null;
    minHR: number | null;
    rmssd: number | null;
    rhr: number | null;
    rhrTime: string | null;
    wakeUps: number | null;
}
