import { HeartRateRepo } from "../repository/HeartRate_repo";
import { StrainRepo } from "../repository/strain_repo";
import { AppError } from "../utils/AppError";
export class StrainService {

    //
    async getStrain(imei: string, date: string): Promise<any> {

        //fetch strain from db first, then if not found, calculate it from the heartrate data

        //const strainData = await StrainRepo.getStrain(imei, date);
        // if(strainData){
        //     return strainData;
        // }

        const startISODate = new Date(date);
        const endISODate = new Date(startISODate);
        startISODate.setDate(endISODate.getDate() - 1); // add one day to get the next day
        const startDateStr = startISODate.toISOString();
        const endDateStr = endISODate.toISOString();
        // get the heartrate data for the given date and imei
        const heartRateData = await HeartRateRepo.getHeartRateByDateRange(imei, startDateStr, endDateStr);
        if (heartRateData.length < 50) {
            console.log(`[StrainService] Insufficient heart rate data for IMEI: ${imei} on ${date}`);

            const error = new AppError(`Insufficient heart rate data to calculate strain (${heartRateData.length}/50 points)`, 422);
            throw error;
        }
        const age = 50;
        const maxHR = 207 - 0.7 * age;

        //divide the heartrate into different zones based on the max heart rate
        const zones = {
            zone1: 0, // 50-60% of maxHR
            zone2: 0, // 60-70% of maxHR
            zone3: 0, // 70-80% of maxHR
            zone4: 0, // 80-90% of maxHR
            zone5: 0, // 90-100% of maxHR
        };

        for (const hr of heartRateData) {
            if (hr.value >= 0.5 * maxHR && hr.value < 0.6 * maxHR) {
                zones.zone1++;
            } else if (hr.value >= 0.6 * maxHR && hr.value < 0.7 * maxHR) {
                zones.zone2++;
            } else if (hr.value >= 0.7 * maxHR && hr.value < 0.8 * maxHR) {
                zones.zone3++;
            } else if (hr.value >= 0.8 * maxHR && hr.value < 0.9 * maxHR) {
                zones.zone4++;
            } else if (hr.value >= 0.9 * maxHR) {
                zones.zone5++;
            }
        }
        //calculate the strain score based on the time spent in each zone
        const totalTime = heartRateData.length * 5; // assuming each heart rate reading is taken every 5 minutes
        const strainScore = (zones.zone1 * 1 + zones.zone2 * 2 * 5 + zones.zone3 * 3 * 5 + zones.zone4 * 4 * 5 + zones.zone5 * 5 * 5) / totalTime;
        //store the strain score in the database
        //await StrainRepo.saveStrain(imei, date, strainScore);
        return strainScore;
    }
}