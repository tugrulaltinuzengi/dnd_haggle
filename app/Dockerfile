FROM node:22-alpine
WORKDIR /app
COPY package.json server.js engine.js ./
COPY public ./public
# Render diski /data'ya bağlanır; pazar durumu orada kalıcıdır.
ENV NODE_ENV=production DATA_FILE=/data/data.json
RUN mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/api/chars" >/dev/null || exit 1
CMD ["node", "server.js"]
