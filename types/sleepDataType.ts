interface SleepSegment {
    stage: 'light' | 'deep' | 'rem' | 'awake';
    startTime: string;   // ISO timestamp
    endTime: string;     // ISO timestamp
    duration: number;    // minutes
}

export interface SleepData {
    imei: string
    date: string;
    minutes: number;
    sleepScore: number,
    segments: SleepSegment[],
    avgHR: number,
    minHR: number,
    rmssd: number,
    rhr: number,
    rhrTime: number,
    wakeUps: number
}