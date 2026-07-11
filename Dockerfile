FROM node:24

WORKDIR /backend

COPY ./ECMorelia-Back /backend

RUN npm install

EXPOSE 3000

#el start esta en el archivo de package.json xd
CMD ["npm", "start"]