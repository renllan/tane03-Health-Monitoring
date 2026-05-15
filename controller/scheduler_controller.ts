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
            const { imei } = req.params;
            const { preferredHour, preferredMinute, timezone } = req.body;

            if (!imei || !preferredHour || !preferredMinute || !timezone) {
                res.status(400).json({ error: "Missing required fields" });
                return;
            }

            await this.schedulerService.createOrUpdateEvaluationSchedule(
                imei,
                preferredHour,
                preferredMinute,
                timezone
            );

            res.status(200).json({ message: "Schedule updated successfully" });
            console.log("Schedule updated successfully");
        } catch (error) {
            console.log(error);
            console.error("Error updating schedule:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    };

    deleteSchedule = async (req: Request, res: Response): Promise<void> => {
        try {
            const { imei } = req.params;

            if (!imei) {
                res.status(400).json({ error: "Missing required fields" });
                return;
            }

            await this.schedulerService.deleteEvaluationSchedule(imei);

            res.status(200).json({ message: "Schedule deleted successfully" });
            console.log("Schedule deleted successfully");
        } catch (error) {
            console.log(error);
            console.error("Error deleting schedule:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    };
}
