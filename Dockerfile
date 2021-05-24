FROM node:fermium-alpine

WORKDIR /app

COPY package.json package-lock.json ./

RUN apk add --update --no-cache \
  make \
  g++ \
  cairo-dev \
  jpeg-dev \
  giflib-dev \
  pango-dev 

RUN npm install -g npm
RUN npm install
RUN sed -i -r "s/path.skip/path.stop/g" node_modules/babel-plugin-transform-strip-block/dist-node/index.js

COPY . .

CMD npm start
EXPOSE 4321
