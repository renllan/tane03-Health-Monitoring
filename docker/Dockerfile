# Stage 1: Build stage
FROM public.ecr.aws/lambda/nodejs:20 AS builder
WORKDIR /usr/app

# Install all dependencies including TypeScript
COPY package*.json ./
RUN npm install

# Copy source and compile
COPY . .
RUN npx tsc

# Stage 2: Production stage
FROM public.ecr.aws/lambda/nodejs:20
WORKDIR ${LAMBDA_TASK_ROOT}

# Copy only the compiled JS from the builder stage
COPY --from=builder /usr/app/dist ./dist
# Copy package files and install ONLY production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Point to the compiled handler in the dist folder
CMD ["dist/lambda.handler"]