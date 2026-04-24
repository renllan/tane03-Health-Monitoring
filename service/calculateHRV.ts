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
    const rawData = await HeartRateRepo.getLastHourData(imei, timestamp);
    const data = rawData ? rawData.filter((item: any) => item.value > 0) : [];

    if (data.length < 5) {
        const HRV_data: HRVData = {
            imei: imei,
            timestamp: timestamp,
            type: HRVType.RMSSD,
            value: -1
        }
        await HRV_repo.saveHRV(HRV_data);
        throw new AppError(`No valid heart rate data found for device ${imei} at timestamp ${timestamp}`, 404);
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

    if (rmssd > 200) {
        const HRV_data: HRVData = {
            imei: imei,
            timestamp: timestamp,
            type: HRVType.RMSSD,
            value: -1
        };
        await HRV_repo.saveHRV(HRV_data);
        throw new AppError(`RMSSD value (${rmssd.toFixed(2)}) exceeded valid threshold of 100ms for device ${imei}. Discarding as noise.`, 422);
    }

    // Save RMSSD
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
    const rawData = await HeartRateRepo.getLastHourData(imei, timestamp);
    const data = rawData ? rawData.filter((item: any) => item.value > 0) : [];

    if (data.length < 5) {
        const HRV_data: HRVData = {
            imei: imei,
            timestamp: timestamp,
            type: HRVType.SDNN,
            value: -1
        }
        await HRV_repo.saveHRV(HRV_data);
        throw new AppError(`No valid heart rate data found for device ${imei} at timestamp ${timestamp}`, 404);
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

    if (sdnn > 200) {
        const hrv_data: HRVData = {
            imei: imei,
            timestamp: timestamp,
            type: HRVType.SDNN,
            value: -1
        };
        await HRV_repo.saveHRV(hrv_data);
        throw new AppError(`SDNN value (${sdnn.toFixed(2)}) exceeded valid threshold of 200ms for device ${imei}. Discarding as noise.`, 422);
    }

    // Save SDNN
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

async function calculateHRVForTimeRange(imei: string, startTime: string, endTime: string) {
    const MS_PER_HOUR = 1000 * 60 * 60;
    const BATCH_SIZE = 24; // Process 24 hours at a time

    // 1. Rounding Logic
    const roundedStartTs = Math.floor(new Date(startTime).getTime() / MS_PER_HOUR) * MS_PER_HOUR;
    const roundedEndTs = Math.ceil(new Date(endTime).getTime() / MS_PER_HOUR) * MS_PER_HOUR;

    // 2. Generate all timestamps (in Unix SECONDS, as strings)
    const allTimestamps: string[] = [];
    for (let ts = roundedStartTs; ts <= roundedEndTs; ts += MS_PER_HOUR) {
        allTimestamps.push(String(ts / 1000));
    }

    const finalResults: any[] = [];

    // 3. Batch Processing Loop
    for (let i = 0; i < allTimestamps.length; i += BATCH_SIZE) {
        // Create a chunk of timestamps
        const chunk = allTimestamps.slice(i, i + BATCH_SIZE);

        // Process the current batch in parallel
        const batchResults = await Promise.all(
            chunk.map(async (timestamp) => {
                try {
                    const results = await calculateHRV(imei, timestamp);
                    return { timestamp, ...results };
                } catch (error: any) {
                    // Log the error but don't stop the batch
                    console.warn(`[Batch Error] imei: ${imei}, ts: ${timestamp} - ${error.message}`);
                    return null;
                }
            })
        );

        // Filter out failures and add to final list
        finalResults.push(...batchResults.filter(r => r !== null));
    }

    return finalResults;
}

export const HRVService = {
    calculateRMSSD,
    calculateSDNN,
    calculateHRV,
    calculateHRVForTimeRange,
};
