# scrapers-py

Python worker for scraping trend sources: Google Trends (pytrends), YouTube Trending
(Data API), Reddit (praw), and RSS feeds (feedparser). Each source is toggled per round
from the `TrendFeedConfig` rows in Postgres; results are published to the Kafka `trends`
topic for the `trend-analyzer` (TS) to score per workspace.

> Part of the Contento monorepo. This is a Python-only package — no Node.js/package.json.
> Runs behind the docker-compose `scrapers` profile.
