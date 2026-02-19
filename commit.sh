#!/bin/bash
#
# Quick commit script for FBP Hub
# Usage: ./commit.sh
#

set -e  # Exit on error

# Files to exclude from commits (auto-synced from fbp-trade-bot)
EXCLUDE_FILES=(
    "data/draft_order_2026.json"
    "data/combined_players.json"
    "data/standings.json"
    "data/wizbucks.json"
    "data/wizbucks_transactions.json"
    "data/player_log.json"
    "data/service_stats.json"
)

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}📦 FBP Hub - Quick Commit${NC}"
echo "================================"
echo ""

# Unstage excluded files if they were staged
for file in "${EXCLUDE_FILES[@]}"; do
    if git diff --cached --name-only | grep -q "^$file$"; then
        git restore --staged "$file" 2>/dev/null || true
    fi
done

# Check if there are changes (excluding auto-synced files)
HAS_CHANGES=false
while IFS= read -r file; do
    # Skip if file is in exclude list
    is_excluded=false
    for exclude in "${EXCLUDE_FILES[@]}"; do
        if [[ "$file" == "$exclude" ]]; then
            is_excluded=true
            break
        fi
    done
    
    if [[ "$is_excluded" == false ]]; then
        HAS_CHANGES=true
        break
    fi
done < <(git status -s | awk '{print $2}')

if [[ "$HAS_CHANGES" == false ]]; then
    echo -e "${YELLOW}⚠️  No changes to commit (excluding auto-synced data files)${NC}"
    if [[ -n $(git status -s) ]]; then
        echo -e "${YELLOW}💡 Only auto-synced data files have changed. These are managed by the sync workflow.${NC}"
    fi
    exit 0
fi

# Show what will be committed (excluding auto-synced files)
echo -e "${BLUE}📋 Files changed:${NC}"
while IFS= read -r line; do
    file=$(echo "$line" | awk '{print $2}')
    is_excluded=false
    for exclude in "${EXCLUDE_FILES[@]}"; do
        if [[ "$file" == "$exclude" ]]; then
            is_excluded=true
            break
        fi
    done
    
    if [[ "$is_excluded" == false ]]; then
        echo "$line"
    fi
done < <(git status -s)

if [[ -n $(git status -s | grep -E "$(IFS='|'; echo "${EXCLUDE_FILES[*]}")" 2>/dev/null) ]]; then
    echo -e "${YELLOW}⚠️  Excluding auto-synced data files (managed by workflow)${NC}"
fi
echo ""

# Ask for confirmation
read -p "$(echo -e ${YELLOW}Commit all these changes? [y/N]:${NC} )" -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}❌ Commit cancelled${NC}"
    exit 1
fi

# Get commit message
echo ""
echo -e "${BLUE}✍️  Enter commit message:${NC}"
read -r commit_message

if [[ -z "$commit_message" ]]; then
    echo -e "${RED}❌ Commit message cannot be empty${NC}"
    exit 1
fi

# Add changes (excluding auto-synced files)
echo ""
echo -e "${GREEN}📦 Adding changes...${NC}"
git add .

# Unstage excluded files
for file in "${EXCLUDE_FILES[@]}"; do
    git restore --staged "$file" 2>/dev/null || true
done

# Commit
echo -e "${GREEN}💾 Committing...${NC}"
git commit -m "$commit_message" -m "Co-Authored-By: Warp <agent@warp.dev>"

# Ask about pushing
echo ""
read -p "$(echo -e ${YELLOW}Push to GitHub? [y/N]:${NC} )" -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${GREEN}🚀 Pushing to GitHub...${NC}"
    # Attempt a normal push first. If it fails because the remote has
    # new commits, offer a simple guided option to pull (with rebase)
    # and retry the push.
    if git push origin main; then
        echo ""
        echo -e "${GREEN}✅ Done! Changes committed and pushed.${NC}"
    else
        echo ""
        echo -e "${RED}⚠️  Push failed. The remote probably has new commits you don't have locally.${NC}"
        echo -e "${YELLOW}Options:${NC}"
        echo -e "  1) ${GREEN}Pull remote changes with rebase and re-try push (recommended)${NC}"
        echo -e "  2) ${RED}Abort now and handle manually later${NC}"
        echo ""
        read -p "Choose 1 or 2: " -r choice

        if [[ "$choice" == "1" ]]; then
            echo ""
            echo -e "${GREEN}📥 Running 'git pull --rebase origin main'...${NC}"
            if git pull --rebase origin main; then
                echo -e "${GREEN}🔁 Re-trying push...${NC}"
                if git push origin main; then
                    echo ""
                    echo -e "${GREEN}✅ Done! Changes committed and pushed.${NC}"
                else
                    echo ""
                    echo -e "${RED}❌ Push still failed. Please run 'git status' and resolve any issues manually.${NC}"
                fi
            else
                echo ""
                echo -e "${RED}❌ Pull with rebase failed (likely due to conflicts).${NC}"
                echo -e "${YELLOW}Run 'git status' and resolve merge conflicts, then push again when ready.${NC}"
            fi
        else
            echo ""
            echo -e "${YELLOW}✅ Done! Changes committed locally, but NOT pushed.${NC}"
            echo -e "${YELLOW}💡 When ready, run 'git pull --rebase origin main' then 'git push origin main'.${NC}"
        fi
    fi
else
    echo ""
    echo -e "${YELLOW}✅ Done! Changes committed locally.${NC}"
    echo -e "${YELLOW}💡 Run 'git push origin main' to push when ready.${NC}"
fi
