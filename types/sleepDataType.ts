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
    minutes: number;
    sleepScore: number;
    segments: SleepSegment[] | any[];
    avgHR: number;
    minHR: number;
    rmssd: number;
    rhr: number;
    rhrTime: string;
    wakeUps: number;
}
