FROM node:20-alpine

RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app

WORKDIR /home/node/app

COPY package*.json ./

USER node

RUN npm config set registry https://registry.npmmirror.com
RUN for i in 1 2 3; do npm ci --omit=dev --fetch-timeout=600000 --prefer-offline && break || sleep 15; done

COPY --chown=node:node . .

EXPOSE 3000

CMD [ "node", "entrypoint.js" ]
