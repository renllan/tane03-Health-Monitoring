# Use the official Node.js Alpine image for a lightweight footprint
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json first to leverage Docker cache
COPY package*.json ./

# Install project dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Expose the port your Express app runs on
EXPOSE 3000

# Start the application using server.js
CMD ["node", "server.js"]
