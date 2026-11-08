# Cloud Run image: Express serves the API and the built frontend (for-agents/prd-hosting-auth.md).
# Build with the pinned toolchain: docker build --build-arg NODE_VERSION=$(cat .node-version) .
# The default mirrors .node-version; keep them in step (the build fails below 22.18).
ARG NODE_VERSION=22.19.0

FROM node:${NODE_VERSION}-slim AS build
WORKDIR /app
# The server runs .ts directly (type stripping, Node >= 22.18); fail here rather than at container start.
RUN node -e "const [a,b]=process.versions.node.split('.').map(Number); if (a<22||(a===22&&b<18)) { console.error('NODE_VERSION must be >= 22.18 (type stripping); got '+process.versions.node); process.exit(1); }"
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# postinstall runs prisma generate into src/backend/generated.
RUN npm ci
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN npm ci --prefix frontend
COPY . .
RUN npm run build --prefix frontend

FROM node:${NODE_VERSION}-slim
WORKDIR /app
ENV NODE_ENV=production BACKEND_HOST=0.0.0.0 PORT=8080
COPY package.json package-lock.json ./
# The generated Prisma client is copied below, so install scripts (prisma generate) are not needed.
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/src ./src
COPY --from=build /app/assets ./assets
COPY --from=build /app/frontend/dist ./frontend/dist
USER node
EXPOSE 8080
# Node 22.18+ strips TypeScript types natively; the server runs from source like the tests do.
CMD ["node", "src/backend/server.ts"]
