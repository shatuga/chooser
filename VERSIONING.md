# Versioning Guide

This guide explains the versioning architecture and provides step-by-step instructions for creating new versions.

## Core Principles

1. **Complete Isolation**: Each version (v1, v2, etc.) is completely independent
2. **Immutability**: Once deployed, a version never changes
3. **No Breaking Changes**: Existing choosers continue working forever
4. **No Migration Required**: Users stay on the version their chooser was created with

## Architecture Overview

```
chooser.shatuga.com/a/v1/    →  v1 Frontend  →  /api/v1/*  →  CHOOSER_DB_V1
chooser.shatuga.com/a/v2/    →  v2 Frontend  →  /api/v2/*  →  CHOOSER_DB_V2
```

Each version has:
- Its own frontend build (`site/a/v1/`)
- Its own API handlers (`worker/src/v1/`)
- Its own database (`CHOOSER_DB_V1`)
- Its own migrations (`worker/migrations_v1/`)

## When to Create a New Version

Create a new major version (v2, v3, etc.) when you need:
- Schema changes that would break existing data
- Behavioral changes that would affect existing choosers
- Removal or incompatible modification of API endpoints

Do NOT create a new version for:
- Bug fixes (deploy to current version)
- New features that don't break existing functionality
- UI improvements that don't change behavior

## Creating a New Version (e.g., v2)

### Step 1: Backend - Database Setup

```bash
# Create new D1 database for v2
cd worker
wrangler d1 create chooser_v2

# Output will show:
# ✅ Successfully created DB 'chooser_v2'!
# database_id = "xxxx-xxxx-xxxx-xxxx"  <-- Copy this ID
```

### Step 2: Backend - Update Configuration

Edit `worker/wrangler.toml`:

```toml
# Add the new database binding
[[d1_databases]]
binding = "CHOOSER_DB_V2"
database_name = "chooser_v2"
database_id = "xxxx-xxxx-xxxx-xxxx"  # Paste the ID from step 1
```

Regenerate TypeScript types:

```bash
cd worker
npx wrangler types
```

### Step 3: Backend - Create Migration

```bash
# Create migration directory
mkdir worker/migrations_v2

# Copy v1 schema as starting point (optional)
cp worker/migrations_v1/0001_initial_schema.sql worker/migrations_v2/0001_v2_schema.sql

# Edit the schema as needed for v2
# vim worker/migrations_v2/0001_v2_schema.sql
```

### Step 4: Backend - Create Handler

```bash
# Copy v1 handler as starting point
cp -r worker/src/v1 worker/src/v2

# Modify the handler for v2 changes
# vim worker/src/v2/handler.ts
```

### Step 5: Backend - Update Router

Edit `worker/src/index.ts`:

```typescript
import { handleV1 } from './v1/handler';
import { handleV2 } from './v2/handler';  // Add this

// In the fetch function, add v2 routing:
if (path.startsWith('/api/v2/')) {
  return handleV2(request, env.CHOOSER_DB_V2, corsHeaders);
}
```

### Step 6: Frontend - Add Build Script

Edit `app/package.json`:

```json
{
  "scripts": {
    "build:v1": "CHOOSER_VERSION=v1 vite build",
    "build:v2": "CHOOSER_VERSION=v2 vite build",  // Add this
    "build:all": "npm run build:v1 && npm run build:v2"  // Optional
  }
}
```

### Step 7: Apply Database Migrations

```bash
# Local development
cd worker
wrangler d1 execute chooser_v2 --local --file=migrations_v2/0001_v2_schema.sql

# Production (when ready to deploy)
wrangler d1 execute chooser_v2 --file=migrations_v2/0001_v2_schema.sql
```

### Step 8: Build Frontend

```bash
cd app
npm run build:v2

# This creates site/a/v2/ with the built files
```

### Step 9: Test Locally

```bash
# Terminal 1: Run Worker with both versions
cd worker
wrangler dev --local

# Terminal 2: Test v2 API
curl http://localhost:8787/api/v2/health

# Terminal 3: Run dev server for testing
cd app
CHOOSER_VERSION=v2 npm run dev
```

### Step 10: Deploy to Production

```bash
# Deploy Worker (handles all versions)
cd worker
wrangler deploy

# Deploy Site (includes all versions)
cd site
npx wrangler pages deploy . --project-name=chooser-site
```

### Step 11: Commit the Built Version

```bash
# IMPORTANT: Commit the built files to ensure version immutability
git add site/a/v2/
git commit -m "Add production build for v2"
git push
```

### Step 12: Update Documentation

Edit `site/version-status.json`:

```json
{
  "v2": {
    "released": "2024-12-XX",
    "status": "stable",
    "description": "Adds feature X, changes Y"
  }
}
```

## Deployment Checklist

- [ ] Database created and ID added to wrangler.toml
- [ ] TypeScript types regenerated (`wrangler types`)
- [ ] Migration files created in `migrations_v2/`
- [ ] Handler created in `src/v2/`
- [ ] Router updated in `src/index.ts`
- [ ] Build script added to package.json
- [ ] Frontend built (`npm run build:v2`)
- [ ] Local testing completed
- [ ] Migrations applied to production database
- [ ] Worker deployed
- [ ] Site deployed
- [ ] Built files committed to Git
- [ ] Version status documented

## Maintaining Multiple Versions

### Bug Fixes

To fix a bug in v1 after v2 exists:

1. Make the fix in `worker/src/v1/handler.ts` or `app/` code
2. Rebuild only v1: `npm run build:v1`
3. Deploy normally
4. Commit the updated build

### Deprecating Versions

Versions should typically never be deprecated (they should work forever), but if absolutely necessary:

1. Update `site/version-status.json` to mark as deprecated
2. Add a notice to the v1 app UI (optional)
3. Never remove the code or database - existing choosers must continue working

## Best Practices

1. **Test thoroughly** before deploying a new version - you can't change it later
2. **Document changes** clearly in version-status.json
3. **Keep v1 as reference** - it's your stable, proven version
4. **Commit built files** after testing to ensure immutability
5. **Never delete** old versions - they must work forever

## Common Commands Reference

```bash
# Create database
wrangler d1 create chooser_vX

# Apply migrations locally
wrangler d1 execute chooser_vX --local --file=migrations_vX/0001_vX_schema.sql

# Apply migrations to production
wrangler d1 execute chooser_vX --file=migrations_vX/0001_vX_schema.sql

# Build specific version
CHOOSER_VERSION=vX npm run build:version

# Deploy worker (all versions)
cd worker && wrangler deploy

# Deploy site (all versions)
cd site && npx wrangler pages deploy . --project-name=chooser-site
```