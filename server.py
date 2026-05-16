#!/usr/bin/env python3
"""
Simple HTTP server to serve the site locally.
ES modules require HTTP protocol, not file://

Usage:
    python3 server.py

Then open: http://localhost:8000/index.html
"""

import http.server
import socketserver
import os
import gzip
import mimetypes
import threading
import time
from datetime import datetime, timedelta
try:
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler
    WATCHDOG_AVAILABLE = True
except ImportError:
    WATCHDOG_AVAILABLE = False

PORT = 8000
DEV_MODE = True  # Set to False for production

# Allowed origins for CORS (configure for production)
ALLOWED_ORIGINS = ['http://localhost:8000', 'http://127.0.0.1:8000']

# Global variable to track file changes for auto-reload
last_change_time = time.time()
change_lock = threading.Lock()

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Handle Server-Sent Events for auto-reload
        if self.path == '/__reload__':
            self.handle_reload_stream()
            return
        
        # Check if file exists
        if self.path == '/':
            self.path = '/index.html'
        
        file_path = self.translate_path(self.path)
        if not os.path.exists(file_path) or not os.path.isfile(file_path):
            self.send_error(404, "File not found")
            return
        
        # Inject auto-reload script for HTML files in dev mode
        if DEV_MODE and file_path.endswith('.html'):
            self.serve_with_auto_reload(file_path)
            return
        
        # Check if client accepts gzip
        accept_encoding = self.headers.get('Accept-Encoding', '')
        use_gzip = 'gzip' in accept_encoding and self.should_compress(file_path)
        
        # Read file content
        try:
            with open(file_path, 'rb') as f:
                content = f.read()
            
            # Compress if needed
            if use_gzip:
                content = gzip.compress(content)
            
            # Send response
            self.send_response(200)
            self.send_headers(file_path, use_gzip, len(content))
            self.wfile.write(content)
        except Exception as e:
            self.send_error(500, f"Internal server error: {str(e)}")
    
    def do_OPTIONS(self):
        """Handle preflight CORS requests"""
        origin = self.headers.get('Origin', '')
        if origin in ALLOWED_ORIGINS:
            self.send_response(200)
            self.send_cors_headers(origin)
            self.end_headers()
        else:
            self.send_error(403, "Origin not allowed")
    
    def should_compress(self, file_path):
        """Determine if file should be compressed"""
        compressible_extensions = ['.html', '.css', '.js', '.mjs', '.json', '.svg', '.xml', '.txt']
        _, ext = os.path.splitext(file_path)
        return ext.lower() in compressible_extensions
    
    def send_headers(self, file_path, is_gzipped=False, content_length=None):
        """Send all HTTP headers"""
        # Content type
        content_type, _ = mimetypes.guess_type(file_path)
        if not content_type:
            if file_path.endswith('.mjs'):
                content_type = 'application/javascript'
            elif file_path.endswith('.js'):
                content_type = 'application/javascript'
            else:
                content_type = 'application/octet-stream'
        self.send_header('Content-Type', content_type)
        
        # Compression
        if is_gzipped:
            self.send_header('Content-Encoding', 'gzip')
        
        # Content length
        if content_length is not None:
            self.send_header('Content-Length', str(content_length))
        
        # CORS headers (restricted to allowed origins)
        origin = self.headers.get('Origin', '')
        if origin in ALLOWED_ORIGINS:
            self.send_cors_headers(origin)
        else:
            # For same-origin requests, don't send CORS headers
            pass
        
        # Caching headers
        self.send_cache_headers(file_path)
        
        # Security headers
        self.send_security_headers()
        
        self.end_headers()
    
    def send_cors_headers(self, origin):
        """Send CORS headers for allowed origin"""
        self.send_header('Access-Control-Allow-Origin', origin)
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Max-Age', '3600')
    
    def send_cache_headers(self, file_path):
        """Send appropriate caching headers"""
        # In dev mode, disable caching for auto-reload
        if DEV_MODE:
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
            return
        
        _, ext = os.path.splitext(file_path)
        
        # Static assets get longer cache
        if ext.lower() in ['.css', '.js', '.mjs', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2']:
            # Cache for 1 year
            expires = datetime.utcnow() + timedelta(days=365)
            self.send_header('Cache-Control', 'public, max-age=31536000, immutable')
            self.send_header('Expires', expires.strftime('%a, %d %b %Y %H:%M:%S GMT'))
        else:
            # HTML and other files get shorter cache
            self.send_header('Cache-Control', 'public, max-age=3600')
    
    def send_security_headers(self):
        """Send security headers with CSP"""
        # Content Security Policy
        # Note: unsafe-eval is required for Framer's third-party libraries
        # Framer's libraries (framer.D4Z0nCcI.mjs, react.CDuW5_gC.mjs) use eval() internally
        # This is a known limitation of Framer's framework and cannot be avoided
        csp = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://framerusercontent.com https://framer.com https://app.framerstatic.com https://fonts.googleapis.com; "
            "script-src-elem 'self' 'unsafe-inline' 'unsafe-eval' https://framerusercontent.com https://framer.com https://app.framerstatic.com https://fonts.googleapis.com; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com; "
            "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com; "
            "font-src 'self' https://fonts.gstatic.com data:; "
            "img-src 'self' data: https://framerusercontent.com blob:; "
            "connect-src 'self' https://framerusercontent.com https://framer.com https://app.framerstatic.com https://fonts.googleapis.com https://fonts.gstatic.com https://unpkg.com; "
            "media-src 'self' blob: data: https://framerusercontent.com; "
            "frame-src 'none' https://framer.com https://framerusercontent.com; "
            "object-src 'none'; "
            "base-uri 'self'; "
            "form-action 'self'; "
            "frame-ancestors 'none'; "
            "upgrade-insecure-requests;"
        )
        self.send_header('Content-Security-Policy', csp)
        
        # X-Frame-Options
        self.send_header('X-Frame-Options', 'DENY')
        
        # X-Content-Type-Options
        self.send_header('X-Content-Type-Options', 'nosniff')
        
        # Referrer Policy
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        
        # Permissions Policy
        self.send_header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
    
    def handle_reload_stream(self):
        """Handle Server-Sent Events stream for auto-reload"""
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Connection', 'keep-alive')
        self.send_cors_headers(self.headers.get('Origin', ''))
        self.end_headers()
        
        last_check = time.time()
        try:
            while True:
                with change_lock:
                    current_change = last_change_time
                
                if current_change > last_check:
                    self.wfile.write(b'data: reload\n\n')
                    self.wfile.flush()
                    break
                
                time.sleep(0.5)  # Check every 500ms
                last_check = time.time()
        except (BrokenPipeError, ConnectionResetError):
            pass  # Client disconnected
    
    def serve_with_auto_reload(self, file_path):
        """Serve HTML file with auto-reload script injected"""
        try:
            with open(file_path, 'rb') as f:
                content = f.read()
            
            # Inject auto-reload script before closing </body> or </html>
            reload_script = b'''
<script>
(function() {
    if (typeof EventSource !== 'undefined') {
        const eventSource = new EventSource('/__reload__');
        eventSource.onmessage = function(event) {
            if (event.data === 'reload') {
                eventSource.close();
                window.location.reload();
            }
        };
        eventSource.onerror = function() {
            eventSource.close();
        };
    }
})();
</script>
'''
            # Try to inject before </body>
            if b'</body>' in content:
                content = content.replace(b'</body>', reload_script + b'</body>')
            elif b'</html>' in content:
                content = content.replace(b'</html>', reload_script + b'</html>')
            else:
                content = content + reload_script
            
            # Send response
            self.send_response(200)
            self.send_headers(file_path, False, len(content))
            self.wfile.write(content)
        except Exception as e:
            self.send_error(500, f"Internal server error: {str(e)}")
    
    def translate_path(self, path):
        """Translate URL path to filesystem path"""
        # Remove query string
        path = path.split('?')[0]
        # Remove fragment
        path = path.split('#')[0]
        # Get absolute path
        return os.path.join(os.getcwd(), path.lstrip('/'))
    
    def log_message(self, format, *args):
        """Suppress verbose logging"""
        pass


