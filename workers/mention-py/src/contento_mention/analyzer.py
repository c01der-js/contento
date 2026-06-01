from __future__ import annotations

import json
import os

import anthropic

_client: anthropic.AsyncAnthropic | None = None


def _get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=os.environ['ANTHROPIC_API_KEY'])
    return _client


_FALLBACK = {'sentiment': 'neutral', 'urgency': 0, 'summary': None}


async def analyze_mention(text: str, brand_name: str) -> dict:
    """Returns dict with sentiment ('positive'|'neutral'|'negative') and urgency (0-10)."""
    client = _get_client()
    prompt = (
        f'Brand: {brand_name}\n'
        f'Mention: {text}\n\n'
        'Analyze this brand mention. Reply with JSON only:\n'
        '{"sentiment": "positive"|"neutral"|"negative", "urgency": 0-10, "summary": "one sentence"}\n'
        'urgency 0=irrelevant, 10=crisis requiring immediate response.'
    )
    msg = await client.messages.create(
        model='claude-haiku-4-5-20251001',
        max_tokens=200,
        messages=[{'role': 'user', 'content': prompt}],
    )
    content = msg.content[0].text.strip()
    # strip markdown fences if present
    if content.startswith('```'):
        lines = content.split('\n')
        content = '\n'.join(lines[1:]).rsplit('```', 1)[0].strip()
    try:
        return json.loads(content)
    except json.JSONDecodeError as exc:
        print(f'[mention/analyzer] failed to parse Claude response: {exc} — raw: {content!r}')
        return _FALLBACK
