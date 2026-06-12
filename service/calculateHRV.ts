import { SleepService } from "./sleepService.js";
import { HRV_repo } from "../repository/HRV_repo";
import { HRVData, HRVType, HRVResult } from "../types/HRVType";
import { SleepData, SleepSegment, HeartRateData } from "../types/sleepDataType";
import { AppError } from "../utils/AppError";

// ─── Mathematical Core ────────────────────────────────────────────────────────

/**
 * Converts a list of HR samples (bpm) into RR intervals (ms).
 * Filters out zero/invalid readings and requires at least 5 points.
 */
function hrListToRRIntervals(hrList: { timestamp: string; value: number }[]): number[] {
    // 1. Deduplicate by timestamp (keeps first occurrence)
    const seen = new Set<string>();
    const deduped = hrList.filter(h => {
        if (seen.has(h.timestamp)) return false;
        seen.add(h.timestamp);
        return true;
    });

    // 2. Sort chronologically (required for correct successive differences in RMSSD)
    deduped.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // 3. Filter out invalid HR values and require at least 5 points
    const valid = deduped.filter(h => h.value > 0);
    if (valid.length < 5) return [];

    return valid.map(h => 60000 / h.value);
}


function computeSDNN(rrIntervals: number[]): number {
    if (rrIntervals.length < 2) return -1;

    const mean = rrIntervals.reduce((a, b) => a + b, 0) / rrIntervals.length;
    const variance =
        rrIntervals.reduce((sum, rr) => sum + (rr - mean) ** 2, 0) /
        (rrIntervals.length - 1);
    return Math.sqrt(variance);
}

// RMSSD = sqrt( mean of squared successive differences )
// i.e. sqrt( sum((RR[i] - RR[i-1])^2) / (n-1) )
function computeRMSSD(rrIntervals: number[]): number {
    if (rrIntervals.length < 2) return -1;
    let sumSqDiff = 0;
    for (let i = 1; i < rrIntervals.length; i++) {
        const diff = rrIntervals[i] - rrIntervals[i - 1];
        sumSqDiff += diff * diff;
    }
    return Math.sqrt(sumSqDiff / (rrIntervals.length - 1));
}
// ─── Service Methods ──────────────────────────────────────────────────────────

/**
 * Calculate HRV for one night's sleep.
 *
 * - RMSSD: taken directly from the sleep lambda result (sleepData.rmssd).
 * - SDNN:  computed locally from the HR samples in sleepData.segments.
 *
 * @param imei    Device identifier
 * @param date    "YYYY-MM-DD" — the anchor date of the sleep record
 */
async function calculateHRV(imei: string, date: string) {
    // 1. Check the HRV cache first (keyed by date string, not Unix timestamp)
    const rmssd = await calculateRMSSD(imei, date);
    const sdnn = await calculateSDNN(imei, date);
    return { rmssd, sdnn };
}

