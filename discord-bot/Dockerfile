# OXIDE Discord bot — runs 24/7 on Render Background Worker
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY . .
ENV NODE_ENV=production
CMD ["npm", "start"]
