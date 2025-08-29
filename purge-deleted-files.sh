#!/bin/bash
set -euo pipefail

# Script configuration
SCRIPT_NAME="$(basename "$0")"
LOG_FILE="purge-deleted-files-$(date +%Y%m%d-%H%M%S).log"
BACKUP_BRANCH="backup-before-purge-$(date +%Y%m%d-%H%M%S)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# Error handling function
error_exit() {
    echo -e "${RED}❌ Error: $1${NC}" >&2
    log "ERROR: $1"
    exit 1
}

# Warning function
warning() {
    echo -e "${YELLOW}⚠️  Warning: $1${NC}"
    log "WARNING: $1"
}

# Success function
success() {
    echo -e "${GREEN}✅ $1${NC}"
    log "SUCCESS: $1"
}

# Info function
info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
    log "INFO: $1"
}

# Usage function
usage() {
    cat << EOF
Usage: $SCRIPT_NAME [OPTIONS]

Safely purge deleted files from Git history using git-filter-repo.

OPTIONS:
    -d, --dry-run       Show what would be deleted without making changes
    -f, --force         Skip confirmation prompts (use with caution)
    -b, --no-backup     Skip creating backup branch (not recommended)
    -p, --no-push       Don't push changes to remote
    -h, --help          Show this help message

EXAMPLES:
    $SCRIPT_NAME                    # Interactive mode with all safety checks
    $SCRIPT_NAME --dry-run          # Preview what would be deleted
    $SCRIPT_NAME --force --no-push  # Purge without confirmation, don't push

SAFETY FEATURES:
    - Creates backup branch before operation
    - Provides dry-run mode for testing
    - Logs all operations to timestamped file
    - Validates Git repository state
    - Checks for uncommitted changes

EOF
}

# Parse command line arguments
DRY_RUN=false
FORCE=false
NO_BACKUP=false
NO_PUSH=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -f|--force)
            FORCE=true
            shift
            ;;
        -b|--no-backup)
            NO_BACKUP=true
            shift
            ;;
        -p|--no-push)
            NO_PUSH=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            error_exit "Unknown option: $1. Use --help for usage information."
            ;;
    esac
done

# Start logging
log "Starting $SCRIPT_NAME with PID $$"
log "Arguments: DRY_RUN=$DRY_RUN, FORCE=$FORCE, NO_BACKUP=$NO_BACKUP, NO_PUSH=$NO_PUSH"

# Ensure we are inside a git repo
if [ ! -d .git ]; then
    error_exit "Not a git repository. Run this script inside your Git repository."
fi

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    if [ "$FORCE" = false ]; then
        error_exit "You have uncommitted changes. Please commit or stash them first, or use --force to proceed anyway."
    else
        warning "Proceeding with uncommitted changes due to --force flag"
    fi
fi

# Get git origin URL
if ! GIT_ORIGIN_URL=$(git config --get remote.origin.url 2>/dev/null); then
    if [ "$NO_PUSH" = false ]; then
        error_exit "No remote origin found. Use --no-push or configure a remote origin first."
    else
        info "No remote origin found, continuing without push capability"
        GIT_ORIGIN_URL="none"
    fi
fi

log "Git origin URL: $GIT_ORIGIN_URL"

# Check current branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" = "HEAD" ]; then
    error_exit "You are in a detached HEAD state. Please checkout a branch first."
fi

log "Current branch: $CURRENT_BRANCH"

# Ensure git-filter-repo is installed
if ! command -v git-filter-repo >/dev/null 2>&1; then
    error_exit "git-filter-repo not found. Install it first with: pip install git-filter-repo"
fi

info "Collecting deleted files from git history..."
DELETED_FILES=$(git log --diff-filter=D --name-only --pretty="" | sort -u)

if [ -z "$DELETED_FILES" ]; then
    success "No deleted files found in history. Nothing to purge."
    exit 0
fi

DELETED_COUNT=$(echo "$DELETED_FILES" | wc -l)
info "Found $DELETED_COUNT deleted files in history"