if WATCHDOG_AVAILABLE:
    class FileChangeHandler(FileSystemEventHandler):
        """Handle file system changes for auto-reload"""
        def on_modified(self, event):
            global last_change_time
            if not event.is_directory:
                # Only watch relevant files
                if event.src_path.endswith(('.html', '.css', '.js', '.mjs', '.py')):
                    with change_lock:
                        global last_change_time
                        last_change_time = time.time()
                    print(f"File changed: {event.src_path}")
        
        def on_created(self, event):
            self.on_modified(event)

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    # Start file watcher for auto-reload in dev mode
    observer = None
    if DEV_MODE:
        if WATCHDOG_AVAILABLE:
            try:
                event_handler = FileChangeHandler()
                observer = Observer()
                observer.schedule(event_handler, path='.', recursive=True)
                observer.start()
                print("✓ Auto-reload enabled: Browser will refresh automatically on file changes")
            except Exception as e:
                print(f"Warning: Could not start file watcher: {e}")
                print("Auto-reload disabled. Files will still be served without cache.")
        else:
            print("⚠ Watchdog not installed. Install with: pip install watchdog")
            print("Auto-reload disabled. Files will still be served without cache.")
            print("   The page will auto-reload when you manually refresh (F5)")
    
    with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
        print(f"Server running at http://localhost:{PORT}/")
        print(f"Open http://localhost:{PORT}/index.html in your browser")
        if DEV_MODE:
            print("Development mode: Caching disabled, auto-reload enabled")
        print("Press Ctrl+C to stop the server")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
            if observer:
                observer.stop()
                observer.join()

