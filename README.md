# hdisplay

Bare bones repository placeholder. Replace this description with project purpose.

## Quick start

- Start the server:
  - npm start
- Preview on Mac (optional):
  - ./scripts/mac-preview.sh
- Discover and set CLI target:
  - node cli/index.js discover --set

### Upload and display assets

- Upload and list:
  - node cli/index.js assets:upload ./examples/banner.svg
  - node cli/index.js assets:list
  - node cli/index.js show:image http://localhost:3000/uploads/<returned-filename>

### Push and display immediately (no persistence by default)

- Image from local file (ephemeral in-memory serve):
  - node cli/index.js push:image --file ./examples/banner.svg
- Image from URL:
  - node cli/index.js push:image --url https://example.com/pic.jpg
- Persist uploaded file to /uploads instead of memory:
  - node cli/index.js push:image --file ./examples/banner.svg --persist
- Video:
  - node cli/index.js push:video --file ./examples/sample.mp4
  - node cli/index.js push:video --url https://example.com/video.mp4

Note: Ephemeral content is kept in-memory for ~10 minutes by default.

## License
MIT
