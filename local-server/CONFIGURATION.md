# OpenCode Local Server Configuration

## Quick Start

```bash
# Install dependencies
npm install

# Start server (default port 4096)
npm start

# Or start with specific settings
npm run serve

# Open web interface
npm run web
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start server with random port |
| `npm run serve` | Start server on port 4096 |
| `npm run web` | Start server with web UI on port 3000 |
| `npm test` | Run test suite |

## Environment Configuration

Create a `.env` file:

```env
# Server settings
OPENCODE_SERVER_PORT=4096
OPENCODE_SERVER_HOSTNAME=127.0.0.1

# Authentication (optional)
OPENCODE_SERVER_PASSWORD=your-password
OPENCODE_SERVER_USERNAME=opencode

# CORS settings (for web development)
OPENCODE_CORS=http://localhost:5173,https://app.example.com
```

## API Endpoints

Base URL: `http://127.0.0.1:4096`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/global/health` | GET | Server health check |
| `/doc` | GET | OpenAPI documentation |
| `/project` | GET | List projects |
| `/session` | GET/POST | Manage sessions |
| `/session/:id/message` | POST | Send messages |
| `/provider` | GET | List providers |

## Using with External Clients

```javascript
// Example: Connect from external application
const response = await fetch('http://127.0.0.1:4096/session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'My Session' })
});
```

## Stopping the Server

```bash
# Find the process
lsof -ti :4096

# Kill it
kill $(lsof -ti :4096)
```
