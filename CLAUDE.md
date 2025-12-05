# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The Chooser app is a flexible tool for creating and sharing customizable selection sessions (scheduling times, selecting dates, choosing items for potlucks, etc.). The app uses a versioned architecture with isolated deployments per version.

## Shared Components

Shared assets (images, includes, JavaScript) are maintained in the main shatuga.com project:

**Location**: `C:\Users\shatu\web_projects\shatuga.com`

- **Images**: `C:\Users\shatu\web_projects\shatuga.com\images\` - Logos, icons, common graphics
- **Includes**: `C:\Users\shatu\web_projects\shatuga.com\includes\` - Reusable HTML snippets (headers, footers)
- **JavaScript**: `C:\Users\shatu\web_projects\shatuga.com\js\` - Common utilities and scripts

**Important**: These directories are **READ-ONLY** for this project. Do not modify files in the shatuga.com directory. To use shared components, copy them into this project. Updates to shared components should only be made on explicit user request.

## Architecture

### Three-Part Structure

1. **Static Site** (`site/`): Cloudflare Pages deployment for marketing and documentation
   - Hosted at `chooser.shatuga.com/`
   - Plain HTML/CSS/JS

2. **SPA Application** (`app/`): React/Vue SPA source code
   - Built to versioned paths: `site/a/v1/`, `site/a/v2/`, etc.
   - Each version is completely isolated
   - Uses Vite with base path configuration

3. **Worker API** (`worker/`): Cloudflare Workers + D1 database
   - Versioned API endpoints: `/api/v1/*`, `/api/v2/*`
   - Each version has its own D1 database binding
   - No cross-version migrations needed

### URL Structure

```
chooser.shatuga.com/              → Static marketing site
chooser.shatuga.com/a/v1/         → SPA version 1 (stable)
chooser.shatuga.com/a/v2/         → SPA version 2 (beta)
chooser.shatuga.com/api/v1/*      → API version 1
chooser.shatuga.com/api/v2/*      → API version 2
```

### Versioning Strategy

- Each major version (v1, v2, etc.) is completely isolated
- Minor bugfixes roll out under the same version number
- Version bumps only occur for schema or behavior changes
- Users on old versions continue to work without interference

## Security Model (No-Login Phase)

### Admin Access Pattern

- When a chooser instance is created, generate TWO random IDs:
  - **Instance ID**: Identifies the chooser instance
  - **Admin ID**: Secret token granting admin privileges

- Admin URL format: `/a/v1/admin/{instanceId}/{adminId}`
- Participant URL format: `/a/v1/{instanceId}` (no admin ID)

### Critical Behaviors

- **No authentication required** for creating or participating
- **No save/retrieve functionality** for instances in initial version
- **Losing the admin URL means losing admin access permanently**
- Admin ID must be validated server-side before allowing modifications
- Future enhancement: login system to save and manage admin IDs

## Build Commands

### Building a versioned SPA

```bash
cd app
CHOOSER_VERSION=v1 npm run build:version  # Outputs to site/a/v1/
CHOOSER_VERSION=v2 npm run build:version  # Outputs to site/a/v2/
```

### Deploying

```bash
# Deploy Pages (static site + SPA bundles)
cd site
npx wrangler pages deploy . --project-name=chooser-site

# Deploy Worker API
cd worker
wrangler deploy
```

## Data Model

### Core Entities

1. **Chooser Templates**: JSON objects defining configuration for each chooser type (Weekly Time, Monthly Date, Potluck, etc.)
2. **Chooser Instances**: Created choosers with:
   - Instance ID (public)
   - Admin ID (secret, randomly generated)
   - Template reference
   - Custom settings
3. **Chooser Selections**: Participant choices linked to instances

### Key Features

- Multiple selection types (time slots, dates, items)
- Customizable selection labels (e.g., "No," "Yes," "Preferred")
- Unique shareable URLs for each session
- No login required for participants or creators
- Multiple selections per participant
- Admin access controlled by secret URL token

## Development Setup

### Vite Configuration Pattern

The SPA uses environment variables for versioned builds:

```typescript
const version = process.env.CHOOSER_VERSION ?? "v1";

export default defineConfig({
  base: `/a/${version}/`,
  build: {
    outDir: `../site/a/${version}`,
    emptyOutDir: false,
  },
});
```

### Worker Routing Pattern

The worker handles version routing internally:

```typescript
if (path.startsWith("/api/v1/")) {
  return handleV1(request, env.CHOOSER_DB_V1);
}
if (path.startsWith("/api/v2/")) {
  return handleV2(request, env.CHOOSER_DB_V2);
}
```

### Database Bindings

Each API version gets its own D1 database:
- `CHOOSER_DB_V1` for `/api/v1/*`
- `CHOOSER_DB_V2` for `/api/v2/*`

## Important Patterns

- SPAs must use `<BrowserRouter basename={'/a/${VERSION}'}/>` for proper routing
- API calls from v1 bundle go to `/api/v1/*`, v2 to `/api/v2/*`
- Templates are extensible—new chooser types can be added over time
- Each version's database schema is independent and immutable
- Always generate cryptographically secure random IDs for admin access
- Never expose admin IDs in participant-facing APIs or URLs
