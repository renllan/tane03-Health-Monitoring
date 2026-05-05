import { HeartRateRepo } from "../repository/HeartRate_repo";
import { HRV_repo } from "../repository/HRV_repo";
import { HRVData, HRVType } from "../types/HRVType";
import { AppError } from "../utils/AppError";

// ─── Mathematical Core ────────────────────────────────────────────────────────

function convertToRRIntervals(rawData: any[] | null): number[] {
    const data = rawData ? rawData.filter((item: any) => item.value > 0) : [];
    if (data.length < 5) return [];
    return data.map((item: any) => 60000 / item.value);
}

function computeRMSSD(rrIntervals: number[]): number {
    if (rrIntervals.length < 2) return -1;

    let sumSquaredDiffs = 0;
    let validPairs = 0;

    for (let i = 1; i < rrIntervals.length; i++) {
        const diff = rrIntervals[i] - rrIntervals[i - 1];
        sumSquaredDiffs += (diff * diff);
        validPairs++;
    }

    if (validPairs === 0) return -1;
    return Math.sqrt(sumSquaredDiffs / validPairs);
}

function computeSDNN(rrIntervals: number[]): number {
    if (rrIntervals.length < 2) return -1;

    const sumRR = rrIntervals.reduce((a: number, b: number) => a + b, 0);
    const meanRR = sumRR / rrIntervals.length;

    let sumSquaredDiffs = 0;
    for (let i = 0; i < rrIntervals.length; i++) {
        const diff = rrIntervals[i] - meanRR;
        sumSquaredDiffs += (diff * diff);
    }

    const variance = sumSquaredDiffs / (rrIntervals.length - 1);
    return Math.sqrt(variance);
}

// ─── Service Methods ──────────────────────────────────────────────────────────

async function calculateHRV(imei: string, timestamp: string) {
    // 1. Check cache first for BOTH
    const cachedRmssd = await HRV_repo.getLastHourData(imei, timestamp, HRVType.RMSSD);
    const cachedSdnn = await HRV_repo.getLastHourData(imei, timestamp, HRVType.SDNN);

    let rmssd: number | null = cachedRmssd?.rmssd !== undefined ? cachedRmssd.rmssd : null;
    let sdnn: number | null = cachedSdnn?.sdnn !== undefined ? cachedSdnn.sdnn : null;

    // 2. Fetch raw data ONCE if either is missing
    if (rmssd === null || sdnn === null) {
        const rawData = await HeartRateRepo.getLastHourData(imei, timestamp);
        const rrIntervals = convertToRRIntervals(rawData);

        if (rrIntervals.length === 0) {
            // Save -1 to prevent re-querying this empty hour
            if (rmssd === null) await HRV_repo.saveHRV({ imei, timestamp, type: HRVType.RMSSD, value: -1 });
            if (sdnn === null) await HRV_repo.saveHRV({ imei, timestamp, type: HRVType.SDNN, value: -1 });
            throw new AppError(`No valid heart rate data found for device ${imei} at timestamp ${timestamp}`, 404);
        }

        // Calculate missing RMSSD
        if (rmssd === null) {
            let calcRmssd = computeRMSSD(rrIntervals);
            if (calcRmssd > 900) calcRmssd = -1; // Noise threshold
            await HRV_repo.saveHRV({ imei, timestamp, type: HRVType.RMSSD, value: calcRmssd });
            rmssd = calcRmssd;
        }

        // Calculate missing SDNN
        if (sdnn === null) {
            let calcSdnn = computeSDNN(rrIntervals);
            if (calcSdnn > 600) calcSdnn = -1; // Noise threshold
            await HRV_repo.saveHRV({ imei, timestamp, type: HRVType.SDNN, value: calcSdnn });
            sdnn = calcSdnn;
        }
    }

    // 3. Final validation (we don't want to break the pipeline, so we just return the values, 
    // even if they are -1, and let the caller decide how to handle noise)
    if (rmssd === -1 && sdnn === -1) {
        throw new AppError(`HRV values exceeded noise threshold or had insufficient points for device ${imei} at timestamp ${timestamp}`, 422);
    }

    return { rmssd, sdnn };
}

// Provide individual methods for backward compatibility, but wrap them around the unified calculation
async function calculateRMSSD(imei: string, timestamp: string) {
    const { rmssd } = await calculateHRV(imei, timestamp);
    if (rmssd === -1) throw new AppError(`RMSSD value exceeded valid threshold of 900ms. Discarding as noise.`, 422);
    return rmssd;
}

async function calculateSDNN(imei: string, timestamp: string) {
    const { sdnn } = await calculateHRV(imei, timestamp);
    if (sdnn === -1) throw new AppError(`SDNN value exceeded valid threshold of 600ms. Discarding as noise.`, 422);
    return sdnn;
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
        const chunk = allTimestamps.slice(i, i + BATCH_SIZE);

        const batchResults = await Promise.all(
            chunk.map(async (timestamp) => {
                try {
                    const results = await calculateHRV(imei, timestamp);
                    return { timestamp, ...results };
                } catch (error: any) {
                    return null;
                }
            })
        );

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
