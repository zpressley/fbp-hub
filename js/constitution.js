/**
 * FBP Hub - Constitution Page
 * Interactive constitution with TOC, search, and bookmarkable links
 */

let CONSTITUTION_STATE = {
    markdownContent: '',
    parsedStructure: [],
    currentSection: null
};

/**
 * Initialize constitution page
 */
async function initConstitution() {
    console.log('📜 Initializing constitution...');
    
    // Load markdown
    await loadConstitutionMarkdown();
    
    // Parse structure
    parseConstitutionStructure();
    
    // Generate TOC
    generateTableOfContents();
    
    // Render content
    renderConstitutionContent();
    
    // Setup interactions
    setupSearch();
    setupScrollSpy();
    
    // Check for hash in URL
    if (window.location.hash) {
        scrollToSection(window.location.hash.slice(1));
    }
}

/**
 * Load constitution markdown
 */
async function loadConstitutionMarkdown() {
    try {
        const response = await fetch('docs/{Master} FBP Constitution 2026 (1).md');
        if (response.ok) {
            let content = await response.text();
            // Clean up escape characters from the markdown
            content = content.replace(/\\-/g, '-');
            content = content.replace(/\\#/g, '#');
            content = content.replace(/\\=/g, '=');
            CONSTITUTION_STATE.markdownContent = content;
        } else {
            throw new Error('Could not load constitution');
        }
    } catch (e) {
        console.error('Error loading constitution:', e);
        document.getElementById('constitutionContent').innerHTML = 
            '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Could not load constitution</p></div>';
    }
}

/**
 * Parse constitution structure from markdown
 */
function parseConstitutionStructure() {
    const lines = CONSTITUTION_STATE.markdownContent.split('\n');
    const structure = [];
    let currentArticle = null;
    let currentSection = null;
    
    // Roman numeral converter
    const romanToNum = {'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10};
    
    lines.forEach(line => {
        // Article headers (# **Article X**) - handle Roman numerals and numbers
        if (line.match(/^#\s*\*\*Article\s+[IVX\d]+:/)) {
            const title = line.replace(/^# \*\*/, '').replace(/\*\*$/, '');
            const numMatch = title.match(/Article ([IVX\d]+)/);
            const rawNum = numMatch ? numMatch[1] : '1';
            const articleNum = romanToNum[rawNum] || parseInt(rawNum) || rawNum;
            const articleTitle = title.split(':')[1]?.trim() || '';
            
            currentArticle = {
                number: parseInt(articleNum),
                title: articleTitle,
                fullTitle: title,
                id: `article-${articleNum}`,
                sections: []
            };
            structure.push(currentArticle);
            currentSection = null;
        }
        
        // Section headers (## **Section XX**)
        else if (line.match(/^## \*\*Section \d+:/)) {
            const title = line.replace(/^## \*\*/, '').replace(/\*\*$/, '');
            const sectionNum = title.match(/Section (\d+)/)[1];
            const sectionTitle = title.split(':')[1]?.trim() || '';
            
            if (currentArticle) {
                currentSection = {
                    number: parseInt(sectionNum),
                    title: sectionTitle,
                    fullTitle: title,
                    id: `article-${currentArticle.number}-section-${sectionNum}`,
                    subsections: []
                };
                currentArticle.sections.push(currentSection);
            }
        }
        
        // Subsection headers (### **Clause/Other**)
        else if (line.match(/^### \*\*/)) {
            const title = line.replace(/^### \*\*/, '').replace(/\*\*$/, '').replace(/\*\*\*$/, '');
            
            if (currentSection) {
                const subsectionId = `${currentSection.id}-${slugify(title)}`;
                currentSection.subsections.push({
                    title: title,
                    id: subsectionId
                });
            }
        }
    });
    
    CONSTITUTION_STATE.parsedStructure = structure;
    console.log('📋 Parsed', structure.length, 'articles');
}

/**
 * Generate table of contents
 */
function generateTableOfContents() {
    const tocNav = document.getElementById('tocNav');
    
    const tocHTML = CONSTITUTION_STATE.parsedStructure.map(article => {
        const sectionsHTML = article.sections.map(section => {
            const subsectionsHTML = section.subsections.map(sub => `
                <a href="#${sub.id}" class="toc-section-link" data-section="${sub.id}">
                    ${sub.title}
                </a>
            `).join('');
            
            return `
                <a href="#${section.id}" class="toc-section-link" data-section="${section.id}">
                    ${section.fullTitle}
                </a>
                ${subsectionsHTML}
            `;
        }).join('');
        
        return `
            <div class="toc-article">
                <div class="toc-article-link" data-article="${article.id}">
                    <button class="toc-navigate-btn" data-goto="${article.id}" title="Go to article">
                        <i class="fas fa-arrow-right"></i>
                    </button>
                    <span class="toc-article-title">Article ${article.number}: ${article.title}</span>
                    <i class="fas fa-chevron-right toc-expand-icon"></i>
                </div>
                <div class="toc-sections">
                    ${sectionsHTML}
                </div>
            </div>
        `;
    }).join('');
    
    tocNav.innerHTML = tocHTML;
    
    // Setup expand/collapse
    setupTocExpand();
}

/**
 * Setup TOC expand/collapse
 */
function setupTocExpand() {
    const articleLinks = document.querySelectorAll('.toc-article-link');
    
    articleLinks.forEach(link => {
        // Click on article row toggles expand/collapse
        link.addEventListener('click', (e) => {
            e.preventDefault();
            
            // If clicking the navigate button, don't toggle
            if (e.target.closest('.toc-navigate-btn')) {
                return;
            }
            
            const sections = link.nextElementSibling;
            const isOpen = sections.classList.contains('open');
            
            // Toggle sections
            if (isOpen) {
                sections.classList.remove('open');
                link.classList.remove('expanded');
            } else {
                // Close all others
                document.querySelectorAll('.toc-sections').forEach(s => s.classList.remove('open'));
                document.querySelectorAll('.toc-article-link').forEach(l => l.classList.remove('expanded'));
                
                // Open this one
                sections.classList.add('open');
                link.classList.add('expanded');
            }
        });
    });
    
    // Navigate buttons - go to article
    const navigateBtns = document.querySelectorAll('.toc-navigate-btn');
    navigateBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const articleId = btn.dataset.goto;
            scrollToSection(articleId);
        });
    });
    
    // Section links
    const sectionLinks = document.querySelectorAll('.toc-section-link');
    sectionLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            scrollToSection(link.dataset.section);
            
            // Close mobile TOC if open
            if (window.innerWidth <= 767) {
                closeMobileToc();
            }
        });
    });
}

