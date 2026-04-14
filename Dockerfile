FROM node:24-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --production=false

COPY . .
RUN npm run build \
    && rm -rf dist/test \
    && npm prune --production

RUN mkdir -p /config

ENV UC_DISABLE_MDNS_PUBLISH="false"
ENV UC_MDNS_LOCAL_HOSTNAME=""
ENV UC_INTEGRATION_INTERFACE="0.0.0.0"
ENV UC_INTEGRATION_HTTP_PORT="9090"
ENV UC_CONFIG_HOME="/config"

LABEL org.opencontainers.image.source=https://github.com/Serph91P/uc-intg-onkyo-avr

CMD ["node", "dist/src/index.js"]
