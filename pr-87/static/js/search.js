// Search functionality
(function() {
    let searchData = null;
    let searchIndex = null;
    let searchConfig = null;
    let hideTimeout = null;
    
    // Initialize search when page loads
    document.addEventListener('DOMContentLoaded', function() {
        loadSearchConfig();
        loadSearchData();
        initializeSearchInputs();
    });
    
    // Load search configuration from meta tags
    function loadSearchConfig() {
        const minQueryLengthMeta = document.querySelector('meta[name="search-min-query-length"]');
        const fuzzyThresholdMeta = document.querySelector('meta[name="search-fuzzy-threshold"]');
        const maxResultsMeta = document.querySelector('meta[name="search-max-results"]');
        
        searchConfig = {
            minQueryLength: minQueryLengthMeta ? parseInt(minQueryLengthMeta.content) : 3,
            fuzzyThreshold: fuzzyThresholdMeta ? parseFloat(fuzzyThresholdMeta.content) : 0.3,
            maxResults: maxResultsMeta ? parseInt(maxResultsMeta.content) : 8
        };
    }
    const basePath = document.querySelector('meta[name="base-path"]')?.content || '';
    
    // Load search data
    async function loadSearchData() {
        try {
            const response = await fetch(basePath + '/static/data/search.json');
            if (response.ok) {
                searchData = await response.json();
            }
        } catch (error) {
            console.warn('Search data not available:', error);
        }
    }
    
    // Initialize search inputs
    function initializeSearchInputs() {
        const searchInputs = [
            { input: document.getElementById('search-input'), results: 'search-results' },
            { input: document.getElementById('mobile-search-input'), results: 'mobile-search-results' },
            { input: document.getElementById('hero-search'), results: null }
        ];
        
        searchInputs.forEach(({ input, results }) => {
            if (input) {
                input.addEventListener('input', (e) => handleSearch(e, results));
                input.addEventListener('focus', () => showSearchResults(results));
                input.addEventListener('blur', () => hideSearchResults(results));
            }
        });
        
        // Close search results when clicking outside
        document.addEventListener('click', function(event) {
            ['search-results', 'mobile-search-results'].forEach(resultsId => {
                const searchResults = document.getElementById(resultsId);
                if (searchResults && !searchResults.contains(event.target)) {
                    hideSearchResults(resultsId);
                }
            });
        });
    }
    
    // Handle search input
    function handleSearch(event, resultsId = 'search-results') {
        const query = event.target.value.trim();
        
        if (query.length < searchConfig.minQueryLength) {
            hideSearchResults(resultsId);
            return;
        }
        
        if (!searchData) {
            // If search data not loaded, show basic message
            showSearchMessage('Search data loading...', resultsId);
            return;
        }
        
        // Perform search
        const results = performSearch(query);
        displaySearchResults(results, query, resultsId);
    }
    
    // Perform basic search (simple text matching for now)
    function performSearch(query) {
        if (!searchData || !searchData.apps) return [];
        
        const lowerQuery = query.toLowerCase();
        
        return searchData.apps
            .filter(app => {
                return app.name.toLowerCase().includes(lowerQuery) ||
                       app.description.toLowerCase().includes(lowerQuery) ||
                       (app.categories && app.categories.some(category => category.toLowerCase().includes(lowerQuery)))
            })
            .slice(0, searchConfig.maxResults); // Limit to maxResults
    }
    
    // Format star count for display (e.g. 14000 -> "14.0k").
    function formatStars(stars) {
        if (stars == null || stars === 0) return '';
        if (stars >= 1000) return (stars / 1000).toFixed(1) + 'k';
        return String(stars);
    }

    // Display search results
    function displaySearchResults(results, query, resultsId = 'search-results') {
        const searchResults = document.getElementById(resultsId);
        if (!searchResults) return;
        
        if (results.length === 0) {
            showSearchMessage(`No results found for "${query}"`, resultsId);
            return;
        }
        
        const html = results.map(app => `
            <div class="search-result-item">
                <a href="${basePath}/apps/${app.id}.html" class="block">
                    <div class="font-medium text-text">${highlightMatch(app.name, query)}</div>
                    <div class="text-sm text-text-muted truncate">${highlightMatch(app.description.substring(0, 100), query)}...</div>
                    ${app.stars ? `<div class="text-xs text-star mt-1">⭐ ${formatStars(app.stars)}</div>` : ''}
                </a>
            </div>
        `).join('');
        
        searchResults.innerHTML = html;
        clearTimeout(hideTimeout);
        searchResults.classList.remove('hidden');
    }

    // Show search message
    function showSearchMessage(message, resultsId = 'search-results') {
        const searchResults = document.getElementById(resultsId);
        if (!searchResults) return;

        searchResults.innerHTML = `
            <div class="search-result-item text-center">
                <div class="text-text-muted">${message}</div>
            </div>
        `;
        clearTimeout(hideTimeout);
        searchResults.classList.remove('hidden');
    }

    // Show search results
    function showSearchResults(resultsId = 'search-results') {
        clearTimeout(hideTimeout);
        const searchResults = document.getElementById(resultsId);
        if (searchResults && searchResults.innerHTML.trim()) {
            searchResults.classList.remove('hidden');
        }
    }

    // Hide search results (with delay to allow clicking on results)
    function hideSearchResults(resultsId = 'search-results') {
        clearTimeout(hideTimeout);
        hideTimeout = setTimeout(() => {
            const searchResults = document.getElementById(resultsId);
            if (searchResults) {
                searchResults.classList.add('hidden');
            }
        }, 150);
    }
    
    // Highlight search matches
    function highlightMatch(text, query) {
        if (!query) return text;
        
        const regex = new RegExp(`(${query})`, 'gi');
        return text.replace(regex, '<mark class="bg-star/30">$1</mark>');
    }
    
    // Handle hero search - redirect to browse page with query
    const heroSearch = document.getElementById('hero-search');
    if (heroSearch) {
        heroSearch.addEventListener('keypress', function(event) {
            if (event.key === 'Enter') {
                const query = event.target.value.trim();
                if (query) {
                    window.location.href = `${basePath}/browse.html?search=${encodeURIComponent(query)}`;
                }
            }
        });
    }
})(); 