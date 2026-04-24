import { SleepData } from "../types/sleepDataType"
import { SleepRepo } from "../repository/sleep_repo"
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda"
import { DeviceGroupRepo } from "../repository/DeviceGroup_repo"

const lambdaClient = new LambdaClient({ region: process.env.US_REGION });
export const SleepService = {
    //get the sleep data from the repo if the date range has all the data
    //if not, calculate the missing data and save them to the repo
    //then return the full data
    //if the date range has no data, calculate the full data and save them to the repo    
    async getSleepData(imei: string, startDate: string, endDate: string) {
        const sleepData: SleepData[] | null = await SleepRepo.querySleepData(imei, startDate, endDate);
        const days: number = (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24) + 1;
        if (sleepData.length === days) {
            return sleepData;
        }

        const { group } = await DeviceGroupRepo.getDeviceGroup(imei);
        //TODO: figure out how to get the timezone
        const timezone = '';
        //get the timezone
        //find the date that is not included
        //calculate the sleep data for that date
        //save them        
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

        // 4. Calculate and save each missing date
        const calculated = await Promise.all(
            missingDates.map(date => this.calculateSleepData(imei, date, timezone))
        );

        for (const day of calculated) {
            await SleepRepo.saveSleep(day);
        }
        // 5. Merge cached + newly calculated, sort by date ascending
        return [...sleepData as SleepData[], ...calculated]
            .sort((a, b) => a.date.localeCompare(b.date));
    },


    //get the sleep data from the repo if the date has all the data
    //if not, calculate the missing data and save them to the repo
    //then return the full data
    //if the date range has no data, calculate the full data and save them to the repo
    async getSleepDataByDate(imei: string, date: string) {
        const sleepData: SleepData | null = await SleepRepo.getSleepData(imei, date);
        if (sleepData) {
            return sleepData;
        }

        const { group } = await DeviceGroupRepo.getDeviceGroup(imei);
        const timezone = '';
        //get the timezone of current imei
        //TODO
        const newSleepData = await this.calculateSleepData(imei, date, timezone);
        //save them
        console.log(newSleepData);
        await SleepRepo.saveSleep(newSleepData);
        return newSleepData;
    },
    //calculate the sleep data for the given date and time zone
    //invoke the sleep lambda to calculate the sleep data
    //return the sleep data
    async calculateSleepData(imei: string, date: string, timezone: string): Promise<SleepData> {
        const command = new InvokeCommand({
            FunctionName: process.env.Sleep_Lambda_Name,
            InvocationType: "RequestResponse",
            // detectSleepSegments reads from event.arguments.
            // anchorDate is the target date at 18:00; days=1 returns only that day.
            Payload: JSON.stringify({
                arguments: {
                    deviceId: imei,
                    anchorDate: `${date}T18:00:00Z`,
                    days: 1,
                }
            }),
        });
        const response = await lambdaClient.send(command);
        const raw = JSON.parse(Buffer.from(response.Payload!).toString());

        // Lambda execution errors return { errorType, errorMessage }
        if (raw?.errorType) {
            throw new Error(`Sleep Lambda error [${raw.errorType}]: ${raw.errorMessage}`);
        }

        // Lambda returns an array of daily records (one per day requested)
        const results: any[] = Array.isArray(raw) ? raw : [raw];
        if (results.length === 0) {
            throw new Error(`Sleep Lambda returned no data for ${imei} on ${date}`);
        }

        // Lambda omits imei from the result — inject it back before saving
        return { ...results[0], imei } as SleepData;
    }

}