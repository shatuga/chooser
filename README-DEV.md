# Chooser Development Guide

This guide covers local development setup for the Chooser app.

## TOC
1. Prerequisites
2. Project Structure
3. Initial Setup
4. Local Development Workflow
5. Working with the Database
6. Building for Production
7. Deployment


## Prerequisites

- Node.js (v18 or later)
- npm
- Cloudflare Wrangler CLI (`npm install -g wrangler`)
- Git

## Project Structure

```
chooser.shatuga.com/
├── app/                    # Vue SPA source code
│   ├── src/
│   ├── .env.development   # Local API config (localhost:8787)
│   ├── .env.production    # Production API config
│   └── vite.config.js
├── worker/                # Cloudflare Worker API
│   ├── src/
│   │   ├── index.ts       # Main router (thin)
│   │   └── v1/
│   │       └── handler.ts # All v1 API logic
│   ├── migrations_v1/     # D1 database schema files for v1
│   ├── wrangler.toml      # Worker config + D1 bindings
│   ├── worker-configuration.d.ts  # Auto-generated types
│   └── tsconfig.json
├── site/                  # Static marketing site + built SPA bundles
├── private/               # Private testing scripts
│   └── testing-api.ps1    # PowerShell API tests
└── README-DEV.md         # This file
```

## Initial Setup

### 1. Install Dependencies

```bash
# Install app dependencies
cd app
npm install

# Install worker dependencies (if any added later)
cd ../worker
npm install
```

### 2. Generate TypeScript Types

```bash
cd worker

# Generate types from wrangler.toml
npx wrangler types
```

This creates `worker-configuration.d.ts` with TypeScript definitions for your D1 bindings.

**When to regenerate**: After modifying `wrangler.toml` (adding databases, KV namespaces, etc.)

### 3. Initialize Local D1 Database

```bash
cd worker

# Create local database and apply schema
wrangler d1 execute chooser_v1 --local --file=migrations_v1/0001_initial_schema.sql
```

> **Note**: The schema includes 4 seeded templates: weekly_time, monthly_date, potluck, simple_poll

## Local Development Workflow

### Running Both Services Together

You need **two terminal windows** to run the full stack locally:

#### Terminal 1: Worker API (with local D1 database)

```bash
cd worker
wrangler dev --local
```

This starts the Worker API at `http://localhost:8787`

- `--local` - Uses local SQLite database (automatically persisted in `.wrangler/state/`)

#### Terminal 2: Vue App

```bash
cd app
npm run dev
```

This starts the Vue dev server at `http://localhost:5173`

The app automatically connects to `http://localhost:8787` for API calls (configured in `.env.development`).

### Environment Configuration

The Vue app automatically uses the correct API URL based on the environment:

- **Development** (`npm run dev`): `http://localhost:8787/api/v1`
- **Production** (builds): `https://chooser.shatuga.com/api/v1`

No manual configuration needed!

## Testing the API

### Using the PowerShell Test Script

A comprehensive test script is provided at `private/testing-api.ps1`:

```powershell
# Make sure Worker is running first
cd worker
wrangler dev --local

# In another terminal, run tests
cd private
.\testing-api.ps1
```

**What it tests**:
1. List available templates
2. Create a new chooser
3. Add options (with admin authentication)
4. Test invalid admin_id rejection
5. Publish the chooser
6. Submit selections from multiple participants
7. Update participant selections
8. View aggregated results

The script provides colored output showing success/failure for each step.

### Manual API Testing

```bash
# Health check
curl http://localhost:8787/api/v1/health

# List templates
curl http://localhost:8787/api/v1/templates

# Create chooser
curl -X POST http://localhost:8787/api/v1/choosers \
  -H "Content-Type: application/json" \
  -d '{"template_slug":"weekly_time","title":"Test"}'
```

## Working with the Database

### View Local Database

```bash
# Open interactive SQL shell
cd worker
wrangler d1 execute chooser_v1 --local --command "SELECT * FROM your_table;"
```

### Reset Local Database

```bash
# Delete local database
rm -rf worker/.wrangler/state/

# Recreate and apply migrations
cd worker
wrangler d1 execute chooser_v1 --local --file=migrations_v1/0001_initial_schema.sql
```

### Seed Local Data (Optional)

```bash
cd worker
wrangler d1 execute chooser_v1 --local --file=migrations_v1/seed_data.sql
```

## Building for Production

### Build Versioned SPA

```bash
cd app
CHOOSER_VERSION=v1 npm run build:version
```

This outputs to `site/a/v1/` with the correct base path and production API URLs.

### Build for Different Versions

```bash
# Build v1
CHOOSER_VERSION=v1 npm run build:version

# Build v2 (when ready)
CHOOSER_VERSION=v2 npm run build:version
```

Each version is completely isolated with its own build output and API endpoint.

## Deployment

