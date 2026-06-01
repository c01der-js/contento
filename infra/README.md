# Contento Local Infrastructure

Docker Compose setup for all local development dependencies.

## Services

| Service    | Port(s)        | Description                          |
|------------|----------------|--------------------------------------|
| Postgres   | 5432           | Main DB with pgvector extension      |
| Redis      | 6379           | BullMQ job queues + caching          |
| Kafka      | 9092           | Event bus (KRaft mode, no ZooKeeper) |
| Karapace   | 8081           | Kafka Schema Registry (Avro/JSON)    |
| MinIO      | 9000, 9001     | S3-compatible object storage + UI    |

## Setup

```bash
cp infra/.env.example infra/.env
```

Adjust values in `infra/.env` if needed (defaults work out of the box).

## Start

```bash
docker compose up -d
```

## Stop

```bash
docker compose down
```

## Full Reset (removes all data volumes)

```bash
docker compose down -v
```

## Tail Logs

```bash
docker compose logs -f            # all services
docker compose logs -f kafka      # single service
```

## MinIO Console

Open [http://localhost:9001](http://localhost:9001) and log in with the `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` credentials from `.env`.
