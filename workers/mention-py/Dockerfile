FROM python:3.11-slim
WORKDIR /app
RUN pip install uv
COPY pyproject.toml .
COPY src/ src/
RUN uv pip install --system .
CMD ["python", "-m", "contento_mention.main"]
