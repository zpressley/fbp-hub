#!/bin/bash
#
# Quick commit script for FBP Hub
# Usage: ./commit.sh
#

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}📦 FBP Hub - Quick Commit${NC}"
echo "================================"
echo ""

# Check if there are changes
if [[ -z $(git status -s) ]]; then
    echo -e "${YELLOW}⚠️  No changes to commit${NC}"
    exit 0
fi

# Show what will be committed
echo -e "${BLUE}📋 Files changed:${NC}"
git status -s
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

# Add all changes
echo ""
echo -e "${GREEN}📦 Adding all changes...${NC}"
git add .

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