/**
 * Render constitution content
 */
function renderConstitutionContent() {
    const content = document.getElementById('constitutionContent');
    const md = CONSTITUTION_STATE.markdownContent;
    
    // Extract and render preamble
    const preambleMatch = md.match(/### \*\*\*Preamble:\*\*\*([\s\S]*?)### \*\*\*Overview:/);
    if (preambleMatch) {
        let preambleText = preambleMatch[1].trim();
        preambleText = preambleText.replace(/\*\*\*/g, '').replace(/\*\*/g, '');
        document.getElementById('preambleContent').innerHTML = marked.parse(preambleText);
    }
    
    // Find start of articles (skip header content) - handle Roman numeral I or number 1
    // Use more lenient regex to handle whitespace variations
    const articleStartMatch = md.match(/#\s*\*\*Article\s+(I|1):/);
    if (!articleStartMatch) {
        content.innerHTML = '<p>Could not parse constitution content</p>';
        return;
    }
    
    const startIndex = md.indexOf(articleStartMatch[0]);
    const articlesContent = md.substring(startIndex);
    
    // Split into articles - handle Roman numerals (I, II, III, etc) and numbers
    const articleChunks = articlesContent.split(/(?=^#\s*\*\*Article\s+[IVX\d]+:)/m).filter(chunk => chunk.trim());
    
    let html = '';
    
    articleChunks.forEach(articleChunk => {
        // Extract article number and title - handle Roman numerals and regular numbers
        const headerMatch = articleChunk.match(/^#\s*\*\*Article\s+([IVX\d]+):\s*([^*]+)\*\*/);
        if (!headerMatch) return;
        
        // Convert Roman numerals to numbers if needed
        const romanToNum = {'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10};
        const rawNum = headerMatch[1];
        const articleNum = romanToNum[rawNum] || parseInt(rawNum) || rawNum;
        
        const articleTitle = headerMatch[2].trim();
        const articleId = `article-${articleNum}`;
        
        // Remove article header line and horizontal rule
        let articleBody = articleChunk
            .replace(/^#\s*\*\*Article\s+[IVX\d]+:\s*[^*]+\*\*\s*/m, '')
            .replace(/^---\s*/m, '')
            .replace(/^# \s*$/m, '')  // Remove empty # lines
            .trim();
        
        // Split into sections
        const sectionChunks = articleBody.split(/(?=^## \*\*Section \d+:)/m).filter(chunk => chunk.trim());
        
        let sectionsHtml = '';
        
        sectionChunks.forEach(sectionChunk => {
            const sectionMatch = sectionChunk.match(/^## \*\*Section (\d+): ([^*]+)\*\*/);
            if (!sectionMatch) return;
            
            const sectionNum = sectionMatch[1];
            const sectionTitle = sectionMatch[2].trim();
            const sectionId = `article-${articleNum}-section-${sectionNum}`;
            
            // Get section content (remove header)
            let sectionBody = sectionChunk
                .replace(/^## \*\*Section \d+: [^*]+\*\*\s*/m, '')
                .trim();
            
            // Fix clause headers - convert ### *** to proper format
            sectionBody = sectionBody.replace(/### \*\*\*([^*]+)\*\*\*/g, '### **$1**');
            
            // Convert markdown to HTML using marked.js
            const sectionContentHtml = marked.parse(sectionBody);
            
            sectionsHtml += `
                <div class="section" id="${sectionId}">
                    <h4 class="section-title">
                        Section ${sectionNum}: ${sectionTitle}
                        <button class="section-link-btn" onclick="copyLink('${sectionId}')" title="Copy link">
                            <i class="fas fa-link"></i>
                        </button>
                    </h4>
                    <div class="section-content">
                        ${sectionContentHtml}
                    </div>
                </div>
            `;
        });
        
        html += `
            <div class="article" id="${articleId}">
                <div class="article-header">
                    <h3 class="article-title">Article ${articleNum}: ${articleTitle}</h3>
                    <button class="article-link-btn" onclick="copyLink('${articleId}')" title="Copy link">
                        <i class="fas fa-link"></i>
                    </button>
                </div>
                <div class="article-content">
                    ${sectionsHtml}
                </div>
            </div>
        `;
    });
    
    content.innerHTML = html;
}

/**
 * Render article sections (REMOVED - now handled in renderConstitutionContent)
 */

/**
 * Extract section content from markdown (REMOVED - now handled in renderConstitutionContent)
 */

// Search state
let SEARCH_STATE = {
    matches: [],
    currentIndex: -1,
    query: ''
};

/**
 * Setup search
 */
function setupSearch() {
    const desktopSearch = document.getElementById('tocSearch');
    const mobileSearch = document.getElementById('mobileSearch');
    
    // Desktop search
    desktopSearch.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        // Sync with mobile
        if (mobileSearch) mobileSearch.value = e.target.value;
        handleSearch(query);
    });
    
    // Mobile search
    if (mobileSearch) {
        mobileSearch.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            // Sync with desktop
            desktopSearch.value = e.target.value;
            handleSearch(query);
        });
    }
}

/**
 * Handle search
 */
function handleSearch(query) {
    if (!query || query.length < 2) {
        clearSearch();
        updateSearchUI(0);
        return;
    }
    
    SEARCH_STATE.query = query;
    searchConstitution(query);
}

/**
 * Search constitution content
 */
function searchConstitution(query) {
    // Remove previous highlights
    clearSearchHighlights();
    
    const content = document.getElementById('constitutionContent');
    const html = content.innerHTML;
    
    // Highlight matches - use word boundary for whole word matching
    // Match words that START with the query (so "round" matches "Round" but not "Ron")
    const regex = new RegExp(`\\b(${escapeRegex(query)}[a-z]*)`, 'gi');
    const highlighted = html.replace(regex, '<span class="highlight" data-match="true">$1</span>');
    
    content.innerHTML = highlighted;
    
    // Get all matches
    SEARCH_STATE.matches = Array.from(document.querySelectorAll('.highlight[data-match]'));
    SEARCH_STATE.currentIndex = SEARCH_STATE.matches.length > 0 ? 0 : -1;
    
    // Update UI
    updateSearchUI(SEARCH_STATE.matches.length);
    
    // Scroll to first match
    if (SEARCH_STATE.matches.length > 0) {
        highlightCurrentMatch();
    }
}

/**
 * Update search UI elements
 */
function updateSearchUI(count) {
    const desktopCount = document.getElementById('desktopSearchCount');
    const mobileCount = document.getElementById('mobileSearchCount');
    const desktopNav = document.getElementById('desktopSearchNav');
    const mobileNav = document.getElementById('mobileSearchNav');
    
    if (count > 0) {
        const text = `${SEARCH_STATE.currentIndex + 1}/${count}`;
        if (desktopCount) desktopCount.textContent = text;
        if (mobileCount) mobileCount.textContent = text;
        if (desktopNav) desktopNav.style.display = 'flex';
        if (mobileNav) mobileNav.style.display = 'flex';
    } else {
        if (desktopCount) desktopCount.textContent = SEARCH_STATE.query ? '0' : '';
        if (mobileCount) mobileCount.textContent = SEARCH_STATE.query ? '0' : '';
        if (desktopNav) desktopNav.style.display = 'none';
        if (mobileNav) mobileNav.style.display = 'none';
    }
}

/**
 * Highlight current match
 */
function highlightCurrentMatch() {
    // Remove current highlight
    document.querySelectorAll('.highlight.current').forEach(el => el.classList.remove('current'));
    
    if (SEARCH_STATE.currentIndex >= 0 && SEARCH_STATE.matches[SEARCH_STATE.currentIndex]) {
        const current = SEARCH_STATE.matches[SEARCH_STATE.currentIndex];
        current.classList.add('current');
        current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        updateSearchUI(SEARCH_STATE.matches.length);
    }
}

/**
 * Navigate to next search result
 */
function nextSearchResult() {
    if (SEARCH_STATE.matches.length === 0) return;
    
    SEARCH_STATE.currentIndex = (SEARCH_STATE.currentIndex + 1) % SEARCH_STATE.matches.length;
    highlightCurrentMatch();
}

/**
 * Navigate to previous search result
 */
function prevSearchResult() {
    if (SEARCH_STATE.matches.length === 0) return;
    
    SEARCH_STATE.currentIndex = (SEARCH_STATE.currentIndex - 1 + SEARCH_STATE.matches.length) % SEARCH_STATE.matches.length;
    highlightCurrentMatch();
}

/**
 * Clear desktop search
 */
function clearDesktopSearch() {
    document.getElementById('tocSearch').value = '';
    const mobileSearch = document.getElementById('mobileSearch');
    if (mobileSearch) mobileSearch.value = '';
    clearSearch();
}

/**
 * Clear mobile search
 */
function clearMobileSearch() {
    const mobileSearch = document.getElementById('mobileSearch');
    if (mobileSearch) mobileSearch.value = '';
    document.getElementById('tocSearch').value = '';
    clearSearch();
}

/**
 * Open mobile search dropdown
 */
function openMobileSearchDropdown() {
    const dropdown = document.getElementById('mobileSearchDropdown');
    dropdown.classList.add('active');
    // Focus the input
    setTimeout(() => {
        document.getElementById('mobileSearch').focus();
    }, 300);
}

/**
 * Close mobile search dropdown
 */
function closeMobileSearch() {
    const dropdown = document.getElementById('mobileSearchDropdown');
    dropdown.classList.remove('active');
}

/**
 * Clear search input and results
 */
function clearSearchInput() {
    const mobileSearch = document.getElementById('mobileSearch');
    const desktopSearch = document.getElementById('tocSearch');
    if (mobileSearch) mobileSearch.value = '';
    if (desktopSearch) desktopSearch.value = '';
    clearSearch();
}

/**
 * Clear search highlights only
 */
function clearSearchHighlights() {
    const content = document.getElementById('constitutionContent');
    const html = content.innerHTML;
    content.innerHTML = html.replace(/<span class="highlight"[^>]*>(.*?)<\/span>/g, '$1');
}

/**
 * Clear search completely
 */
function clearSearch() {
    clearSearchHighlights();
    SEARCH_STATE.matches = [];
    SEARCH_STATE.currentIndex = -1;
    SEARCH_STATE.query = '';
    updateSearchUI(0);
}

/**
 * Setup scroll spy
 */
function setupScrollSpy() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.id;
                
                // Update active state in TOC
                document.querySelectorAll('.toc-article-link, .toc-section-link').forEach(link => {
                    link.classList.remove('active');
                });
                
                const tocLink = document.querySelector(`[data-section="${id}"], [data-article="${id}"]`);
                if (tocLink) {
                    tocLink.classList.add('active');
                }
            }
        });
    }, {
        rootMargin: '-100px 0px -80% 0px'
    });
    
    // Observe all articles and sections
    document.querySelectorAll('.article, .section').forEach(el => {
        observer.observe(el);
    });
}

/**
 * Scroll to section
 */
function scrollToSection(sectionId) {
    const element = document.getElementById(sectionId);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
        // Update URL without reload
        history.pushState(null, '', `#${sectionId}`);
        
        // Flash highlight
        element.style.transition = 'background-color 0.5s';
        element.style.backgroundColor = 'rgba(255, 182, 18, 0.2)';
        setTimeout(() => {
            element.style.backgroundColor = '';
        }, 1000);
    }
}

/**
 * Copy link to current section
 */
function copyCurrentLink() {
    const activeSection = document.querySelector('.toc-section-link.active, .toc-article-link.active');
    
    if (activeSection) {
        const sectionId = activeSection.dataset.section || activeSection.dataset.article;
        copyLink(sectionId);
    } else {
        copyLink('');
    }
}

/**
 * Copy link to specific section
 */
function copyLink(sectionId) {
    const url = `${window.location.origin}${window.location.pathname}#${sectionId}`;
    
    navigator.clipboard.writeText(url).then(() => {
        showToast('Link copied to clipboard!');
    }).catch(() => {
        // Fallback
        const input = document.createElement('input');
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showToast('Link copied to clipboard!');
    });
}

/**
 * Print constitution
 */
function printConstitution() {
    window.print();
}

/**
 * Mobile TOC
 */
function openMobileToc() {
    const overlay = document.getElementById('mobileTocOverlay');
    const content = document.getElementById('mobileTocContent');
    
    // Copy TOC to mobile overlay
    content.innerHTML = document.getElementById('tocNav').innerHTML;
    
    overlay.classList.add('active');
    
    // Re-setup click handlers for mobile TOC
    setupMobileTocLinks();
}

function closeMobileToc() {
    document.getElementById('mobileTocOverlay').classList.remove('active');
}

function setupMobileTocLinks() {
    const articleLinks = document.querySelectorAll('#mobileTocContent .toc-article-link');
    const sectionLinks = document.querySelectorAll('#mobileTocContent .toc-section-link');
    const navigateBtns = document.querySelectorAll('#mobileTocContent .toc-navigate-btn');
    
    // Article expand/collapse
    articleLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // If clicking the navigate button, don't toggle
            if (e.target.closest('.toc-navigate-btn')) {
                return;
            }
            
            const sections = link.nextElementSibling;
            const isOpen = sections.classList.contains('open');
            
            // Close all others
            document.querySelectorAll('#mobileTocContent .toc-sections').forEach(s => s.classList.remove('open'));
            document.querySelectorAll('#mobileTocContent .toc-article-link').forEach(l => l.classList.remove('expanded'));
            
            // Toggle this one
            if (!isOpen) {
                sections.classList.add('open');
                link.classList.add('expanded');
            }
        });
    });
    
    // Navigate buttons - go to article and close mobile TOC
    navigateBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const articleId = btn.dataset.goto;
            scrollToSection(articleId);
            closeMobileToc();
        });
    });
    
    // Section links - navigate and close
    sectionLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const sectionId = link.dataset.section;
            scrollToSection(sectionId);
            closeMobileToc();
        });
    });
}

