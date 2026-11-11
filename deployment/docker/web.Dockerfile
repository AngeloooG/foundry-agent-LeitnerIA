# Single image: React SPA (built with Vite) served as static files by the ASP.NET Core API.
# Build context: repository root.  docker build -f deployment/docker/web.Dockerfile .
#
# Base images use version tags; Dependabot (.github/dependabot.yml) proposes updates. For fully reproducible
# production builds pin them by digest (FROM image:tag@sha256:...) and let Dependabot bump the digest.

# ---------------------------------------------------------------- Stage 1: frontend
FROM node:22-alpine AS frontend-builder

# Public identifiers baked into the bundle at build time (not secrets)
# Frontend = SPA registration (MSAL); backend = API registration (scope api://<backend>/Chat.ReadWrite). Both required:
# the Vite build fails without them and writes leitneria-build.json, which the API verifies at startup.
ARG ENTRA_FRONTEND_CLIENT_ID
ARG ENTRA_BACKEND_CLIENT_ID
ARG ENTRA_TENANT_ID
ARG APPLICATIONINSIGHTS_FRONTEND_CONNECTION_STRING=""

WORKDIR /app/frontend

# Dependencies first (cached layer while package*.json does not change)
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY frontend/ ./
# Never let a developer's local env file leak into the image
RUN rm -f .env .env.local .env.development .env.production

ENV NODE_ENV=production
ENV VITE_ENTRA_FRONTEND_CLIENT_ID=$ENTRA_FRONTEND_CLIENT_ID
ENV VITE_ENTRA_BACKEND_CLIENT_ID=$ENTRA_BACKEND_CLIENT_ID
ENV VITE_ENTRA_TENANT_ID=$ENTRA_TENANT_ID
ENV VITE_APPLICATIONINSIGHTS_CONNECTION_STRING=$APPLICATIONINSIGHTS_FRONTEND_CONNECTION_STRING
# VITE_API_URL is not set: the SPA calls "/api" on the same origin

RUN npm run build

# ---------------------------------------------------------------- Stage 2: backend
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS backend-builder

WORKDIR /app

COPY backend/WebApp.sln ./
COPY backend/WebApp.Api/WebApp.Api.csproj ./backend/WebApp.Api/
COPY backend/WebApp.ServiceDefaults/WebApp.ServiceDefaults.csproj ./backend/WebApp.ServiceDefaults/
RUN dotnet restore backend/WebApp.Api/WebApp.Api.csproj

COPY backend/ ./backend/
# No --no-restore: publish re-validates the restore graph inside the container, so a stray local obj/ folder can
# never be used (the restore layer above keeps it fast).
RUN dotnet publish backend/WebApp.Api/WebApp.Api.csproj -c Release -o /app/publish

# ---------------------------------------------------------------- Stage 3: runtime
FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine

WORKDIR /app

COPY --from=backend-builder /app/publish ./
COPY --from=frontend-builder /app/frontend/dist ./wwwroot

EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production

# Non-root (built-in 'app' user of the ASP.NET images)
USER app

ENTRYPOINT ["dotnet", "WebApp.Api.dll"]
