# API Fastify — image de production.
# Le build context est la RACINE du dépôt : sans ça, packages/shared est invisible.
FROM node:22-alpine

WORKDIR /app

# Les package.json d'abord, seuls : tant qu'aucune dépendance ne change,
# Docker réutilise le cache de cette couche et saute le npm ci.
# Tous les workspaces doivent être présents pour que npm résolve l'arbre.
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# --workspace : on n'installe pas les dépendances du front dans l'image de l'API.
RUN npm ci --omit=dev --workspace @blackbox/api --include-workspace-root

COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

USER node

# Migrations puis serveur. Une seule instance tourne sur le Pi, donc pas de
# risque que deux conteneurs migrent en même temps.
CMD ["sh", "-c", "npm run migrate -w @blackbox/api && npm run start -w @blackbox/api"]
