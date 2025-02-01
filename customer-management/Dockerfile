# Use an official Node.js runtime as a parent image
FROM node:21-alpine

# Set the working directory inside the container
RUN mkdir /app
WORKDIR /app

# Copy the application code into the container
COPY . .

# Install dependencies
RUN npm init -y
RUN npm install -y

# Expose the service port
EXPOSE 4001

# Set environment variables
ENV PROTOCOL=http
ENV HOST=localhost
ENV PORT=4001
ENV SECRET_KEY=example_secret_key
ENV API_GATEWAY_URL=http://localhost:3000

# Command to run the application
CMD [ "npm", "start" ]