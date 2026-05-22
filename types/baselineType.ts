export enum BaselineType {
    HR = "HR",
    SDNN = "SDNN",
    RMSSD = "RMSSD",
    SP02 = "SP02",
    Bloodpressure = "Bloodpressure",
    SleepDuration = "SleepDuration",
    SleepScore = "SleepScore",
    SleepAvgHR = "SleepAvgHeartRate",
    RHR = "RHR",
    Stress = "Stress",
}

export type BaselineData = {
    imei: string;
    lastUpdated: string;
    type: BaselineType;
    baselineValue: number;
}