FROM node:dubnium-alpine

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm install

COPY . .

CMD npm start
EXPOSE 4321