See [CLAUDE.md](./CLAUDE.md) for production deployment instructions.

## Troubleshooting

### App can't connect to Worker

1. Make sure Worker is running: `cd worker && wrangler dev --local --persist`
2. Check it's accessible: Open `http://localhost:8787/api/v1/health`
3. Verify app is using correct URL: Check browser console for API calls

### Database errors in Worker

1. Ensure local database exists: `wrangler d1 execute chooser_v1 --local --command "SELECT 1;"`
2. Apply migrations if needed: `wrangler d1 execute chooser_v1 --local --file=migrations_v1/0001_initial_schema.sql`
3. Check `.wrangler/state/` directory exists

### Port conflicts

If `localhost:8787` or `localhost:5173` are in use:

```bash
# Worker: Specify different port
wrangler dev --local --persist --port 8788

# Vue: Vite will auto-increment to next available port
# Update app/.env.development if you change Worker port
```

## API Usage in Components

Import and use the API configuration:

```javascript
import { API_URL, apiRequest } from '@/config/api';

// Option 1: Helper function
const data = await apiRequest('/choosers');

// Option 2: Direct fetch
const response = await fetch(`${API_URL}/choosers`);
const data = await response.json();
```

See `app/src/components/ApiExample.vue` for a complete example.

## Working with Worker Code

### Database Isolation Per Version

**Each version has its own completely isolated D1 database.** This is a key architectural decision that provides:

- **No migration headaches**: v2 can have a completely different schema without affecting v1
- **Zero downtime**: Users on v1 continue working while v2 is being developed
- **Data independence**: Each version's data is completely separate
- **Rollback safety**: If v2 has issues, v1 users are unaffected
- **Clean version bumps**: Only bump versions when schema/behavior changes require it

**How it works** (`worker/wrangler.toml`):
```toml
[[d1_databases]]
binding = "CHOOSER_DB_V1"
database_name = "chooser_v1"
database_id = "1a553e36-f104-45ab-bcbb-5ba688974568"

# [[d1_databases]]
# binding = "CHOOSER_DB_V2"
# database_name = "chooser_v2"
# database_id = ""  # Fill this in when v2 is ready
```

**Routing to the correct database** (`worker/src/index.ts`):
```typescript
if (path.startsWith('/api/v1/')) {
  return handleV1(request, env.CHOOSER_DB_V1, corsHeaders);
}

// Future:
// if (path.startsWith('/api/v2/')) {
//   return handleV2(request, env.CHOOSER_DB_V2, corsHeaders);
// }
```

**Creating a new version's database**:
```bash
# Create new D1 database for v2
wrangler d1 create chooser_v2

# Copy the database_id output to wrangler.toml
# Create v2 migrations folder
mkdir worker/migrations_v2

# Apply v2 schema
wrangler d1 execute chooser_v2 --file=migrations_v2/0001_v2_schema.sql
```

### Modular Version Structure

The Worker uses a modular structure for version isolation:

**`src/index.ts`** - Main router (keep thin):
```typescript
import { handleV1 } from './v1/handler';

// Route to version handlers
if (path.startsWith('/api/v1/')) {
  return handleV1(request, env.CHOOSER_DB_V1, corsHeaders);
}
```

**`src/v1/handler.ts`** - Complete v1 implementation:
- Request body interfaces (scoped to v1)
- Helper functions (generateId, jsonResponse)
- All 7 API endpoints
- ~650 lines of v1-specific logic

### When Building v2

When you need to create v2 with breaking changes:

1. **Copy the handler**:
   ```bash
   cp worker/src/v1/handler.ts worker/src/v2/handler.ts
   ```

2. **Modify interfaces** in `v2/handler.ts` as needed

3. **Update router** in `index.ts`:
   ```typescript
   import { handleV2 } from './v2/handler';

   if (path.startsWith('/api/v2/')) {
     return handleV2(request, env.CHOOSER_DB_V2, corsHeaders);
   }
   ```

4. **Both versions run side-by-side** - v1 users unaffected!

### TypeScript Patterns

**Request Body Typing**:
```typescript
interface CreateChooserRequest {
  template_slug: string;
  title: string;
  description?: string;
}

const body = await request.json() as CreateChooserRequest;
```

**Error Handling**:
```typescript
} catch (error) {
  const error_message = error instanceof Error ? error.message : String(error);
  return jsonResponse({ error: `Failed: ${error_message}` }, 500, corsHeaders);
}
```

**Always use** this pattern - never access `error.message` directly (TypeScript error).

## Tips

- **Hot Reload**: Both Vue and Worker support hot reloading - changes appear instantly
- **Local First**: Always develop against local database to avoid touching production data
- **Multiple Versions**: You can run different versions simultaneously by changing `CHOOSER_VERSION`
- **CORS**: Already configured in Worker for local development
- **Console Logs**: Worker logs appear in the terminal running `wrangler dev`
