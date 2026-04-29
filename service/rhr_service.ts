import { SleepRepo } from "../repository/sleep_repo";
import { SleepService } from "./sleepService";

export const RHRService = {
    // Query RHR for a date range.
    // If DB has no data at all → backfill via SleepService (calls Lambda for each missing date).
    // If DB has partial data → find the missing dates, backfill them, then merge and return.
    async queryRHR(imei: string, startDate: string, endDate: string) {
        const data = await SleepRepo.queryRHR(imei, startDate, endDate);

        // Calculate the full list of expected dates in the range
        const days = (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24) + 1;
        const expectedDates = Array.from({ length: days }, (_, i) => {
            const d = new Date(startDate);
            d.setDate(d.getDate() + i);
            return d.toISOString().split("T")[0];
        });

        // Find which dates are missing from the DB results
        const cachedDates = new Set(data.map(item => item.date));
        const missingDates = expectedDates.filter(d => !cachedDates.has(d));

        if (missingDates.length === 0) {
            // All data is already in the DB
            return data;
        }

        // Backfill missing dates via SleepService (it calls Lambda + saves to DB)
        const backfilled = await SleepService.getSleepData(imei, missingDates[0], missingDates[missingDates.length - 1]);
        const backfilledRHR = backfilled.map(item => ({
            imei: item.imei,
            date: item.date,
            rhr: item.rhr,
        }));

        // Merge DB data + backfilled, sort ascending by date
        return [...data, ...backfilledRHR]
            .sort((a, b) => a.date.localeCompare(b.date));
    }
}
