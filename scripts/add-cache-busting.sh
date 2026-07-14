#!/bin/bash
# Add cache-busting version parameters to all HTML files
# Usage: ./scripts/add-cache-busting.sh [version]

set -e

VERSION="${1:-$(date +%Y%m%d%H%M%S)}"

echo "🔄 Adding cache-busting version: v=$VERSION"

# Find all HTML files
HTML_FILES=$(find . -name "*.html" -not -path "./node_modules/*" -not -path "./.git/*")

for file in $HTML_FILES; do
    echo "Processing: $file"

    # Strip any existing ?v=... cache-busting param first, so this is safe
    # to re-run repeatedly (idempotent) instead of only catching files that
    # have never been versioned before.
    sed -i.bak -E 's/(href="css\/[^"]+\.css)\?v=[^"]*"/\1"/g' "$file"
    sed -i.bak -E 's/(src="js\/[^"]+\.js)\?v=[^"]*"/\1"/g' "$file"

    # Add the current version to CSS files
    sed -i.bak -E 's/href="css\/([^"?]+)\.css"/href="css\/\1.css?v='"$VERSION"'"/g' "$file"

    # Add the current version to JS files
    sed -i.bak -E 's/src="js\/([^"?]+)\.js"/src="js\/\1.js?v='"$VERSION"'"/g' "$file"

    # Clean up backup files
    rm -f "$file.bak"
done

echo "✅ Cache-busting version added to all HTML files"
echo "📝 Version: v=$VERSION"
