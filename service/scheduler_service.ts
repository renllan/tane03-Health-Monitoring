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

        const scheduleConfig = {
            Name: scheduleName,
            ScheduleExpression: scheduleExpression,
            ScheduleExpressionTimezone: timezone || "UTC", // Support local time!
            Target: {
                Arn: process.env.HEALTH_MONITORING_LAMBDA_ARN,
                RoleArn: process.env.SCHEDULER_ROLE_ARN,
                Input: JSON.stringify({
                    httpMethod: "POST", // Assuming POST for evaluation. Change to GET if needed.
                    path: `/evaluate/${imei}/day`,
                    resource: "/evaluate/{imei}/day",
                    pathParameters: {
                        imei: imei
                    },
                    body: JSON.stringify({}),
                    requestContext: {}
                }),
            },
            FlexibleTimeWindow: { Mode: "OFF" as const },
            ActionAfterCompletion: "NONE" as const
        };

        try {
            // Try to update if it exists, otherwise create
            await this.schedulerRepo.createSchedule(scheduleConfig);
        } catch (err: any) {
            if (err.name === "ConflictException") {
                await this.schedulerRepo.updateSchedule(scheduleConfig);
            } else {
                throw err;
            }
        }
    }
}
