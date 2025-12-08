# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The Chooser app is a flexible tool for creating and sharing customizable selection sessions (scheduling times, selecting dates, choosing items for potlucks, etc.). The app uses a versioned architecture with isolated deployments per version.

## Current Status

**Last Updated**: 2024-12-08

### Completed ✅

**Backend & Infrastructure** (100% Complete)
- Database schema designed and documented (see DATABASE-NOTES.md)
- Local development environment configured (see README-DEV.md)
- Migration system organized by version: `worker/migrations_v1/0001_initial_schema.sql`
- Database seeded with 4 templates with full instructions:
  - `weekly_time` - Weekly Time Selector (8 AM - 8 PM hourly slots)
  - `monthly_date` - Monthly Date Selector
  - `potluck` - Potluck Contribution Selector
  - `simple_poll` - Simple Poll
- Each template includes:
  - `instructions` field - Participant-facing instructions
  - `adminInstructions` field - Admin configuration instructions
- API endpoints implemented (all 7 endpoints complete):
  - ✅ `GET /api/v1/health` - Health check
  - ✅ `GET /api/v1/templates` - List available templates
  - ✅ `POST /api/v1/choosers` - Create new chooser
  - ✅ `GET /api/v1/choosers/:id` - Get chooser details
  - ✅ `PUT /api/v1/choosers/:id/options` - Add/update options (requires admin_id)
  - ✅ `PUT /api/v1/choosers/:id/publish` - Publish chooser (requires admin_id)
  - ✅ `POST /api/v1/choosers/:id/selections` - Submit participant selections
  - ✅ `GET /api/v1/choosers/:id/results` - View aggregated results
- Environment-based API configuration (dev vs production)
- Local testing working with `wrangler dev --local`
- TypeScript types auto-generated from `wrangler.toml` via `wrangler types`
- PowerShell test suite: `private/testing-api.ps1`

**Version Management & Deployment** (100% Complete)
- Version isolation architecture validated and documented
- Migration folders organized by version (`migrations_v1/`, `migrations_v2/`)
- Built files intentionally committed for version immutability
- Version-specific build scripts in `app/package.json`
- Deployment automation: `scripts/deploy-version.ps1`
- Version status tracking: `site/version-status.json`
- Comprehensive versioning guide: `VERSIONING.md`

### Next Steps 🚀

**Phase: Frontend Implementation** (0% Complete)

Build Vue UI components to consume the v1 API endpoints. The backend is 100% ready.

**1. Core User Flows to Implement:**

A. **Chooser Creation Flow** (Admin)
   - Template selection page
   - Title and description form
   - Redirect to admin URL after creation

B. **Admin Configuration Flow** (Admin only - requires admin_id)
   - Option management interface
     - Add/edit/delete options
     - Option ordering
   - Publish button with confirmation
   - Share links (admin URL + participant URL)

C. **Participant Selection Flow** (Public)
   - View chooser title, description, and instructions
   - Display options based on template type
   - Selection interface with 3-state toggle (green/yellow/red)
   - Participant name input
   - Submit selections

D. **Results View** (Public)
   - Aggregated results display
   - Visual representation (charts/tables)
   - Show which options are most popular

**2. Template-Specific UI Components:**

Each template needs specialized UI:

- **weekly_time**: Grid layout with days × time slots
- **monthly_date**: Calendar view with date selection
- **potluck**: Categorized list with items
- **simple_poll**: Simple list with options

**3. Technical Implementation Notes:**

- Use Vue Router for navigation between flows
- API calls already configured in `app/src/config/api.js`
- Reference template `instructions` and `adminInstructions` fields
- Handle 3-state selection values (first = no, second = maybe, third = yes)
- Admin routes must include `admin_id` in URL path
- All API endpoints tested and working via `private/testing-api.ps1`

**4. Development Workflow:**

```powershell
# Terminal 1: Run Worker API
cd worker
wrangler dev --local

# Terminal 2: Run Vue dev server
cd app
npm run dev

# Access at: http://localhost:5173
# API calls automatically go to: http://localhost:8787/api/v1
```

**5. UI Design Considerations:**

- Mobile-first responsive design
- Clear visual distinction between admin and participant views
- Prominent display of template instructions
- Easy sharing of URLs (copy button)
- Visual feedback for selection states
- Error handling for API failures

**Testing**: Continue using `private/testing-api.ps1` to verify API integration

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
   - **Modular structure**: Each version in its own file
     - `src/index.ts` - Thin router
     - `src/v1/handler.ts` - All v1 logic + types
     - `src/v2/handler.ts` - Future v2 (copy v1, modify as needed)

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

## Security Model (No-Login Required)

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
- Future enhancement: premium version includes login system to
allow admins to archive, brand and manage instances. Higher tier allows admins to restrict participants to their domain.

## Local Development

**For local development setup and workflow, see [README-DEV.md](./README-DEV.md).**

**Development Environment**: Windows with PowerShell
- All scripts should be `.ps1` files for PowerShell compatibility
- Use PowerShell syntax for automation scripts
- Test scripts are in `private/testing-api.ps1`
- Deployment script is `scripts/deploy-version.ps1`

