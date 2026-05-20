export enum HRVType {
    SDNN = "SDNN",
    RMSSD = "RMSSD"
}
export type HRVResult = {
    timestamps: string;
    value: number;
}
export interface HRVData {
    imei: string;
    timestamp: string;
    values: HRVResult[];
    type: HRVType;
}
