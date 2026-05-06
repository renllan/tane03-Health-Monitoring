# TanE03 Health Monitoring

A backend service built with Node.js, Express, and TypeScript that processes long-term health metrics (Heart Rate Variability, Resting Heart Rate, Sleep Scores, and Sleep Duration). This project is designed to run locally for development and is containerized via Docker for production deployment to AWS Lambda.

## Required Software

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher recommended)
- **npm** (comes with Node.js)
- **Docker** (Required for building the production container image)
- **AWS CLI** (Required to configure AWS credentials locally and interact with DynamoDB/Lambda/EventBridge)
- **AWS IAM user** with access to DynamoDB, Lambda, and EventBridge

---

## Repository Setup

Follow these steps to get the project running locally:

### 1. Clone the repository

```bash
git clone https://github.com/renllan/tane03-Health-Monitoring.git
cd tane03_long_term_health_monitoring
```

### 2. Install Dependencies

Install all required Node.js packages (including TypeScript and AWS SDKs):

```bash
npm install
```

### 3. Environment Variables

Create a `.env` file in the root directory of the project. You will need to configure your AWS settings and table names.

Example `.env` file:

```env
AWS_REGION=ap-northeast-1
HEALTH_MONITORING_LAMBDA_ARN=arn:aws:lambda:ap-northeast-1:<ACCOUNT_ID>:function:tane03-long-term-health-monitoring
SCHEDULER_ROLE_ARN=arn:aws:iam::<ACCOUNT_ID>:role/SchedulerRole
BASE_URL=http://localhost:3000
# Add your DynamoDB table names here
```

### 4. Build the Project

Because this is a TypeScript project, you must compile it into JavaScript before running it:

```bash
npx tsc
```

*This will generate a `dist/` directory containing the compiled JavaScript.*

### 5. Run Locally

To test the API endpoints locally using Express:

```bash
npm start
```

*The server will start (defaulting to port 3000).*

### 6. Building and Running the Docker Container Locally

To test or debug the containerized environment on your local machine, the easiest way is to use Docker Compose. This automatically builds the multi-stage Dockerfile and maps your `.env` variables into the Lambda emulator:

```bash
docker compose up lambda --build
```

It is recommended to build the docker container for testing purposes instead of using `npm start`. The container is the most similiar to the AWS Lambda environment.

Once the container is running on your machine, you can trigger the local Lambda emulator by sending it a mocked JSON payload using `curl`:

```bash
curl -X POST "http://localhost:9000/2015-03-31/functions/function/invocations" -d '{"path": "/api/evaluation/12345", "httpMethod": "GET"}'
```

---

## CI/CD Pipeline (Automated Deployment)

This repository uses **GitHub Actions** for Continuous Integration and Continuous Deployment (CI/CD).

Whenever code is merged into the `main` branch, the GitHub Actions workflow will automatically:

1. Check out the latest code.
2. Configure AWS credentials securely.
3. Build the Docker image using the `docker/Dockerfile`.
4. Push the new image to AWS ECR.
5. Trigger an update on the AWS Lambda function to immediately deploy the latest version.

This means you only need to run the manual Docker steps for debugging or deploying from a local branch. Production deployments happen automatically on merge!

---

## Project Architecture: The 4-Layer Structure

This application strictly follows a **4-Layer Architecture** (often called a layered or tiered architecture). This structure separates concerns, making the code highly maintainable, scalable, and easy to test.

### 1. Router Layer (`router/`)

**Purpose:** Maps HTTP requests (GET, POST, etc.) and URLs to the correct controller.

- **What it does:** It acts as the traffic cop. It defines paths like `/api/evaluate/:imei` and forwards the incoming request to the appropriate function in the Controller layer. It can also apply middleware (like Authentication).
- **Rule:** There should be zero business logic or data manipulation here.

### 2. Controller Layer (`controller/`)

**Purpose:** Handles the HTTP Request and Response cycle.

- **What it does:** It extracts parameters from the request (`req.params`, `req.body`), validates them briefly, and passes them to the Service layer. Once the Service layer finishes its work, the Controller formats the response and sends it back to the client (`res.status(200).json(...)`).
- **Rule:** The controller should not directly query the database or calculate health metrics.

### 3. Service Layer (`service/`)

**Purpose:** Contains the core **Business Logic**.

- **What it does:** This is where the actual work happens. It calculates sliding windows, evaluates health metrics (like RMSSD, Sleep Scores), integrates with third-party APIs (like AAASWatch), and dictates the rules of the application.
- **Rule:** It should not know anything about HTTP requests (`req` or `res`). If it needs data, it asks the Repository layer.

### 4. Repository Layer (`repository/`)

**Purpose:** Handles all Database and Data Access logic.

- **What it does:** It is strictly responsible for communicating with DynamoDB (or any other database). It executes `query`, `scan`, `putItem`, and `updateItem` commands.
- **Rule:** By keeping AWS SDK commands here, the rest of the app doesn't need to know *how* data is stored. If you ever switch from DynamoDB to Postgres, you only have to rewrite the Repository layer!
