# Onkyo AVR Integration - Docker Setup

This Docker configuration allows you to run the Onkyo AVR Integration in a container.

## Files

- `Dockerfile` - Docker image definition
- `docker-compose.yml` - Docker Compose configuration
- `.dockerignore` - Exclusion of files during build

## Usage

### Pre-built Images (recommended)

Docker images are automatically built via GitHub Actions and are available at:

```bash
# GitHub Container Registry (GHCR)
docker pull ghcr.io/eddymcnut/uc-intg-onkyo-avr:latest

# Specific version
docker pull ghcr.io/eddymcnut/uc-intg-onkyo-avr:v0.5.5
```

#### With Docker Compose (pre-built image):

```yaml
services:
  onkyo-avr-integration:
    image: ghcr.io/eddymcnut/uc-intg-onkyo-avr:latest
    container_name: onkyo-avr-integration
    restart: unless-stopped
    network_mode: host
    environment:
      - UC_INTEGRATION_HTTP_PORT=9090
      - UC_CONFIG_HOME=/app/config
    volumes:
      - ./config:/app/config
```

### Local Build

### With Docker Compose (local build)

```bash
# In the docker directory
cd docker

# Build and start
docker-compose up -d

# View logs
docker-compose logs -f onkyo-avr-integration

# Stop
docker-compose down
```

### Manually with Docker

```bash
# Build
docker build -f docker/Dockerfile -t onkyo-avr-integration .

# Run
docker run -d \
  --name onkyo-avr-integration \
  --network host \
  -e UC_INTEGRATION_HTTP_PORT=9090 \
  -e UC_CONFIG_HOME=/app/config \
  -v ./config:/app/config \
  onkyo-avr-integration
```

## Configuration

### Environment Variables

- `UC_INTEGRATION_HTTP_PORT` - HTTP port (default: 9090)
- `UC_CONFIG_HOME` - Configuration directory (default: /app/config)
- `NODE_ENV` - Node.js environment (default: production)

### Volumes

- `../config:/app/config` - Configuration files
- `../logs:/app/logs` - Log files (optional)

### Networking

The container uses `network_mode: host` for automatic network discovery of Onkyo AVR devices.

## Directory Structure

```
project-root/
├── docker/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── .dockerignore
│   └── README.md
├── config/           # Mounted as volume
└── logs/            # Optional for logs
```

## Health Check

The Docker image includes a health check that verifies the HTTP endpoint every 30 seconds.

## Security

- Container runs as non-root user (nodejs:1001)
- Only production dependencies are installed
- Sensitive files are excluded via .dockerignore