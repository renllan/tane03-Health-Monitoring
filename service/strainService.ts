import { HeartRateRepo } from "../repository/HeartRate_repo";
import { StrainRepo} from "../repository/strain_repo";
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
        startISODate.setDate(endISODate.getDate()-1); // add one day to get the next day
        const startDateStr = startISODate.toISOString();
        const endDateStr = endISODate.toISOString();
        console.log(`[StrainService] No strain data found for IMEI: ${imei} on ${date}. Calculating from heart rate data between ${startDateStr} and ${endDateStr}.`);
        // get the heartrate data for the given date and imei
        console.log(`[StrainService] Fetching heart rate data for IMEI: ${imei} between ${startDateStr} and ${endDateStr}.`);
        const heartRateData = await HeartRateRepo.getHeartRateByDateRange(imei, startDateStr, endDateStr);
        console.log(`[StrainService] Fetched ${heartRateData.length} heart rate records for IMEI: ${imei} between ${startDateStr} and ${endDateStr}.`);
        if (heartRateData.length < 50) {
            console.log(`[StrainService] No heart rate data found for IMEI: ${imei} on ${date}`);
            throw new Error(`No heart rate data found for IMEI: ${imei} on ${date}`);
        }
        const age = 50;
        const maxHR = 207 - 0.7*age;

        //divide the heartrate into different zones based on the max heart rate
        const zones = {
            zone1: 0, // 50-60% of maxHR
            zone2: 0, // 60-70% of maxHR
            zone3: 0, // 70-80% of maxHR
            zone4: 0, // 80-90% of maxHR
            zone5: 0, // 90-100% of maxHR
        };
        
        for (const hr of heartRateData) {
            console.log(`[StrainService] Processing heart rate value: ${hr.value}`);
            if (hr.value >= 0.5 * maxHR && hr.value < 0.6 * maxHR) {
                console.log(`[StrainService] Heart rate ${hr.value} falls into zone 1 (50-60% of maxHR)`);
                zones.zone1++;
            } else if (hr.value >= 0.6 * maxHR && hr.value < 0.7 * maxHR) {
                console.log(`[StrainService] Heart rate ${hr.value} falls into zone 2 (60-70% of maxHR)`);
                zones.zone2++;
            } else if (hr.value >= 0.7 * maxHR && hr.value < 0.8 * maxHR) {
                console.log(`[StrainService] Heart rate ${hr.value} falls into zone 3 (70-80% of maxHR)`);
                zones.zone3++;
            } else if (hr.value >= 0.8 * maxHR && hr.value < 0.9 * maxHR) {
                console.log(`[StrainService] Heart rate ${hr.value} falls into zone 4 (80-90% of maxHR)`);
                zones.zone4++;
            } else if (hr.value >= 0.9 * maxHR) {
                console.log(`[StrainService] Heart rate ${hr.value} falls into zone 5 (90-100% of maxHR)`);
                zones.zone5++;
            }
        }
        console.log(`[StrainService] Heart rate zones for IMEI: ${imei} on ${date}:`, zones);
        //calculate the strain score based on the time spent in each zone
        const totalTime = heartRateData.length*5; // assuming each heart rate reading is taken every 5 minutes
        const strainScore = (zones.zone1 * 1 + zones.zone2 * 2 *5 + zones.zone3 * 3*5 + zones.zone4 * 4*5 + zones.zone5 * 5 * 5) / totalTime;
        //store the strain score in the database
        //await StrainRepo.saveStrain(imei, date, strainScore);
        console.log(`[StrainService] Calculated strain score for IMEI: ${imei} on ${date} is ${strainScore}`);
        return strainScore;
    }
}