/**
 * Collapse all TOC sections
 */
document.getElementById('tocCollapseBtn')?.addEventListener('click', () => {
    const allSections = document.querySelectorAll('.toc-sections');
    const allArticleLinks = document.querySelectorAll('.toc-article-link');
    const anyOpen = Array.from(allSections).some(s => s.classList.contains('open'));
    
    if (anyOpen) {
        // Collapse all
        allSections.forEach(s => s.classList.remove('open'));
        allArticleLinks.forEach(l => l.classList.remove('expanded'));
        document.getElementById('tocCollapseBtn').innerHTML = '<i class="fas fa-plus-square"></i>';
    } else {
        // Expand all
        allSections.forEach(s => s.classList.add('open'));
        allArticleLinks.forEach(l => l.classList.add('expanded'));
        document.getElementById('tocCollapseBtn').innerHTML = '<i class="fas fa-minus-square"></i>';
    }
});

/**
 * Show toast notification
 */
function showToast(message) {
    const toast = document.getElementById('linkToast');
    toast.querySelector('span').textContent = message;
    toast.style.display = 'flex';
    
    setTimeout(() => {
        toast.style.display = 'none';
    }, 3000);
}

/**
 * Helper functions
 */
function slugify(text) {
    return text.toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Expose functions
window.initConstitution = initConstitution;
window.copyCurrentLink = copyCurrentLink;
window.copyLink = copyLink;
window.printConstitution = printConstitution;
window.openMobileToc = openMobileToc;
window.closeMobileToc = closeMobileToc;
window.nextSearchResult = nextSearchResult;
window.prevSearchResult = prevSearchResult;
window.clearDesktopSearch = clearDesktopSearch;
window.clearMobileSearch = clearMobileSearch;
window.openMobileSearchDropdown = openMobileSearchDropdown;
window.closeMobileSearch = closeMobileSearch;
window.clearSearchInput = clearSearchInput;
