import { SchedulerClient, CreateScheduleCommand, UpdateScheduleCommand } from "@aws-sdk/client-scheduler";

export class SchedulerRepo {
    private schedulerClient: SchedulerClient;

    constructor() {
        this.schedulerClient = new SchedulerClient({});
    }

    async createSchedule(scheduleConfig: any): Promise<void> {
        await this.schedulerClient.send(new CreateScheduleCommand(scheduleConfig));
    }

    async updateSchedule(scheduleConfig: any): Promise<void> {
        await this.schedulerClient.send(new UpdateScheduleCommand(scheduleConfig));
    }
}
