# Front React — build Vite, puis service statique par Nginx.
# Le build context est la RACINE du dépôt (packages/shared).
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

RUN npm ci --workspace @blackbox/web --include-workspace-root

COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

# L'URL de l'API est relative (/api), donc rien à injecter ici :
# la même image fonctionne quel que soit le domaine servi.
RUN npm run build -w @blackbox/web

FROM nginx:alpine

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
