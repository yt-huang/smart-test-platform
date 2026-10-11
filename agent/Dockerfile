FROM mcr.microsoft.com/playwright:v1.64.0-noble
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 AGENT_KEY_FILE=/agent-data/agent-key.json AGENT_WORK_DIR=/agent-data/work
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && mkdir -p /agent-data/work && chown -R pwuser:pwuser /app /agent-data
COPY --chown=pwuser:pwuser src ./src
USER pwuser
CMD ["node", "src/index.js"]
