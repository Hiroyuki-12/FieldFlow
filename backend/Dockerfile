# syntax=docker/dockerfile:1

# ローカルとCIで固定しているNode.js 24 LTSを使い、native依存のArgon2も同じOS系統でbuildする。
FROM node:24.18.0-bookworm-slim AS build

WORKDIR /app

# lockfileどおりに依存を再現してからソースをコピーし、変更時のDocker cacheを有効活用する。
COPY package.json package-lock.json ./
RUN npm ci

COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# runtimeにはコンパイル結果と本番依存だけを含め、攻撃対象とimage容量を抑える。
FROM node:24.18.0-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=8080

WORKDIR /app

COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist

# root権限を持たない公式nodeユーザーで起動し、侵害時のContainer内操作範囲を狭める。
USER node

EXPOSE 8080

# APIだけでなくDB疎通も確認する既存health endpointを利用し、Renderの動的PORTにも追従する。
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||'8080')+'/api/health').then((response)=>{if(!response.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "dist/main.js"]
