FROM node:20-slim

# Install git and other necessary tools
RUN apt-get update && apt-get install -y \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Copy the entire repository (including .git directory)
COPY . ./

# Set up git configuration
RUN git config --global user.email "wiki@chaosmotic-systems.app" && \
    git config --global user.name "Chaosmotic Wiki" && \
    git config --global init.defaultBranch main

# Initialize git repository if .git doesn't exist and set up remote
RUN if [ ! -d ".git" ]; then \
        git init && \
        git remote add origin https://github.com/Chaosmotic-Systems/chaosmotic-systems-wiki.git && \
        git branch -M app-dev; \
    fi

# Change to wiki-editor directory and install dependencies
WORKDIR /usr/src/app/wiki-editor
RUN npm ci

# Create content directory if it doesn't exist
RUN mkdir -p content

# Expose port
EXPOSE 8080

# Start the wiki-editor application
CMD ["npm", "start"]