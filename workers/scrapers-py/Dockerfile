FROM python:3.11-slim
WORKDIR /app
RUN pip install uv
COPY pyproject.toml .
RUN uv pip install --system -e .
COPY src/ src/
CMD ["python", "-m", "contento_scrapers.main"]
