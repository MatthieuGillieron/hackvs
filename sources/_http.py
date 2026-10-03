"""HTTP minimal (stdlib only) avec cache disque, retries et mode hors-ligne.

- Chaque réponse est mise en cache dans _data/cache/ (clé = méthode + URL + body).
- ttl=None  -> cache permanent (pages de détail immuables).
- SOURCES_OFFLINE=1 -> jamais de réseau : sert le cache quel que soit son âge,
  lève OfflineMiss sinon. À activer pendant une démo.
"""
from __future__ import annotations

import gzip
import hashlib
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Callable, Iterable, Optional

DATA_DIR = Path(__file__).parent / "_data"
CACHE_DIR = DATA_DIR / "cache"
UA = "Mozilla/5.0 (compatible; hackathon-sources/1.0)"
DEFAULT_TTL = 6 * 3600
FORCE_REFRESH = False  # True -> ignore le cache (utilisé par `check`)


class OfflineMiss(RuntimeError):
    pass


def offline() -> bool:
    return os.environ.get("SOURCES_OFFLINE") == "1"


def build_url(url: str, params: Optional[dict] = None) -> str:
    if not params:
        return url
    clean = {k: v for k, v in params.items() if v is not None and v != [] and v != ()}
    return url + ("&" if "?" in url else "?") + urllib.parse.urlencode(clean, doseq=True)


def request(
    url: str,
    params: Optional[dict] = None,
    *,
    method: str = "GET",
    json_body: Any = None,
    headers: Optional[dict] = None,
    ttl: Optional[float] = DEFAULT_TTL,
    retries: int = 3,
    encoding: Optional[str] = None,
) -> tuple[str, dict]:
    """Retourne (body_text, response_headers). Utilise le cache si frais."""
    full = build_url(url, params)
    body = json.dumps(json_body).encode() if json_body is not None else None
    key = hashlib.sha1(f"{method} {full} ".encode() + (body or b"")).hexdigest()
    path = CACHE_DIR / key[:2] / f"{key}.json"

    if path.exists() and not FORCE_REFRESH:
        entry = json.loads(path.read_text("utf-8"))
        if offline() or ttl is None or time.time() - entry["fetched_at"] < ttl:
            return entry["body"], entry["headers"]
    if offline():
        raise OfflineMiss(f"pas en cache (mode hors-ligne) : {method} {full}")

    hdrs = {"User-Agent": UA, "Accept": "application/json, text/html, application/xml;q=0.9, */*;q=0.8"}
    if body is not None:
        hdrs["Content-Type"] = "application/json"
    hdrs.update(headers or {})

    last: Exception = RuntimeError("unreachable")
    for attempt in range(retries):
        try:
            req = urllib.request.Request(full, data=body, method=method, headers=hdrs)
            with urllib.request.urlopen(req, timeout=40) as resp:
                raw = resp.read()
                if raw[:2] == b"\x1f\x8b":  # certains serveurs gzippent sans qu'on le demande
                    raw = gzip.decompress(raw)
                text = raw.decode(encoding or resp.headers.get_content_charset() or "utf-8", "replace")
                resp_headers = {k.lower(): v for k, v in resp.headers.items()}
            break
        except urllib.error.HTTPError as e:
            last = e
            if e.code not in (429, 500, 502, 503, 504):
                raise
        except (urllib.error.URLError, TimeoutError) as e:
            last = e
        time.sleep(1.5 * (attempt + 1))
    else:
        raise last

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"url": full, "method": method, "fetched_at": time.time(), "headers": resp_headers, "body": text}),
        "utf-8",
    )
    return text, resp_headers


def download(url: str, suffix: str = "", ttl: Optional[float] = None) -> Path:
    """Fichier binaire (PDF, XLSX…) mis en cache sur disque ; renvoie son chemin local."""
    key = hashlib.sha1(url.encode()).hexdigest()
    path = CACHE_DIR / "bin" / f"{key}{suffix}"
    if path.exists() and (offline() or ttl is None or time.time() - path.stat().st_mtime < ttl):
        return path
    if offline():
        raise OfflineMiss(f"pas en cache (mode hors-ligne) : {url}")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return path


def get_json(url: str, params: Optional[dict] = None, **kw) -> Any:
    return json.loads(request(url, params, **kw)[0])


def get_text(url: str, params: Optional[dict] = None, **kw) -> str:
    return request(url, params, **kw)[0]


def pmap(fn: Callable, items: Iterable, workers: int = 8) -> list:
    """map parallèle qui conserve l'ordre ; les erreurs deviennent None (loggées)."""
    def safe(x):
        try:
            return fn(x)
        except OfflineMiss:
            return None
        except Exception as e:  # une page cassée ne doit pas tuer tout le batch
            print(f"  ! {getattr(fn, '__name__', 'fn')}({str(x)[:60]}): {e}")
            return None

    with ThreadPoolExecutor(workers) as ex:
        return list(ex.map(safe, items))
