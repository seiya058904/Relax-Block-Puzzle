FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && update-ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=80
ENV NODE_OPTIONS=--use-openssl-ca

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

EXPOSE 80

CMD ["npm", "start"]
