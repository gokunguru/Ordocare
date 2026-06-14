FROM python:3.11-slim

WORKDIR /app

# Dépendances système pour OpenCV et poppler (pdf2image)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    poppler-utils \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Non-root user for security
RUN groupadd -r mluser && useradd -r -g mluser -d /app -s /sbin/nologin mluser \
    && chown -R mluser:mluser /app
USER mluser

EXPOSE 8001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001", "--log-level", "info"]
