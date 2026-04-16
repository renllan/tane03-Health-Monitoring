# Use the official AWS Lambda Node.js 20 runtime image
FROM public.ecr.aws/lambda/nodejs:20

# Copy package.json and package-lock.json first to leverage Docker cache
COPY package*.json ${LAMBDA_TASK_ROOT}/

# Install project dependencies
RUN npm install

# Copy the rest of the application code
COPY . ${LAMBDA_TASK_ROOT}/

# Point Lambda to the handler in lambda.js
CMD ["lambda.handler"]
