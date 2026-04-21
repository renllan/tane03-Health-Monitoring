import { HeartRateRepo } from "../repository/HeartRate_repo";
import { HRV_repo } from "../repository/HRV_repo";
import { HRVData, HRVType } from "../types/HRVType";
import { AppError } from "../utils/AppError";

async function calculateRMSSD(imei: string, timestamp: string) {
    // 1. Check if we already calculated this HRV to avoid duplicate work
    const hrvData = await HRV_repo.getLastHourData(imei, timestamp, HRVType.RMSSD);
    if (hrvData && hrvData.rmssd) {
        return hrvData.rmssd;
    }

    // 2. Fetch the last hour of heart rate data
    const data = await HeartRateRepo.getLastHourData(imei, timestamp);
    if (!data || data.length < 5) {
        throw new AppError(`No heart rate data found for device ${imei} at timestamp ${timestamp}`, 404);
    }

    // 3. Convert BPM to RR intervals in milliseconds
    // Formula: RR (ms) = 60,000 / BPM
    const rrIntervals = data.map((item: any) => 60000 / item.value);

    // 4. Calculate RMSSD (Root Mean Square of Successive Differences)
    let sumSquaredDiffs = 0;
    let validPairs = 0;

    for (let i = 1; i < rrIntervals.length; i++) {
        // Find successive difference
        const diff = rrIntervals[i] - rrIntervals[i - 1];
        // Square the difference and add to sum
        sumSquaredDiffs += (diff * diff);
        validPairs++;
    }

    if (validPairs === 0) throw new AppError(`Insufficient data points to calculate RMSSD for device ${imei}. Need at least 2 points.`, 422);

    // Divide by N and take the square root
    const rmssd: number = Math.sqrt(sumSquaredDiffs / validPairs);

    // TODO: You will need to build the save logic in your HRV_repo!
    // await HRV_repo.saveRMSSD(imei, timestamp, rmssd);
    const HRV_data: HRVData = {
        imei: imei,
        timestamp: timestamp,
        type: HRVType.RMSSD,
        value: rmssd
    }
    await HRV_repo.saveHRV(HRV_data);
    return rmssd;
}

async function calculateSDNN(imei: string, timestamp: string) {
    // 1. Check if we already calculated this
    const hrvData = await HRV_repo.getLastHourData(imei, timestamp, HRVType.SDNN);
    if (hrvData && hrvData.sdnn) {
        return hrvData.sdnn;
    }

    // 2. Fetch the last hour of heart rate data
    const data = await HeartRateRepo.getLastHourData(imei, timestamp);
    if (!data || data.length < 5) {
        throw new AppError(`No heart rate data found for device ${imei} at timestamp ${timestamp}`, 404);
    }

    // 3. Convert BPM to RR intervals in milliseconds
    const rrIntervals = data.map((item: any) => 60000 / item.value);

    // 4. Calculate Mean RR
    const sumRR = rrIntervals.reduce((a: number, b: number) => a + b, 0);
    const meanRR = sumRR / rrIntervals.length;

    // 5. Calculate SDNN (Standard Deviation of NN intervals)
    let sumSquaredDiffs = 0;
    for (let i = 0; i < rrIntervals.length; i++) {
        const diff = rrIntervals[i] - meanRR;
        sumSquaredDiffs += (diff * diff);
    }

    // Standard deviation (sample size N-1)
    const variance = sumSquaredDiffs / (rrIntervals.length - 1);
    const sdnn = Math.sqrt(variance);

    // TODO: You will need to build the save logic in your HRV_repo!
    // await HRV_repo.saveSDNN(imei, timestamp, sdnn);
    const hrv_data: HRVData = {
        imei: imei,
        timestamp: timestamp,
        type: HRVType.SDNN,
        value: sdnn
    }
    await HRV_repo.saveHRV(hrv_data);
    return sdnn;
}

async function calculateHRV(imei: string, timestamp: string) {
    const rmssd = await calculateRMSSD(imei, timestamp);
    const sdnn = await calculateSDNN(imei, timestamp);
    return { rmssd, sdnn };
}


export const HRVService = {
    calculateRMSSD,
    calculateSDNN,
    calculateHRV,
};
