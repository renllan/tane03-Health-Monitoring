import { SleepData } from "../types/sleepDataType"
import { SleepRepo } from "../repository/sleep_repo"
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda"
import { DeviceGroupRepo } from "../repository/DeviceGroup_repo"

const lambdaClient = new LambdaClient({ region: process.env.US_REGION });
async function getAnchorHour(imei: string): Promise<string> {
    try {
        const info = await DeviceGroupRepo.getDeviceGroup(imei);
        const group = info?.group;
        if (group === 'Indonesia') return '11:00:00Z'; // UTC+7 (18:00 local is 11:00 UTC)
        return '10:00:00Z'; // UTC+8 for Taiwan, Malaysia (18:00 local is 10:00 UTC)
    } catch {
        return '10:00:00Z'; // Default to Taiwan (UTC+8)
    }
}

export const SleepService = {
    //get the sleep data from the repo if the date range has all the data
    //if not, calculate the missing data and save them to the repo
    //then return the full data
    //if the date range has no sleep data stored in the datebase, calculate the full data and save them to the databse 
    async getSleepData(imei: string, startDate: string, endDate: string) {
        console.log(`[SleepService] getSleepData called for IMEI: ${imei} from ${startDate} to ${endDate}`);
        const sleepData: SleepData[] | null = await SleepRepo.querySleepData(imei, startDate, endDate);
        const days: number = (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24) + 1;
        
        console.log(`[SleepService] Found ${sleepData?.length || 0} cached sleep records in DB out of ${days} requested days.`);
        
        if (sleepData.length === days) {
            console.log(`[SleepService] Cache hit for all requested days.`);
            return sleepData;
        }

        const anchorHour = await getAnchorHour(imei);
        const cachedDates = new Set(sleepData.map((d: any) => d.date));
        const missingDates: string[] = [];
        for (let i = 0; i < days; i++) {
            const date = new Date(startDate);
            date.setDate(date.getDate() + i);
            const dateStr = date.toISOString().split('T')[0]; // "YYYY-MM-DD"
            if (!cachedDates.has(dateStr)) {
                missingDates.push(dateStr);
            }
        }

        console.log(`[SleepService] Missing dates to calculate:`, missingDates);

        // 4. Calculate and save each missing date
        const calculated = await Promise.all(
            missingDates.map(date => {
                console.log(`[SleepService] Triggering calculation for missing date: ${date}`);
                return this.calculateSleepData(imei, date, anchorHour);
            })
        );

        for (const day of calculated) {
            console.log(`[SleepService] Saving newly calculated sleep data to DB for date: ${day.date}`);
            await SleepRepo.saveSleep(day);
        }
        // 5. Merge cached + newly calculated, sort by date ascending
        const res = [...sleepData as SleepData[], ...calculated]
            .sort((a, b) => a.date.localeCompare(b.date));
        
        console.log(`[SleepService] Merged sleep data returned successfully.`);
        return res;
    },


    //get the sleep data from the repo if the date has all the data
    //if not, calculate the missing data and save them to the repo
    //then return the full data
    //if the date range has no data, calculate the full data and save them to the repo
    async getSleepDataByDate(imei: string, date: string) {
        console.log(`[SleepService] getSleepDataByDate called for IMEI: ${imei}, Date: ${date}`);
        const sleepData: SleepData | null = await SleepRepo.getSleepData(imei, date);
        if (sleepData) {
            console.log(`[SleepService] Cache hit in DB for IMEI: ${imei}, Date: ${date}`);
            return sleepData;
        }

        console.log(`[SleepService] Cache miss in DB for IMEI: ${imei}, Date: ${date}. Invoking calculation.`);
        const anchorHour = await getAnchorHour(imei);
        const newSleepData = await this.calculateSleepData(imei, date, anchorHour);
        
        console.log(`[SleepService] Saving newly calculated sleep data to DB for IMEI: ${imei}, Date: ${date}`);
        await SleepRepo.saveSleep(newSleepData);

        return newSleepData;
    },
    //calculate the sleep data for the given date and time zone
    //invoke the sleep lambda to calculate the sleep data
    //return the sleep data
    async calculateSleepData(imei: string, date: string, anchorHour: string): Promise<SleepData> {
        console.log(`[SleepService] Invoking sleep Lambda (${process.env.SLEEP_LAMBDA_NAME}) for IMEI: ${imei}, date: ${date}, anchorHour: ${anchorHour}`);
        const command = new InvokeCommand({
            FunctionName: process.env.SLEEP_LAMBDA_NAME,
            InvocationType: "RequestResponse",
            // detectSleepSegments reads from event.arguments.
            // anchorDate is the target date at 18:00 local time; days=1 returns only that day.
            Payload: JSON.stringify({
                arguments: {
                    deviceId: imei,
                    anchorDate: `${date}T${anchorHour}`,
                    days: 1,
                }
            }),
        });
        const response = await lambdaClient.send(command);
        const raw = JSON.parse(Buffer.from(response.Payload!).toString());

        // Lambda execution errors return { errorType, errorMessage }
        if (raw?.errorType) {
            console.error(`[SleepService] Sleep Lambda execution returned an error: [${raw.errorType}] - ${raw.errorMessage}`);
            throw new Error(`Sleep Lambda error [${raw.errorType}]: ${raw.errorMessage}`);
        }

        // Lambda returns an array of daily records (one per day requested)
        const results: any[] = Array.isArray(raw) ? raw : [raw];
        if (results.length === 0) {
            console.error(`[SleepService] Sleep Lambda returned no data for ${imei} on ${date}`);
            throw new Error(`Sleep Lambda returned no data for ${imei} on ${date}`);
        }

        // Lambda omits imei from the result — inject it back before saving.
        // Also override the returned date with our requested anchor date.
        // The Lambda assigns the date to the wake-up day (next morning), but we
        // store records under the anchor date we actually requested to avoid
        // a permanent cache-miss loop in getSleepData.

        // Normalize segments: the Lambda may return it as a JSON string.
        // Parse it here so saveSleep always receives a plain array, preventing
        // double-stringification (JSON.stringify of an already-stringified string).
        const raw1 = results[0];
        let segments = raw1.segments;
        if (typeof segments === "string") {
            try { segments = JSON.parse(segments); } catch { segments = []; }
        }

        console.log(`[SleepService] Sleep Lambda returned data successfully for ${imei} on ${date}. SleepScore: ${raw1.sleepScore}, Minutes: ${raw1.minutes}`);
        return { ...raw1, segments, imei, date } as SleepData;
    },

    async querySleepAvgHeartRate(imei: string, startDate: string, endDate: string) {
        console.log(`[SleepService] querySleepAvgHeartRate called for IMEI: ${imei} from ${startDate} to ${endDate}`);
        const data = await SleepRepo.querySleepAvgHeartrate(imei, startDate, endDate);
        if (data.length === 0) {
            console.log(`[SleepService] No avg sleep heart rate found in cache, fetching full sleep data to backfill.`);
            await this.getSleepData(imei, startDate, endDate);
            return await SleepRepo.querySleepAvgHeartrate(imei, startDate, endDate);
        }
        return data;

    }
}