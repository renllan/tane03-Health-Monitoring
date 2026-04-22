import { SleepData } from "../types/sleepDataType"
import { SleepRepo } from "../repository/sleep_repo"
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda"
import { DeviceGroupRepo } from "../repository/DeviceGroup_repo"

const lambdaClient = new LambdaClient({ region: process.env.US_REGION });
export const SleepService = {
    async getSleepData(imei: string, startDate: string, endDate: string) {
        const sleepData: SleepData[] | null = await SleepRepo.querySleepData(imei, startDate, endDate);
        const days: number = (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24) + 1;
        if (sleepData.length === days) {
            return sleepData;
        }

        const { group } = await DeviceGroupRepo.getDeviceGroup(imei);
        //TODO: figure out how to get the timezone
        const timezone = group
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
        const calculated: SleepData[] = await Promise.all(
            missingDates.map(date => this.calculateSleepData(imei, date, timezone))
        );
        for (const day of calculated) {
            await SleepRepo.saveSleep(day);
        }
        // 5. Merge cached + newly calculated, sort by date ascending
        return [...sleepData as SleepData[], ...calculated]
            .sort((a, b) => a.date.localeCompare(b.date));
    },


    async getSleepDataByDate(imei: string, date: string) {
        const sleepData: SleepData | null = await SleepRepo.getSleepData(imei, date);
        if (sleepData) {
            return sleepData;
        }

        const { group } = await DeviceGroupRepo.getDeviceGroup(imei);
        const timezone = group;
        //get the timezone of current imei
        //TODO
        const newSleepData = await this.calculateSleepData(imei, date, timezone);
        //save them
        await SleepRepo.saveSleep(newSleepData);
        return newSleepData;
    },

    async calculateSleepData(imei: string, date: string, timezone: string): Promise<void> {

        const command = new InvokeCommand({
            FunctionName: process.env.Sleep_Lambda_Name,
            InvocationType: "Event",        // async fire-and-forget
            Payload: JSON.stringify({
                imei: imei,
                date: date,
                timezone: timezone,
            }),
        });
        await lambdaClient.send(command);   // returns 202, no payload
    }
}