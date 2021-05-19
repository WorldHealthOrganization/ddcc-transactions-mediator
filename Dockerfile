FROM node:dubnium-alpine

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm install
RUN sed -i -r "s/path.skip/path.stop/g" node_modules/babel-plugin-transform-strip-block/dist-node/index.js

COPY . .

CMD npm start
EXPOSE 4321