// Backward-compatible individual accessors
async function calculateRMSSD(imei: string, date: string) {
    console.log(`[HRVService] calculateRMSSD called for IMEI: ${imei}, Date: ${date}`);
    const existing = await HRV_repo.getHRV(imei, date, HRVType.RMSSD);
    if (existing) {
        console.log(`[HRVService] Cache hit in HRV_repo for RMSSD. IMEI: ${imei}, Date: ${date}`);
        return existing;
    }

    console.log(`[HRVService] Cache miss in HRV_repo for RMSSD. IMEI: ${imei}, Date: ${date}. Fetching sleep records.`);
    const sleep: SleepData[] = await SleepService.getSleepData(imei, date, date);

    if (!sleep.length || !sleep[0]) {
        console.warn(`[HRVService] [calculateRMSSD] No sleep record found for ${imei} on ${date}`);
        return null;
    }

    const rawSegs0 = sleep[0].segments;
    const segments0: SleepSegment[] = Array.isArray(rawSegs0) ? rawSegs0 : JSON.parse(rawSegs0 as string);

    const hrData = segments0.flatMap(seg => seg.hrList ?? []);
    console.log(`[HRVService] Flat mapped ${hrData.length} heart rate records from sleep segments.`);

    const hourlyGroups: Record<number, HeartRateData[]> = {};
    hrData.forEach(item => {
        const hour = new Date(item.timestamp).getHours();
        if (!hourlyGroups[hour]) hourlyGroups[hour] = [];
        hourlyGroups[hour].push(item);
    });

    const mappedValues: HRVResult[] = Object.keys(hourlyGroups).map(hourKey => {
        const hour = parseInt(hourKey, 10);
        const currentHrData = hourlyGroups[hour];
        const rrIntervals = hrListToRRIntervals(currentHrData);
        const rmssdValue = computeRMSSD(rrIntervals);
        const hourStr = String(hour).padStart(2, "0");
        const timestamps = `${date}T${hourStr}:00:00.000Z`;
        return { timestamps, value: rmssdValue };
    });

    if (!mappedValues.length) {
        console.warn(`[HRVService] No hourly groups resolved for RMSSD computation. IMEI: ${imei}, Date: ${date}`);
        return null;
    }

    const result: HRVData = {
        imei,
        timestamp: date,
        type: HRVType.RMSSD,
        values: mappedValues
    };
    console.log(`[HRVService] Successfully computed RMSSD for ${mappedValues.length} hourly intervals. Saving to DB.`);
    await HRV_repo.saveHRV(result);
    return result;
}

async function calculateSDNN(imei: string, date: string) {
    console.log(`[HRVService] calculateSDNN called for IMEI: ${imei}, Date: ${date}`);
    const existing = await HRV_repo.getHRV(imei, date, HRVType.SDNN);
    if (existing) {
        console.log(`[HRVService] Cache hit in HRV_repo for SDNN. IMEI: ${imei}, Date: ${date}`);
        return existing;
    }

    console.log(`[HRVService] Cache miss in HRV_repo for SDNN. IMEI: ${imei}, Date: ${date}. Fetching sleep records.`);
    const sleep: SleepData[] = await SleepService.getSleepData(imei, date, date);
    if (!sleep.length || !sleep[0]) {
        console.warn(`[HRVService] [calculateSDNN] No sleep record found for ${imei} on ${date}`);
        return null;
    }

    const rawSegs1 = sleep[0].segments;
    const segments1: SleepSegment[] = Array.isArray(rawSegs1) ? rawSegs1 : JSON.parse(rawSegs1 as string);
    const hrData = segments1.flatMap(seg => seg.hrList);
    console.log(`[HRVService] Flat mapped ${hrData.length} heart rate records from sleep segments for SDNN.`);

    //split this by the hour
    const hourlyGroups: Record<number, HeartRateData[]> = {};

    hrData.forEach(item => {
        const hour = new Date(item.timestamp).getHours(); // Extracts 0-23
        if (!hourlyGroups[hour]) {
            hourlyGroups[hour] = [];
        }
        hourlyGroups[hour].push(item);
    });
    //compute sdnn for each hour (it has its own function) (convert to rr interval also have its own function)
    const mappedValues: HRVResult[] = Object.keys(hourlyGroups).map(hourKey => {
        const hour = parseInt(hourKey, 10);
        const currentHrData = hourlyGroups[hour];
        // Convert the current hour's heart rate list to RR intervals
        const rrIntervals = hrListToRRIntervals(currentHrData);

        // Compute the SDNN value for this specific hour
        const sdnnValue = computeSDNN(rrIntervals);
        const hourStr = String(hour).padStart(2, "0");
        const timestamps = `${date}T${hourStr}:00:00.000Z`;

        return {
            timestamps,
            value: sdnnValue
        };
    });

    if (!mappedValues.length) {
        console.warn(`[HRVService] No hourly groups resolved for SDNN computation. IMEI: ${imei}, Date: ${date}`);
        return null;
    }

    const result: HRVData = {
        imei,
        timestamp: date,
        type: HRVType.SDNN,
        values: mappedValues
    };
    console.log(`[HRVService] Successfully computed SDNN for ${mappedValues.length} hourly intervals. Saving to DB.`);
    await HRV_repo.saveHRV(result);
    return result;
}


export const HRVService = {
    calculateRMSSD,
    calculateSDNN,
    calculateHRV,
};
