# Zero Edit: web app + AI pipeline + Remotion renderer in one container (Cloud Run).
FROM node:22-bookworm-slim

# ffmpeg for audio/video steps, Chrome's libraries for Remotion, Python + rembg for cut-outs and person mattes.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg python3 python3-pip python3-venv ca-certificates curl \
      libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libgbm1 libasound2 libxrandr2 libxkbcommon0 \
      libxfixes3 libxcomposite1 libxdamage1 libpango-1.0-0 libcairo2 libcups2 fonts-noto-cjk \
  && rm -rf /var/lib/apt/lists/*

ENV VIRTUAL_ENV=/opt/py PATH=/opt/py/bin:$PATH U2NET_HOME=/models PYTHON=/opt/py/bin/python
RUN python3 -m venv /opt/py && pip install --no-cache-dir "rembg[cpu]" pillow \
  && python -c "from rembg import new_session; new_session('birefnet-general-lite'); new_session('u2net_human_seg')"

WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/fetch-fonts.mjs scripts/fetch-fonts.mjs
RUN npm ci && npx remotion browser ensure

COPY . .
# What users make lives on the Cloud Storage mount (/data), not in the image.
RUN rm -rf public/jobs public/uploads && ln -s /data/jobs public/jobs && ln -s /data/uploads public/uploads

ENV NODE_ENV=production DATA_DIR=/data PORT=8080
EXPOSE 8080
# A fresh bucket has no folders yet, so create the symlink targets before starting.
CMD ["sh", "-c", "mkdir -p /data/jobs /data/uploads && exec node app/server.ts"]
