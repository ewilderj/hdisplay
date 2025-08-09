# Multi-stage build for hdisplay
FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

# Install app dependencies
COPY package.json package-lock.json* .npmrc* ./
# Use strict ci for reproducible installs (omit dev deps in image)
RUN npm ci --omit=dev

# Copy source
COPY . .

# Runtime image
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \ 
    PORT=3000

# Create non-root user
RUN addgroup -S nodegrp && adduser -S nodeuser -G nodegrp

# Copy node_modules and app
COPY --from=base /app /app

# Ensure writable directories for volumes
RUN mkdir -p /app/uploads /app/data && chown -R nodeuser:nodegrp /app

# Expose port and switch user
EXPOSE 3000
VOLUME ["/app/uploads", "/app/data"]
USER nodeuser

# Healthcheck hitting /healthz (optional; Docker will run it, not the app)
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/healthz',r=>{if(r.statusCode!==200)process.exit(1);r.resume();}).on('error',()=>process.exit(1))" || exit 1

# Default command
CMD ["npm", "start"]
