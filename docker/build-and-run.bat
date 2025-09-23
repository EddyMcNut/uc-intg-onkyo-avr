@echo off
REM Build and run script for Onkyo AVR Integration (Windows)

echo Building Onkyo AVR Integration Docker image...

REM Navigate to the docker directory
cd /d "%~dp0"

REM Build the Docker image
docker-compose build

if %ERRORLEVEL% neq 0 (
    echo Failed to build Docker image
    exit /b %ERRORLEVEL%
)

echo Starting Onkyo AVR Integration...

REM Start the container
docker-compose up -d

if %ERRORLEVEL% neq 0 (
    echo Failed to start container
    exit /b %ERRORLEVEL%
)

echo Onkyo AVR Integration is now running!
echo Container logs: docker-compose logs -f onkyo-avr-integration
echo Stop container: docker-compose down
echo View status: docker-compose ps

pause