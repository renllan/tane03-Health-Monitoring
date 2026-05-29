import { SchedulerClient, CreateScheduleCommand, UpdateScheduleCommand, DeleteScheduleCommand, GetScheduleCommand } from "@aws-sdk/client-scheduler";

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
    async deleteSchedule(scheduleName: string): Promise<void> {
        await this.schedulerClient.send(new DeleteScheduleCommand({ Name: scheduleName }));
    }

    async getSchedule(scheduleName: string): Promise<any> {
        const response = await this.schedulerClient.send(new GetScheduleCommand({ Name: scheduleName }));
        return response;
    }
}
