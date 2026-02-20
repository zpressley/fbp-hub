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
    
    # Add version to CSS files (avoid duplicates)
    sed -i.bak -E 's/href="css\/([^"?]+)\.css"/href="css\/\1.css?v='"$VERSION"'"/g' "$file"
    
    # Add version to JS files (avoid duplicates)  
    sed -i.bak -E 's/src="js\/([^"?]+)\.js"/src="js\/\1.js?v='"$VERSION"'"/g' "$file"
    
    # Clean up backup files
    rm -f "$file.bak"
done

echo "✅ Cache-busting version added to all HTML files"
echo "📝 Version: v=$VERSION"
