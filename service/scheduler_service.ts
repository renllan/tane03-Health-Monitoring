import { SchedulerRepo } from '../repository/scheduler_repo';

export class SchedulerService {
    private schedulerRepo: SchedulerRepo;

    constructor() {
        this.schedulerRepo = new SchedulerRepo();
    }

    async createOrUpdateEvaluationSchedule(userId: string, userQuery: string, preferredHour: string, preferredMinute: string, timezone: string): Promise<void> {
        // Convert "9:30" to cron(30 9 * * ? *)
        const scheduleExpression = `cron(${preferredMinute} ${preferredHour} * * ? *)`;
        const scheduleName = `HealthCheck-User-${userId}`;

        const scheduleConfig = {
            Name: scheduleName,
            ScheduleExpression: scheduleExpression,
            ScheduleExpressionTimezone: timezone || "UTC", // Support local time!
            Target: {
                Arn: process.env.DETECTION_LAMBDA_ARN,
                RoleArn: process.env.SCHEDULER_ROLE_ARN,
                Input: JSON.stringify({
                    httpMethod: "POST", // Assuming POST for evaluation. Change to GET if needed.
                    path: `/evaluate/${userId}/day`,
                    resource: "/evaluate/{imei}/day",
                    pathParameters: {
                        imei: userId
                    },
                    body: JSON.stringify({ query: userQuery }),
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
