import { Request, Response } from 'express';
import { SchedulerService } from '../service/scheduler_service';

export class SchedulerController {
    private schedulerService: SchedulerService;

    constructor() {
        this.schedulerService = new SchedulerService();
    }

    scheduleEvaluation = async (req: Request, res: Response): Promise<void> => {
        try {
            // Typically, req.body or event.body contains the payload
            // Since the original was an API Gateway lambda with event.body,
            // mapping it to Express req.body for a typical Node framework setup.
            const { userId, userQuery, preferredHour, preferredMinute, timezone } = req.body;

            if (!userId || !preferredHour || !preferredMinute) {
                res.status(400).json({ error: "Missing required fields" });
                return;
            }

            await this.schedulerService.createOrUpdateEvaluationSchedule(
                userId,
                userQuery,
                preferredHour,
                preferredMinute,
                timezone
            );

            res.status(200).json({ message: "Schedule updated successfully" });
        } catch (error) {
            console.error("Error updating schedule:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    };
}
