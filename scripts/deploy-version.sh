#!/bin/bash

# Deploy Chooser Version Script
# Usage: ./deploy-version.sh <version> [--skip-build] [--production-db]

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Functions for colored output
header() {
    echo -e "\n${CYAN}=== $1 ===${NC}"
}

success() {
    echo -e "${GREEN}✓ $1${NC}"
}

error() {
    echo -e "${RED}✗ $1${NC}"
}

info() {
    echo -e "${YELLOW}  $1${NC}"
}

# Parse arguments
VERSION=$1
SKIP_BUILD=false
PRODUCTION_DB=false

for arg in "$@"; do
    case $arg in
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --production-db)
            PRODUCTION_DB=true
            shift
            ;;
        --help|-h)
            cat << EOF
Deploy Chooser Version Script

USAGE:
    ./deploy-version.sh <version> [options]

OPTIONS:
    --skip-build        Skip building the frontend
    --production-db     Apply database migrations to production
    --help, -h          Show this help message

EXAMPLES:
    # Deploy v1 with local database
    ./deploy-version.sh v1

    # Deploy v2 to production
    ./deploy-version.sh v2 --production-db

    # Deploy without rebuilding frontend
    ./deploy-version.sh v1 --skip-build
EOF
            exit 0
            ;;
    esac
done

# Validate version argument
if [ -z "$VERSION" ]; then
    error "Version argument is required"
    echo "Usage: ./deploy-version.sh <version> [--skip-build] [--production-db]"
    exit 1
fi

header "Deploying Chooser Version $VERSION"

# Step 1: Build Frontend (unless skipped)
if [ "$SKIP_BUILD" = false ]; then
    header "Building Frontend for $VERSION"

    cd app
    info "Running: npm run build:$VERSION"
    if npm run build:$VERSION; then
        success "Frontend built successfully"
    else
        error "Frontend build failed"
        exit 1
    fi
    cd ..
else
    info "Skipping frontend build (using existing build)"
fi

# Step 2: Verify built files exist
BUILT_PATH="site/a/$VERSION"
if [ ! -d "$BUILT_PATH" ]; then
    error "Built files not found at $BUILT_PATH"
    info "Run without --skip-build flag to build the frontend"
    exit 1
fi
success "Built files verified at $BUILT_PATH"

# Step 3: Apply database migrations (if needed)
MIGRATION_PATH="worker/migrations_$VERSION"
if [ -d "$MIGRATION_PATH" ]; then
    header "Applying Database Migrations for $VERSION"

    cd worker
    for migration in migrations_$VERSION/*.sql; do
        if [ -f "$migration" ]; then
            info "Applying: $(basename $migration)"

            if [ "$PRODUCTION_DB" = true ]; then
                info "Target: Production database"
                if wrangler d1 execute "chooser_$VERSION" --file="$migration"; then
                    success "Migration applied: $(basename $migration)"
                else
                    error "Migration failed: $(basename $migration)"
                    exit 1
                fi
            else
                info "Target: Local database"
                if wrangler d1 execute "chooser_$VERSION" --local --file="$migration"; then
                    success "Migration applied: $(basename $migration)"
                else
                    error "Migration failed: $(basename $migration)"
                    exit 1
                fi
            fi
        fi
    done
    cd ..
else
    info "No migrations directory found for $VERSION (this is normal for v1)"
fi

# Step 4: Deploy Worker
header "Deploying Worker API"

cd worker
info "Running: wrangler deploy"
if wrangler deploy; then
    success "Worker deployed successfully"
else
    error "Worker deployment failed"
    exit 1
fi
cd ..

# Step 5: Deploy Site
header "Deploying Static Site + Apps"

cd site
info "Running: wrangler pages deploy"
if npx wrangler pages deploy . --project-name=chooser-site; then
    success "Site deployed successfully"
else
    error "Site deployment failed"
    exit 1
fi
cd ..

# Step 6: Summary
header "Deployment Complete!"

echo -e "${CYAN}
Deployed: Version $VERSION
- Frontend: https://chooser.shatuga.com/a/$VERSION/
- API: https://chooser.shatuga.com/api/$VERSION/

Next Steps:
1. Test the deployment:
   curl https://chooser.shatuga.com/api/$VERSION/health

2. Commit the built files:
   git add site/a/$VERSION/
   git commit -m \"Deploy $VERSION to production\"
   git push

3. Update version status:
   Edit site/version-status.json
${NC}"