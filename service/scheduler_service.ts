import { SchedulerRepo } from '../repository/scheduler_repo';

export class SchedulerService {
    private schedulerRepo: SchedulerRepo;

    constructor() {
        this.schedulerRepo = new SchedulerRepo();
    }

    async createOrUpdateEvaluationSchedule(imei: string, preferredHour: string, preferredMinute: string, timezone: string): Promise<void> {
        // Convert "9:30" to cron(30 9 * * ? *)
        const scheduleExpression = `cron(${preferredMinute} ${preferredHour} * * ? *)`;
        const scheduleName = `HealthCheck-User-${imei}`;

        console.log(`[SchedulerService] Initiating create/update schedule for IMEI: ${imei}. Preferred time: ${preferredHour}:${preferredMinute} (${timezone || 'UTC'})`);
        console.log(`[SchedulerService] Target Schedule Expression: ${scheduleExpression}, Name: ${scheduleName}`);

        const scheduleConfig = {
            Name: scheduleName,
            ScheduleExpression: scheduleExpression,
            ScheduleExpressionTimezone: timezone || "UTC", // Support local time!
            Target: {
                Arn: process.env.HEALTH_MONITORING_LAMBDA_ARN,
                RoleArn: process.env.SCHEDULER_ROLE_ARN,
                Input: JSON.stringify({
                    source: "scheduler",
                    action: "evaluateDay",
                    imei: imei
                }),
            },
            FlexibleTimeWindow: { Mode: "OFF" as const },
            ActionAfterCompletion: "NONE" as const
        };

        try {
            await this.schedulerRepo.createSchedule(scheduleConfig);
            console.log(`[SchedulerService] Successfully created schedule: ${scheduleName}`);
        } catch (err: any) {
            if (err.name === "ConflictException") {
                console.log(`[SchedulerService] Schedule conflict detected (already exists). Attempting to update schedule: ${scheduleName}`);
                try {
                    await this.schedulerRepo.updateSchedule(scheduleConfig);
                    console.log(`[SchedulerService] Successfully updated schedule: ${scheduleName}`);
                } catch (updateErr: any) {
                    console.error(`[SchedulerService] Failed to update existing schedule: ${updateErr.message}`, updateErr);
                    throw updateErr;
                }
            } else {
                console.error(`[SchedulerService] Failed to create schedule: ${err.message}`, err);
                throw err;
            }
        }
    }

    async deleteEvaluationSchedule(imei: string): Promise<void> {
        const scheduleName = `HealthCheck-User-${imei}`;
        console.log(`[SchedulerService] Initiating deletion for schedule: ${scheduleName} (IMEI: ${imei})`);
        try {
            await this.schedulerRepo.deleteSchedule(scheduleName);
            console.log(`[SchedulerService] Successfully deleted schedule: ${scheduleName}`);
        } catch (err: any) {
            console.error(`[SchedulerService] Failed to delete schedule ${scheduleName}: ${err.message}`, err);
            throw err;
        }
    }

    async getSchedule(imei: string): Promise<any> {
        const scheduleName = `HealthCheck-User-${imei}`;
        console.log(`[SchedulerService] Fetching schedule: ${scheduleName} (IMEI: ${imei})`);
        try {
            const schedule = await this.schedulerRepo.getSchedule(scheduleName);
            console.log(`[SchedulerService] Successfully retrieved schedule: ${scheduleName}`);
            return schedule;
        } catch (err: any) {
            console.error(`[SchedulerService] Failed to retrieve schedule ${scheduleName}: ${err.message}`, err);
            throw err;
        }
    }
}
