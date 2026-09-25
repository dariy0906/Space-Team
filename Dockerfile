# Production image for the SU AQTAU Next.js app.
# Builds the Next.js bundle and runs it together with Prisma migrations.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# Reuse the fully built app (includes prisma CLI + tsx needed for migrate/seed).
COPY --from=build /app ./
RUN mkdir -p /app/data/uploads && chown -R node:node /app/data
USER node
EXPOSE 3000
# Apply migrations; seed only in demo mode (seed is idempotent).
CMD ["sh", "-lc", "npx prisma migrate deploy && { if [ \"$DEMO_MODE\" = \"true\" ]; then npm run db:seed; fi; } && npm run start"]