Key points:
- From worker/ - run Worker API with `wrangler dev --local` for local D1 database
- From app/ - Run Vue app with `npm run dev`
- Both have hot reload enabled
- App automatically connects to local API at `localhost:8787`

## Production Deployment

### Prerequisites

1. Ensure you're logged into Wrangler: `wrangler login`
2. Verify correct Cloudflare account is active: `wrangler whoami`
3. Test locally first (see README-DEV.md)

### Step 1: Apply Database Migrations

**IMPORTANT**: Always apply database migrations before deploying code that depends on them.

```bash
cd worker

# Apply migrations to production D1 database
wrangler d1 execute chooser_v1 --file=migrations_v1/0001_initial_schema.sql

# Verify migration applied
wrangler d1 execute chooser_v1 --command "SELECT name FROM sqlite_master WHERE type='table';"
```

### Step 2: Build the SPA

```bash
cd app

# Build the version you're deploying
CHOOSER_VERSION=v1 npm run build:version

# Output will be in: site/a/v1/
```

**For multiple versions:**
```bash
CHOOSER_VERSION=v1 npm run build:version
CHOOSER_VERSION=v2 npm run build:version
```

### Step 3: Deploy Worker API

```bash
cd worker
wrangler deploy
```

This deploys the Worker to `chooser.shatuga.com/api/*` as configured in `wrangler.toml`.

### Step 4: Deploy Static Site + SPA

```bash
cd site
npx wrangler pages deploy . --project-name=chooser-site
```

This deploys:
- Static marketing pages at `chooser.shatuga.com/`
- Built SPA bundles at `chooser.shatuga.com/a/v1/`, `chooser.shatuga.com/a/v2/`, etc.

### Step 5: Verify Deployment

```bash
# Test Worker health endpoint
curl https://chooser.shatuga.com/api/v1/health

# Test SPA loads
curl -I https://chooser.shatuga.com/a/v1/

# Check in browser
open https://chooser.shatuga.com/a/v1/
```

### Deployment Checklist

- [ ] Migrations applied to production database
- [ ] SPA built with correct version number
- [ ] Worker deployed successfully
- [ ] Pages deployed successfully
- [ ] Health check passes
- [ ] SPA loads in browser
- [ ] API calls work from SPA

### Rollback Procedure

If deployment fails:

```bash
# Rollback Worker to previous version
cd worker
wrangler rollback

# Rollback Pages deployment
cd site
wrangler pages deployment list --project-name=chooser-site
wrangler pages deployment rollback <deployment-id> --project-name=chooser-site
```

### Version Release Strategy

1. **Bug fixes on existing version**: Deploy directly to v1 (or current stable)
2. **New version release**:
   - Build and deploy v2 as beta
   - Test thoroughly at `chooser.shatuga.com/a/v2/`
   - When stable, promote v2 as canonical
   - Keep v1 available for existing users
3. **Breaking changes**: Always require a new version number

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

## Code Organization & Patterns

### Worker Structure

```
worker/
├── src/
│   ├── index.ts          # Main router (thin, ~45 lines)
│   ├── v1/
│   │   └── handler.ts    # All v1 logic (~650 lines)
│   └── v2/               # Future
│       └── handler.ts    # Copy v1, modify as needed
├── migrations_v1/        # V1 database migrations
│   └── 0001_initial_schema.sql
├── migrations_v2/        # V2 database migrations (future)
│   └── 0001_v2_schema.sql
├── wrangler.toml         # Config with D1 bindings
└── worker-configuration.d.ts  # Auto-generated types
```

**index.ts** - Thin router:
- CORS configuration
- Routes requests to version handlers
- Global error handling

**v1/handler.ts** - Complete v1 implementation:
- Request body interfaces (scoped to v1)
- Helper functions (generateId, jsonResponse)
- All 7 API endpoints

### TypeScript Patterns

**1. Auto-Generated Types**
- Run `wrangler types` after changing `wrangler.toml`
- Generates `worker-configuration.d.ts` with Env interface
- TypeScript automatically picks up D1 bindings

**2. Request Body Typing**
```typescript
interface CreateChooserRequest {
  template_slug: string;
  title: string;
  description?: string;
  selection_labels?: string[];
}

const body = await request.json() as CreateChooserRequest;
```

**3. Error Handling**
```typescript
} catch (error) {
  const error_message = error instanceof Error ? error.message : String(error);
  return jsonResponse({ error: `Failed to...: ${error_message}` }, 500, corsHeaders);
}
```

### Important Patterns

- SPAs must use `<BrowserRouter basename={'/a/${VERSION}'}/>` for proper routing
- API calls from v1 bundle go to `/api/v1/*`, v2 to `/api/v2/*`
- Templates are extensible—new chooser types can be added over time
- Each version's database schema is independent and immutable
- Always generate cryptographically secure random IDs for admin access
- Never expose admin IDs in participant-facing APIs or URLs
- All request bodies must have TypeScript interfaces defined
- All errors must use the safe error handling pattern
