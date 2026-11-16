"""Local preview server: python serve.py [port]. Correct MIME types for ES modules / GLB, no caching."""
import http.server, sys, os
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
os.chdir(os.path.dirname(os.path.abspath(__file__)))
class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
        ".glb": "model/gltf-binary", ".css": "text/css", ".html": "text/html"}
    # Team research database (detail page): same Cloud Run service as material search, read-only GET.
    API_GET = {'/api/research', '/api/original-data'}
    def do_GET(self):
        if self.path.split('?')[0] not in self.API_GET:
            return super().do_GET()
        try:
            with urlopen(Request('https://soraine-dashboard-334840303039.us-central1.run.app' + self.path.split('?')[0], headers={'Accept': 'application/json'}), timeout=15) as response:
                body = response.read(); code = response.status; ctype = response.headers.get('Content-Type', 'application/json')
        except HTTPError as e:
            body = e.read(); code = e.code; ctype = e.headers.get('Content-Type', 'application/json')
        except (URLError, TimeoutError, OSError):
            body = b'{"error":{"code":"SERVICE_UNAVAILABLE","message":"Research service unavailable."}}'; code = 503; ctype = 'application/json'
        self.send_response(code); self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(body)))
        self.end_headers(); self.wfile.write(body)
    def do_POST(self):
        if self.path != '/api/material-search':
            self.send_error(404); return
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            self.send_error(400); return
        if not 0 < length <= 4096:
            self.send_error(413 if length > 4096 else 400); return
        request = Request('https://soraine-dashboard-334840303039.us-central1.run.app/api/material-search',
            data=self.rfile.read(length), headers={'Content-Type': self.headers.get('Content-Type', '')}, method='POST')
        try:
            try:
                response = urlopen(request, timeout=10)
            except HTTPError as e:
                response = e
            with response:
                body = response.read()
                self.send_response(response.code)
                self.send_header('Content-Type', response.headers.get('Content-Type', 'application/json'))
                self.send_header('Content-Length', str(len(body)))
                if response.headers.get('Retry-After'):
                    self.send_header('Retry-After', response.headers['Retry-After'])
                self.end_headers(); self.wfile.write(body)
        except (URLError, TimeoutError, OSError):
            body = b'{"error":{"code":"SERVICE_UNAVAILABLE","message":"Material search unavailable."}}'
            self.send_response(503); self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
    def end_headers(self):
        self.send_header("Cache-Control", "no-store"); super().end_headers()
port = int(sys.argv[1]) if len(sys.argv) > 1 else 5180
print(f"Flame in Freefall: http://localhost:{port}  (Ctrl+C to stop)")
http.server.ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
