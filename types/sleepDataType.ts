export interface SleepSegment {
    startTime: string;
    endTime: string;
    status?: string | number;
    [key: string]: any;
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
