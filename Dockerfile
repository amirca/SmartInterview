# Use official Node.js LTS Alpine image for better compatibility
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build || npx tsc

# Expose port
EXPOSE 3111

# Set environment variables (these should be passed at runtime)
# ENV OPENAI_API_KEY=your_openai_api_key_here
# ENV WHATSAPP_ACCESS_TOKEN=your_whatsapp_access_token_here  
# ENV WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id_here
# ENV WHATSAPP_VERIFY_TOKEN=your_verify_token_here
# ENV WHATSAPP_BUSINESS_ACCOUNT_ID=your_business_account_id_here
# ENV GMAIL_USER=your_gmail_user_here
# ENV GMAIL_PASS=your_gmail_password_here 
CMD ["node", "dist/src/index.js"]
