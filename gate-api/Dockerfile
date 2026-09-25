# Build from gate-api/ directory:
#   docker build -t oxide-gate-api .
#   docker run -p 8787:8787 -e ADMIN_SECRET=... -e CORS_ORIGINS=... -v oxide-data:/data oxide-gate-api

FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=8787
ENV DB_PATH=/data/keys.db

RUN mkdir -p /data

EXPOSE 8787

CMD ["node", "server.js"]