if [ "$DRY_RUN" = true ]; then
    info "DRY RUN MODE - Files that would be purged:"
    echo "$DELETED_FILES" | head -20
    if [ "$DELETED_COUNT" -gt 20 ]; then
        info "... and $((DELETED_COUNT - 20)) more files"
    fi
    info "Use without --dry-run to perform the actual purge"
    exit 0
fi

echo -e "${YELLOW}🗑️  Files to be purged from history:${NC}"
echo "$DELETED_FILES" | head -10
if [ "$DELETED_COUNT" -gt 10 ]; then
    info "... and $((DELETED_COUNT - 10)) more files (see $LOG_FILE for complete list)"
fi

# Log all files being deleted
log "Complete list of files to be purged:"
echo "$DELETED_FILES" >> "$LOG_FILE"

# Safety confirmation
if [ "$FORCE" = false ]; then
    echo
    warning "This operation will:"
    echo "  1. Rewrite Git history permanently"
    echo "  2. Remove $DELETED_COUNT files from all commits"
    echo "  3. Force push to remote (if not --no-push)"
    echo
    read -p "Are you sure you want to continue? (type 'yes' to confirm): " -r
    if [ "$REPLY" != "yes" ]; then
        info "Operation cancelled by user"
        exit 0
    fi
fi

# Create backup branch
if [ "$NO_BACKUP" = false ]; then
    info "Creating backup branch: $BACKUP_BRANCH"
    if git checkout -b "$BACKUP_BRANCH"; then
        git checkout "$CURRENT_BRANCH"
        success "Backup branch created: $BACKUP_BRANCH"
        log "Backup branch created: $BACKUP_BRANCH"
    else
        error_exit "Failed to create backup branch"
    fi
fi

info "Rewriting history and removing deleted files..."
log "Starting git-filter-repo operation"

# Create temporary file for deleted files list
TEMP_FILE=$(mktemp)
echo "$DELETED_FILES" > "$TEMP_FILE"

if git filter-repo --paths-from-file "$TEMP_FILE" --invert-paths --force; then
    success "Git history rewritten successfully"
    log "Git history rewrite completed"
else
    error_exit "git-filter-repo failed"
fi

# Cleanup temporary file
rm -f "$TEMP_FILE"

info "Running cleanup..."
git reflog expire --expire=now --all
git gc --prune=now --aggressive
log "Git cleanup completed"

# Restore origin if it was removed by filter-repo
if [ "$GIT_ORIGIN_URL" != "none" ]; then
    if ! git remote get-url origin >/dev/null 2>&1; then
        info "Restoring remote origin"
        git remote add origin "$GIT_ORIGIN_URL"
        log "Remote origin restored: $GIT_ORIGIN_URL"
    fi
fi

# Push changes if requested
if [ "$NO_PUSH" = false ] && [ "$GIT_ORIGIN_URL" != "none" ]; then
    info "Force pushing cleaned repository..."
    if git push origin --force --all && git push origin --force --tags; then
        success "Changes pushed to remote"
        log "Force push completed successfully"
        
        # Set upstream for current branch
        if git push --set-upstream origin "$CURRENT_BRANCH" --force; then
            success "Upstream set for branch: $CURRENT_BRANCH"
            log "Upstream set for current branch: $CURRENT_BRANCH"
        else
            warning "Failed to set upstream for current branch"
        fi
    else
        error_exit "Failed to push changes to remote"
    fi
else
    info "Skipping push to remote (--no-push flag or no remote origin)"
fi

# Final summary
success "Operation completed successfully!"
info "Summary:"
info "  - $DELETED_COUNT files purged from history"
info "  - Log file: $LOG_FILE"
if [ "$NO_BACKUP" = false ]; then
    info "  - Backup branch: $BACKUP_BRANCH"
fi
if [ "$NO_PUSH" = false ] && [ "$GIT_ORIGIN_URL" != "none" ]; then
    info "  - Changes pushed to remote"
fi

log "Script completed successfully"
