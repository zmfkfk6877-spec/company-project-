FROM node:24-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run db:generate && npm run build
FROM node:24-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache openssl && addgroup -S quiz && adduser -S quiz -G quiz
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 UPLOAD_DIR=/app/uploads
COPY --from=build --chown=quiz:quiz /app/.next/standalone ./
COPY --from=build --chown=quiz:quiz /app/.next/static ./.next/static
COPY --from=build --chown=quiz:quiz /app/public ./public
COPY --from=build --chown=quiz:quiz /app/prisma ./prisma
COPY --from=build --chown=quiz:quiz /app/scripts ./scripts
COPY --from=build --chown=quiz:quiz /app/lib ./lib
COPY --from=build --chown=quiz:quiz /app/node_modules ./node_modules
COPY --from=build --chown=quiz:quiz /app/package.json ./package.json
RUN mkdir -p /app/uploads && chown quiz:quiz /app/uploads
USER quiz
EXPOSE 3000
CMD ["node", "server.js"]
