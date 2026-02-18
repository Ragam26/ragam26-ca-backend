FROM node:24-alpine

# Prisma requires OpenSSL to run its query engine on Alpine Linux
RUN apk add --no-cache openssl

WORKDIR /app

# Copy dependency files
COPY package*.json ./

# Install ALL dependencies (crucial: this installs typescript and @types/express)
RUN npm install

# Copy Prisma schema and generate the client
# (Must happen before building the TS code so your types match the DB)
COPY prisma ./prisma
RUN npx prisma generate

# Copy the rest of your application code
COPY . .

# Compile the TypeScript code into JavaScript
RUN npm run build

# Set up permissions for security
RUN chown -R node:node /app
USER node

EXPOSE 3000

# Run the compiled output
# Note: If your tsconfig.json outputs to "build" instead of "dist", change this path!
CMD ["node", "dist/index.js"]