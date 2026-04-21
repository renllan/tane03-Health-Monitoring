export class AppError extends Error {
    public status: number;

    constructor(message: string, status: number) {
        super(message);
        this.status = status;

        // This ensures the custom error maintains a proper stack trace in Node
        Object.setPrototypeOf(this, new.target.prototype);
        Error.captureStackTrace(this);
    }
}