FROM node

ADD . /app

WORKDIR /app
RUN yarn install
CMD yarn start
