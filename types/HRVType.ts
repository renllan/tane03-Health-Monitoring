export enum HRVType {
    SDNN = "SDNN",
    RMSSD = "RMSSD"
}
export interface HRVData {
    imei: string;
    timestamp: string;
    value: number;
    type: HRVType;
}
