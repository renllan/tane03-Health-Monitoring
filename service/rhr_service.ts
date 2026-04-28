import app from "../app";
import { SleepRepo } from "../repository/sleep_repo";
import { AppError } from "../utils/AppError";

export class RHRService {
    //query rhr from date range
    //if only one day of data is required, use the same start and end date    
    async queryRHR(imei: string, startDate: string, endDate: string) {
        const data = await SleepRepo.queryRHR(imei, startDate, endDate);
        if (data.length === 0) {
            throw new AppError("No data found for the given date range", 404);
        }
        return data;

    }
}