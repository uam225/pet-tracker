# Stage 1: Build the React app
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies (layer cached independently from source)
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
RUN npm install --frozen-lockfile 2>/dev/null || npm install

# Copy source and build
COPY . .
RUN npm run build

# Stage 2: Serve via a minimal image.
# In production the Caddy container serves the built files from a named volume,
# so this stage simply copies the output into that volume via an init container.
FROM alpine:3.19

WORKDIR /app
COPY --from=builder /app/dist ./dist

# Default command: copy build output to the shared volume on startup.
# docker-compose.prod.yml maps /app/dist to the frontend_build named volume.
CMD ["sh", "-c", "cp -r /app/dist/. /srv/"]
