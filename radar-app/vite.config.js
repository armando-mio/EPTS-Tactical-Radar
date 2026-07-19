import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'serve-video',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          // Serve any files from parent "data" folder (e.g. video, files)
          if (req.url.startsWith('/video/')) {
            const urlPath = decodeURIComponent(req.url.substring(7)); // remove '/video/'
            const filePath = path.resolve(path.join(__dirname, '..', 'data', urlPath));
            
            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
              const stat = fs.statSync(filePath);
              const fileSize = stat.size;
              const range = req.headers.range;

              // Support HTTP Range requests to allow video seeking/scrubbing
              if (range) {
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                
                if (start >= fileSize || end >= fileSize) {
                  res.writeHead(416, {
                    'Content-Range': `bytes */${fileSize}`
                  });
                  return res.end();
                }

                const chunksize = (end - start) + 1;
                const file = fs.createReadStream(filePath, { start, end });
                const head = {
                  'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                  'Accept-Ranges': 'bytes',
                  'Content-Length': chunksize,
                  'Content-Type': 'video/mp4',
                };
                res.writeHead(206, head);
                file.pipe(res);
              } else {
                const head = {
                  'Content-Length': fileSize,
                  'Content-Type': 'video/mp4',
                };
                res.writeHead(200, head);
                fs.createReadStream(filePath).pipe(res);
              }
              return;
            }
          }
          next();
        });
      }
    }
  ],
  server: {
    fs: {
      // Allow Vite server to serve files from parent directories
      allow: ['..']
    }
  }
})
