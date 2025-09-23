#!/bin/bash

# Build and run script for Onkyo AVR Integration

set -e

echo "Building Onkyo AVR Integration Docker image..."

# Navigate to the docker directory
cd "$(dirname "$0")"

# Build the Docker image
docker-compose build

echo "Starting Onkyo AVR Integration..."

# Start the container
docker-compose up -d

echo "Onkyo AVR Integration is now running!"
echo "Container logs: docker-compose logs -f onkyo-avr-integration"
echo "Stop container: docker-compose down"
echo "View status: docker-compose ps"