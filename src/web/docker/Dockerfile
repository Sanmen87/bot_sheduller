# 1) Build
FROM node:20-alpine AS builder
WORKDIR /app

# Копируем только манифесты и ставим deps
COPY package.json package-lock.json* .npmrc* ./
# если lock есть — npm ci, иначе fallback на npm install
RUN if [ -f package-lock.json ]; then \
      npm ci --no-audit --no-fund ; \
    else \
      npm install --no-audit --no-fund ; \
    fi

# Копируем остальной код и билдим
COPY . .
RUN npm run build

# 2) Runtime: nginx
FROM nginx:1.27-alpine AS runner
COPY --from=builder /app/out /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ || exit 1
