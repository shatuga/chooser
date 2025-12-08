# Deploy Chooser Version Script
# Usage: .\deploy-version.ps1 -Version v1 [-SkipBuild] [-ProductionDB]

param(
    [Parameter(Mandatory=$true)]
    [string]$Version,

    [switch]$SkipBuild,
    [switch]$ProductionDB,
    [switch]$Help
)

# Colors for output
function Write-Header($message) {
    Write-Host "`n=== $message ===" -ForegroundColor Cyan
}

function Write-Success($message) {
    Write-Host "✓ $message" -ForegroundColor Green
}

function Write-Error($message) {
    Write-Host "✗ $message" -ForegroundColor Red
}

function Write-Info($message) {
    Write-Host "  $message" -ForegroundColor Yellow
}

# Show help
if ($Help) {
    Write-Host @"
Deploy Chooser Version Script

USAGE:
    .\deploy-version.ps1 -Version <version> [options]

OPTIONS:
    -Version <string>    Version to deploy (e.g., v1, v2)
    -SkipBuild          Skip building the frontend
    -ProductionDB       Apply database migrations to production
    -Help               Show this help message

EXAMPLES:
    # Deploy v1 with local database
    .\deploy-version.ps1 -Version v1

    # Deploy v2 to production
    .\deploy-version.ps1 -Version v2 -ProductionDB

    # Deploy without rebuilding frontend
    .\deploy-version.ps1 -Version v1 -SkipBuild
"@
    exit 0
}

Write-Header "Deploying Chooser Version $Version"

# Step 1: Build Frontend (unless skipped)
if (-not $SkipBuild) {
    Write-Header "Building Frontend for $Version"

    Push-Location app
    try {
        Write-Info "Running: npm run build:$Version"
        npm run build:$Version

        if ($LASTEXITCODE -eq 0) {
            Write-Success "Frontend built successfully"
        } else {
            Write-Error "Frontend build failed"
            Pop-Location
            exit 1
        }
    } finally {
        Pop-Location
    }
} else {
    Write-Info "Skipping frontend build (using existing build)"
}

# Step 2: Verify built files exist
$builtPath = "site/a/$Version"
if (-not (Test-Path $builtPath)) {
    Write-Error "Built files not found at $builtPath"
    Write-Info "Run without -SkipBuild flag to build the frontend"
    exit 1
}
Write-Success "Built files verified at $builtPath"

# Step 3: Apply database migrations (if needed)
$migrationPath = "worker/migrations_$Version"
if (Test-Path $migrationPath) {
    Write-Header "Applying Database Migrations for $Version"

    Push-Location worker
    try {
        $migrationFiles = Get-ChildItem "$migrationPath/*.sql" -ErrorAction SilentlyContinue

        if ($migrationFiles) {
            foreach ($file in $migrationFiles) {
                Write-Info "Applying: $($file.Name)"

                if ($ProductionDB) {
                    Write-Info "Target: Production database"
                    wrangler d1 execute "chooser_$Version" --file="$($file.FullName)"
                } else {
                    Write-Info "Target: Local database"
                    wrangler d1 execute "chooser_$Version" --local --file="$($file.FullName)"
                }

                if ($LASTEXITCODE -eq 0) {
                    Write-Success "Migration applied: $($file.Name)"
                } else {
                    Write-Error "Migration failed: $($file.Name)"
                    Pop-Location
                    exit 1
                }
            }
        } else {
            Write-Info "No migration files found in $migrationPath"
        }
    } finally {
        Pop-Location
    }
} else {
    Write-Info "No migrations directory found for $Version (this is normal for v1)"
}

# Step 4: Deploy Worker
Write-Header "Deploying Worker API"

Push-Location worker
try {
    Write-Info "Running: wrangler deploy"
    wrangler deploy

    if ($LASTEXITCODE -eq 0) {
        Write-Success "Worker deployed successfully"
    } else {
        Write-Error "Worker deployment failed"
        Pop-Location
        exit 1
    }
} finally {
    Pop-Location
}

# Step 5: Deploy Site
Write-Header "Deploying Static Site + Apps"

Push-Location site
try {
    Write-Info "Running: wrangler pages deploy"
    npx wrangler pages deploy . --project-name=chooser-site

    if ($LASTEXITCODE -eq 0) {
        Write-Success "Site deployed successfully"
    } else {
        Write-Error "Site deployment failed"
        Pop-Location
        exit 1
    }
} finally {
    Pop-Location
}

# Step 6: Summary
Write-Header "Deployment Complete!"

Write-Host @"

Deployed: Version $Version
- Frontend: https://chooser.shatuga.com/a/$Version/
- API: https://chooser.shatuga.com/api/$Version/

Next Steps:
1. Test the deployment:
   curl https://chooser.shatuga.com/api/$Version/health

2. Commit the built files:
   git add site/a/$Version/
   git commit -m "Deploy $Version to production"
   git push

3. Update version status:
   Edit site/version-status.json
"@ -ForegroundColor Cyan