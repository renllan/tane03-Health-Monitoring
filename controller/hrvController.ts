import { HRVService } from "../service/calculateHRV";
import { HRVData, HRVType } from "../types/HRVType";
import { HRV_repo } from "../repository/HRV_repo";

export const HRVController = {
    async getHRV(imei: string, timestamp: string) {
        return await HRVService.calculateHRV(imei, timestamp);
    },

    async getRMSSD(imei: string, timestamp: string) {
        return await HRVService.calculateRMSSD(imei, timestamp);
    },

    async getSDNN(imei: string, timestamp: string) {
        return await HRVService.calculateSDNN(imei, timestamp);
    },
}

