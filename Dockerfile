FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server ./server
COPY public ./public

ENV PORT=3000
ENV MUSIC_DIR=/music

EXPOSE 3000

CMD ["node", "server/server.js"]
