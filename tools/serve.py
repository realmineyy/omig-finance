"""Local preview of the dashboard with caching disabled, so edits show on reload.

    python3 tools/serve.py          # http://localhost:8000
    python3 tools/serve.py 8765
"""
import functools
import http.server
import sys
from pathlib import Path

DOCS = Path(__file__).resolve().parent.parent / "docs"


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = functools.partial(NoCache, directory=str(DOCS))
    print(f"Serving {DOCS} at http://localhost:{port}")
    http.server.ThreadingHTTPServer(("", port), handler).serve_forever()
