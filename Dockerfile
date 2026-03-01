FROM node:24-alpine

# Prisma requires OpenSSL to run its query engine on Alpine Linux
RUN apk add --no-cache openssl

WORKDIR /app

# Copy dependency files
COPY package*.json ./

# Install ALL dependencies (crucial: this installs typescript and @types/express)
RUN npm install

# Copy the rest of your application code
COPY . .

RUN mkdir -p public/uploads/pending public/uploads/approved public/uploads/rejected

RUN npx prisma generate

# Compile the TypeScript code into JavaScript
RUN npm run build

# Set up permissions for security
RUN chown -R node:node /app
USER node

EXPOSE 3000

# Run the compiled output
# Note: If your tsconfig.json outputs to "build" instead of "dist", change this path!
CMD ["node", "dist/index.js"]