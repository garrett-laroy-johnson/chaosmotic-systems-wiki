FROM node:20-slim

# Install git and other necessary tools
RUN apt-get update && apt-get install -y \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Copy package files
COPY wiki-editor/package*.json ./

# Install dependencies
RUN npm ci

# Copy the entire repository content (needed for git operations)
COPY . ./

# Set up git configuration (will be overridden by environment variables)
RUN git config --global user.email "wiki@chaosmotic-systems.app" && \
    git config --global user.name "Chaosmotic Wiki"

# Create content directory if it doesn't exist
RUN mkdir -p content

# Expose port
EXPOSE 8080

# Start the application
CMD ["npm", "start"]