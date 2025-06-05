FROM node:18-slim

WORKDIR /usr/src/app

# 1) Add the Google Chrome repository and install Chrome + its dependencies
RUN apt-get update \
 && apt-get install -y wget gnupg \
 # Add Google’s Linux signing key
 && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
 # Tell apt where to find Chrome packages
 && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" \
           >> /etc/apt/sources.list.d/google.list' \
 && apt-get update \
 # Install Chrome + all required libs (you already listed these)
 && apt-get install -y \
      google-chrome-stable \
      libatk1.0-0 \
      libatk-bridge2.0-0 \
      libcups2 \
      libdbus-1-3 \
      libdrm2 \
      libgbm1 \
      libgtk-3-0 \
      libasound2 \
      libnspr4 \
      libnss3 \
      libpango-1.0-0 \
      libpangocairo-1.0-0 \
      libx11-6 \
      libx11-xcb1 \
      libxcb1 \
      libxcomposite1 \
      libxcursor1 \
      libxdamage1 \
      libxext6 \
      libxfixes3 \
      libxi6 \
      libxrandr2 \
      libxrender1 \
      libxss1 \
      libxtst6 \
      ca-certificates \
      fonts-liberation \
      lsb-release \
      xdg-utils \
 # Remove apt caches to shrink the image
 && rm -rf /var/lib/apt/lists/*

# 2) Copy package.json and install npm dependencies
COPY package*.json ./
RUN npm install

# 3) Copy your application code
COPY . .

# 4) By default, point Puppeteer at /usr/bin/google-chrome-stable
#    (You’ll still need to modify your code to reference this path—see below.)
ENV PUPPETEER_EXECUTABLE_PATH="/usr/bin/google-chrome-stable"

# 5) Start your server
CMD ["node", "server.js"]
