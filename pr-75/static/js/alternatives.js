// Alternatives page functionality
class AlternativesPage {
    constructor() {
        this.alternatives = {};
        this.allSoftwareNames = [];
        this.filteredAlternatives = {};
        this.statistics = {};
        this.basePath = document.querySelector('meta[name="base-path"]')?.content || '';
        
        // Sort direction tracking
        this.sortDirections = {
            'name': 'asc',      // asc = A-Z, desc = Z-A
            'alternatives': 'desc'  // desc = most first, asc = least first
        };
        
        this.currentSort = 'name';
        
        // Configuration settings
        this.alternativesDescriptionLength = 80;
        this.alternativesDescriptionFull = false;
        this.alternativesMaxCategoriesPerCard = 2;
        this.alternativesMaxPlatformsPerCard = 3;
        this.alternativesShowMoreThreshold = 3;
        
        // Non-free licenses tracking
        this.nonFreeLicenses = new Set();
        
        // Pagination settings
        this.currentPage = 1;
        this.itemsPerPage = 60;
        this.totalPages = 1;
        this.enablePagination = true;
        
        this.init();
    }

    async init() {
        await this.loadAlternativesData();
        await this.loadLicenseData();
        await this.loadConfig();
        this.setupEventListeners();
        this.updateSortButtons('sortAlphabetical');
        this.renderAllAlternatives();
        this.parseUrlParameters();
    }

    async loadConfig() {
        // Helper function to get config value from meta tag with fallback
        const getConfigValue = (metaName, defaultValue, parser = parseInt) => {
            const meta = document.querySelector(`meta[name="${metaName}"]`);
            return meta ? parser(meta.content) || defaultValue : defaultValue;
        };

        try {
            // Load all configuration values using the helper function
            this.alternativesDescriptionLength = getConfigValue('alternatives-description-length', 80);
            this.alternativesDescriptionFull = getConfigValue('alternatives-description-full', false, (val) => val.toLowerCase() === 'true');
            this.alternativesMaxCategoriesPerCard = getConfigValue('alternatives-max-categories-per-card', 2);
            this.alternativesMaxPlatformsPerCard = getConfigValue('alternatives-max-platforms-per-card', 3);
            this.alternativesShowMoreThreshold = getConfigValue('alternatives-show-more-threshold', 3);
            this.minQueryLength = getConfigValue('search-min-query-length', 3);
            this.searchMaxResults = getConfigValue('search-max-results', 8);
            this.searchFuzzyThreshold = getConfigValue('search-fuzzy-threshold', 0.3);
            this.itemsPerPage = getConfigValue('items-per-page', 60);
            this.enablePagination = getConfigValue('enable-pagination', false, (val) => val.toLowerCase() === 'true');
        } catch (error) {
            console.log('Using default configuration values');
        }
    }

    async loadLicenseData() {
        // Load non-free license identifiers from search data
        try {
            const response = await fetch(this.basePath + '/static/data/search.json');
            const data = await response.json();
            
            if (data.nonfree_licenses && Array.isArray(data.nonfree_licenses)) {
                data.nonfree_licenses.forEach(license => {
                    this.nonFreeLicenses.add(license);
                });
            } else {
                // Fallback to basic proprietary check if data not available
                this.nonFreeLicenses.add('⊘ Proprietary');
            }
        } catch (error) {
            console.error('Failed to load license data:', error);
            // Fallback to basic proprietary check
            this.nonFreeLicenses.add('⊘ Proprietary');
        }
    }

    async loadAlternativesData() {
        try {
            const response = await fetch(this.basePath + '/static/data/alternatives.json');
            const data = await response.json();
            this.alternatives = data.alternatives || {};
            this.statistics = data.statistics || {};
            
            // Create list of all software names for search suggestions
            this.allSoftwareNames = Object.keys(this.alternatives).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
            this.filteredAlternatives = { ...this.alternatives };
        } catch (error) {
            console.error('Failed to load alternatives data:', error);
            this.showError('Failed to load alternatives data. Please try again later.');
        }
    }

    setupEventListeners() {
        // Search functionality
        const heroSearch = document.getElementById('alternatives-search');
        const searchSuggestions = document.getElementById('searchSuggestions');
        
        if (heroSearch) {
            // Search input handler
            heroSearch.addEventListener('input', (e) => {
                const query = e.target.value.trim();
                this.handleSearchInput(query);
            });

            // Handle focus to show suggestions
            heroSearch.addEventListener('focus', (e) => {
                const query = e.target.value.trim();
                if (query && query.length >= this.minQueryLength) {
                    this.showSearchSuggestions(query);
                }
            });

            // Handle blur to hide suggestions (with delay to allow clicking)
            heroSearch.addEventListener('blur', () => {
                setTimeout(() => {
                    this.hideSearchSuggestions();
                }, 200);
            });

            // Handle keyboard navigation
            heroSearch.addEventListener('keydown', (e) => {
                this.handleKeyboardNavigation(e);
            });
        }

        // Click outside to hide suggestions - only if both elements exist
        if (heroSearch && searchSuggestions) {
            document.addEventListener('click', (e) => {
                if (!heroSearch.contains(e.target) && !searchSuggestions.contains(e.target)) {
                    this.hideSearchSuggestions();
                }
            });
        }

        // Handle hash changes (when user navigates back/forward or clicks another hash link)
        window.addEventListener('hashchange', () => {
            this.parseUrlParameters();
        });

        // Sort buttons
        const sortButtons = {
            'sortAlphabetical': 'name',
            'sortMostAlternatives': 'alternatives'
        };

        Object.entries(sortButtons).forEach(([buttonId, sortType]) => {
            const button = document.getElementById(buttonId);
            if (button) {
                button.addEventListener('click', () => {
                    // If clicking the same sort button, toggle direction
                    if (this.currentSort === sortType) {
                        this.sortDirections[sortType] = this.sortDirections[sortType] === 'asc' ? 'desc' : 'asc';
                    } else {
                        // If clicking a different sort button, set it as current
                        this.currentSort = sortType;
                    }
                    
                    this.updateSortButtons(buttonId);
                    this.currentPage = 1; // Reset to first page on sort
                    this.renderAlternatives();
                });
            }
        });
    }

    updateSortButtons(activeButtonId) {
        const sortButtons = {
            'sortAlphabetical': 'name',
            'sortMostAlternatives': 'alternatives'
        };
        
        Object.entries(sortButtons).forEach(([buttonId, sortType]) => {
            const button = document.getElementById(buttonId);
            if (button) {
                // Get the base text without any arrows
                let baseText = button.textContent.replace(/[↑↓]/g, '').trim();
                
                if (buttonId === activeButtonId) {
                    button.className = 'sort-button active';
                    // Add arrow indicator based on current direction
                    const direction = this.sortDirections[sortType];
                    const arrow = direction === 'asc' ? '↑' : '↓';
                    button.textContent = `${baseText} ${arrow}`;
                } else {
                    button.className = 'sort-button';
                    button.textContent = baseText;
                }
            }
        });
    }

    handleSearchInput(query) {
        if (query.length === 0) {
            // Show all alternatives when search is empty
            this.filteredAlternatives = { ...this.alternatives };
            this.hideSearchSuggestions();
        } else if (query.length >= this.minQueryLength) {
            // Show search suggestions
            this.showSearchSuggestions(query);
            // Filter alternatives based on query
            this.filterAlternatives(query);
        } else {
            this.hideSearchSuggestions();
        }
        
        this.currentPage = 1; // Reset to first page on search
        this.renderAlternatives();
    }

    showSearchSuggestions(query) {
        const suggestions = this.getSuggestions(query);
        const suggestionsContainer = document.getElementById('searchSuggestions');
        
        if (!suggestionsContainer) {
            console.warn('Search suggestions container not found');
            return;
        }
        
        if (suggestions.length === 0) {
            this.hideSearchSuggestions();
            return;
        }

        suggestionsContainer.innerHTML = '';
        
        suggestions.slice(0, this.searchMaxResults).forEach((suggestion, index) => {
            const suggestionElement = document.createElement('div');
            suggestionElement.className = 'px-4 py-2 hover:bg-surface-alt cursor-pointer flex items-center justify-between';
            suggestionElement.setAttribute('data-index', index);
            
            const alternativesCount = this.alternatives[suggestion] ? this.alternatives[suggestion].length : 0;
            
            suggestionElement.innerHTML = `
                <span class="text-text">${this.highlightMatch(suggestion, query)}</span>
                <span class="text-sm text-text-muted">${alternativesCount} alternative${alternativesCount !== 1 ? 's' : ''}</span>
            `;
            
            suggestionElement.addEventListener('click', () => {
                this.selectSuggestion(suggestion);
            });
            
            suggestionsContainer.appendChild(suggestionElement);
        });
        
        suggestionsContainer.classList.remove('hidden');
    }

    hideSearchSuggestions() {
        const suggestionsContainer = document.getElementById('searchSuggestions');
        if (suggestionsContainer) {
            suggestionsContainer.classList.add('hidden');
        }
    }

    getSuggestions(query) {
        const lowerQuery = query.toLowerCase();
        return this.allSoftwareNames.filter(name => 
            name.toLowerCase().includes(lowerQuery)
        ).sort((a, b) => {
            // Prioritize exact matches and starts-with matches
            const aLower = a.toLowerCase();
            const bLower = b.toLowerCase();
            
            const aStartsWith = aLower.startsWith(lowerQuery);
            const bStartsWith = bLower.startsWith(lowerQuery);
            
            if (aStartsWith && !bStartsWith) return -1;
            if (!aStartsWith && bStartsWith) return 1;
            
            // Then sort by length (shorter first)
            if (a.length !== b.length) {
                return a.length - b.length;
            }
            
            // Finally sort alphabetically
            return a.localeCompare(b);
        });
    }

    highlightMatch(text, query) {
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.replace(regex, '<strong>$1</strong>');
    }

    selectSuggestion(suggestion) {
        const heroSearch = document.getElementById('alternatives-search');
        if (!heroSearch) {
            console.warn('Search input element not found');
            return;
        }
        
        heroSearch.value = suggestion;
        this.hideSearchSuggestions();
        this.filterAlternatives(suggestion);
        this.currentPage = 1; // Reset to first page
        this.renderAlternatives();
    }

    handleKeyboardNavigation(e) {
        const suggestionsContainer = document.getElementById('searchSuggestions');
        if (!suggestionsContainer || suggestionsContainer.classList.contains('hidden')) return;

        const suggestions = suggestionsContainer.querySelectorAll('[data-index]');
        const currentActive = suggestionsContainer.querySelector('.bg-surface-alt');
        let currentIndex = currentActive ? parseInt(currentActive.getAttribute('data-index')) : -1;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                currentIndex = Math.min(currentIndex + 1, suggestions.length - 1);
                this.highlightSuggestion(suggestions, currentIndex);
                break;
            case 'ArrowUp':
                e.preventDefault();
                currentIndex = Math.max(currentIndex - 1, 0);
                this.highlightSuggestion(suggestions, currentIndex);
                break;
            case 'Enter':
                e.preventDefault();
                if (currentIndex >= 0 && suggestions[currentIndex]) {
                    const suggestionText = suggestions[currentIndex].querySelector('span').textContent;
                    this.selectSuggestion(suggestionText);
                }
                break;
            case 'Escape':
                this.hideSearchSuggestions();
                break;
        }
    }

    highlightSuggestion(suggestions, index) {
        if (!suggestions || suggestions.length === 0) return;
        
        suggestions.forEach((suggestion, i) => {
            if (i === index) {
                suggestion.classList.add('bg-surface-alt');
            } else {
                suggestion.classList.remove('bg-surface-alt');
            }
        });
    }

    filterAlternatives(query) {
        const lowerQuery = query.toLowerCase();
        this.filteredAlternatives = {};
        
        Object.keys(this.alternatives).forEach(softwareName => {
            if (softwareName.toLowerCase().includes(lowerQuery)) {
                this.filteredAlternatives[softwareName] = this.alternatives[softwareName];
            }
        });
    }

    updateStatistics() {
        // Only update the results count display, not the statistics cards
        const totalSoftware = Object.keys(this.filteredAlternatives).length;
        
        // Update the visible count and total count for filtered results
        const visibleCount = document.getElementById('visibleCount');
        const totalCount = document.getElementById('totalCount');
        if (visibleCount) visibleCount.textContent = totalSoftware;
        if (totalCount) totalCount.textContent = totalSoftware;
    }

    renderAllAlternatives() {
        this.filteredAlternatives = { ...this.alternatives };
        this.renderAlternatives();
        // Update statistics to reflect the current filtered state
        this.updateStatistics();
    }

    renderAlternatives() {
        const container = document.getElementById('alternativesGrid');
        const loadingMessage = document.getElementById('loadingMessage');
        const noResultsMessage = document.getElementById('noResultsMessage');
        
        // Hide loading message
        if (loadingMessage) {
            loadingMessage.style.display = 'none';
        }

        // Check if we have results
        const hasResults = Object.keys(this.filteredAlternatives).length > 0;
        
        if (!hasResults) {
            container.innerHTML = '';
            noResultsMessage.classList.remove('hidden');
            // Update statistics to show 0 results
            this.updateStatistics();
            if (this.enablePagination) {
                const paginationContainer = document.getElementById('paginationContainer');
                if (paginationContainer) paginationContainer.classList.add('hidden');
            }
            return;
        }

        noResultsMessage.classList.add('hidden');
        
        // Clear container
        container.innerHTML = '';

        // Sort software names based on current sort
        const sortedSoftwareNames = this.sortSoftwareNames(Object.keys(this.filteredAlternatives));

        // Calculate pagination
        this.totalPages = Math.ceil(sortedSoftwareNames.length / this.itemsPerPage);
        if (this.currentPage > this.totalPages) {
            this.currentPage = Math.max(1, this.totalPages);
        }

        // Get software names for current page (or all if pagination disabled)
        let pageSoftwareNames;
        if (this.enablePagination) {
            const startIndex = (this.currentPage - 1) * this.itemsPerPage;
            const endIndex = Math.min(startIndex + this.itemsPerPage, sortedSoftwareNames.length);
            pageSoftwareNames = sortedSoftwareNames.slice(startIndex, endIndex);
        } else {
            pageSoftwareNames = sortedSoftwareNames;
        }

        // Render each software group
        pageSoftwareNames.forEach(softwareName => {
            const alternatives = this.filteredAlternatives[softwareName];
            const groupElement = this.createSoftwareGroup(softwareName, alternatives);
            container.appendChild(groupElement);
        });

        // Update statistics to reflect current filtered state
        this.updateStatistics();
        
        // Update pagination controls
        if (this.enablePagination) {
            this.updatePaginationControls();
        }
    }

    sortSoftwareNames(softwareNames) {
        return softwareNames.sort((a, b) => {
            const sortType = this.currentSort;
            const direction = this.sortDirections[sortType];
            let comparison = 0;

            switch (sortType) {
                case 'alternatives':
                    const alternativesA = this.filteredAlternatives[a] ? this.filteredAlternatives[a].length : 0;
                    const alternativesB = this.filteredAlternatives[b] ? this.filteredAlternatives[b].length : 0;
                    comparison = direction === 'asc' ? alternativesA - alternativesB : alternativesB - alternativesA;
                    break;
                case 'name':
                default:
                    comparison = direction === 'asc' ? 
                        a.localeCompare(b) : 
                        b.localeCompare(a);
                    break;
            }
            
            return comparison;
        });
    }

    createSoftwareGroup(softwareName, alternatives) {
        // Creates a group container for a software's alternatives
        const groupDiv = document.createElement('div');
        groupDiv.className = 'bg-surface rounded-lg border border-border shadow-sm p-5 sm:p-6 mb-6 mt-4';

        // Create header
        const headerDiv = document.createElement('div');
        headerDiv.className = 'flex items-center justify-between mb-5';
        
        const title = document.createElement('h2');
        title.className = 'text-xl font-bold text-text';
        title.textContent = softwareName;
        
        const subtitle = document.createElement('span');
        subtitle.className = 'text-xs font-medium text-primary bg-primary-light px-2.5 py-1 rounded-full flex-shrink-0 ml-3';
        subtitle.textContent = `${alternatives.length} alternative${alternatives.length !== 1 ? 's' : ''}`;
        
        headerDiv.appendChild(title);
        headerDiv.appendChild(subtitle);
        
        // Create alternatives grid
        const gridDiv = document.createElement('div');
        gridDiv.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';
        
        // Show only first N alternatives initially, or all if N or fewer
        const alternativesToShow = alternatives.slice(0, this.alternativesShowMoreThreshold);
        
        alternativesToShow.forEach(app => {
            const appCard = this.createApplicationCard(app);
            gridDiv.appendChild(appCard);
        });
        
        // Add "Show More" button if there are more than threshold alternatives
        if (alternatives.length > this.alternativesShowMoreThreshold) {
            const showMoreDiv = document.createElement('div');
            showMoreDiv.className = 'mt-4 text-center';
            
            const remainingCount = alternatives.length - this.alternativesShowMoreThreshold;
            const showMoreButton = document.createElement('button');
            showMoreButton.className = 'px-4 py-2 bg-primary text-surface rounded hover:bg-primary-hover transition-colors';
            showMoreButton.textContent = `Show ${remainingCount} more alternative${remainingCount !== 1 ? 's' : ''}`;
            
            showMoreButton.addEventListener('click', () => {
                // Add remaining alternatives
                const remainingAlternatives = alternatives.slice(this.alternativesShowMoreThreshold);
                remainingAlternatives.forEach(app => {
                    const appCard = this.createApplicationCard(app);
                    gridDiv.appendChild(appCard);
                });
                
                // Remove show more button
                showMoreDiv.remove();
            });
            
            showMoreDiv.appendChild(showMoreButton);
            groupDiv.appendChild(headerDiv);
            groupDiv.appendChild(gridDiv);
            groupDiv.appendChild(showMoreDiv);
        } else {
            groupDiv.appendChild(headerDiv);
            groupDiv.appendChild(gridDiv);
        }
        
        return groupDiv;
    }

    createApplicationCard(app) {
        // Creates a single application card for the alternatives page
        const card = document.createElement('div');
        card.className = 'app-card bg-surface rounded-lg border border-border shadow-sm overflow-hidden h-full flex flex-col';

        const openExternalInNewTab = document.querySelector('meta[name="open-external-new-tab"]')?.content === 'true' || false;
        const openInternalInNewTab = document.querySelector('meta[name="open-internal-new-tab"]')?.content === 'true' || false;

        // Helper for link target attributes
        const getLinkAttrs = (url, isInternal = null) => {
            if (isInternal === null) {
                isInternal = url.startsWith('/') || url.startsWith(window.location.origin);
            }
            if (isInternal && openInternalInNewTab) return ' target="_blank" rel="noopener"';
            if (isInternal && !openInternalInNewTab) return ' target="_self"';
            if (!isInternal && openExternalInNewTab) return ' target="_blank" rel="noopener noreferrer"';
            if (!isInternal && !openExternalInNewTab) return ' target="_self" rel="noreferrer"';
            return '';
        };

        // Icon / letter avatar
        const iconHtml = window.getAppIconHtml ? window.getAppIconHtml(app, 'sm') : '';

        // Status indicator icons
        const dependsIcon = app.depends_3rdparty ? `
            <span class="flex-shrink-0 cursor-help" title="Depends on a proprietary service outside the user's control">
                <svg class="w-4 h-4 text-icon-warning" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                </svg>
            </span>` : '';

        const docLanguageIcon = app.documentation_language && Array.isArray(app.documentation_language) && app.documentation_language.length > 0 ? `
            <span class="flex-shrink-0 cursor-help" title="Documentation only in ${app.documentation_language.join(', ')}">
                <svg class="w-4 h-4 text-icon-warning" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clip-rule="evenodd"/>
                </svg>
            </span>` : '';

        const forkIcon = app.fork_of ? `
            <span class="flex-shrink-0 cursor-help" title="Fork of ${app.fork_of}">
                <svg class="w-4 h-4 text-info" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                  <path d="M13.273 7.73a2.51 2.51 0 0 0-3.159-.31 2.5 2.5 0 0 0-.921 1.12 2.23 2.23 0 0 0-.13.44 4.52 4.52 0 0 1-4-4 2.23 2.23 0 0 0 .44-.13 2.5 2.5 0 0 0 1.54-2.31 2.45 2.45 0 0 0-.19-1A2.48 2.48 0 0 0 5.503.19a2.45 2.45 0 0 0-1-.19 2.5 2.5 0 0 0-2.31 1.54 2.52 2.52 0 0 0 .54 2.73c.35.343.79.579 1.27.68v5.1a2.411 2.411 0 0 0-.89.37 2.5 2.5 0 1 0 3.47 3.468 2.5 2.5 0 0 0 .42-1.387 2.45 2.45 0 0 0-.19-1 2.48 2.48 0 0 0-1.81-1.49v-2.4a5.52 5.52 0 0 0 2 1.73 5.65 5.65 0 0 0 2.09.6 2.5 2.5 0 0 0 4.95-.49 2.51 2.51 0 0 0-.77-1.72z"/>
                </svg>
            </span>` : '';

        // Stars and update age
        const starsHtml = app.stars ? `
            <span class="inline-flex items-center text-star cursor-help" title="Repository stars">
                <svg class="w-3 h-3 mr-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                </svg>
                <span class="text-xs font-medium">${this.formatStars(app.stars)}</span>
            </span>` : '';

        const days = this.getDaysSinceUpdate(app.last_updated);
        const clockHtml = days !== null ? `
            <span class="inline-flex items-center cursor-help ${this.getUpdateAgeColor(days)}" title="Last updated ${days} day${days === 1 ? '' : 's'} ago${app.last_updated ? ' (' + app.last_updated + ')' : ''}">
                <svg class="w-3 h-3 mr-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/>
                </svg>
                <span class="text-xs font-medium">${days}d</span>
            </span>` : '';

        // License badge
        let licenseBadge = '';
        if (app.license && app.license.length > 0) {
            const firstLicense = app.license[0];
            const licenseText = app.license.length === 1 ? firstLicense : `${firstLicense} (+${app.license.length - 1})`;
            const tooltipText = app.license.length > 1 ? app.license.join(', ') : firstLicense;
            const isNonFree = this.isNonFreeLicense(app.license);
            const licenseClass = isNonFree
                ? 'inline-block text-xs px-1.5 py-0.5 border border-warning text-warning bg-warning/10 rounded cursor-help'
                : 'inline-block text-xs px-1.5 py-0.5 border border-border text-text-muted bg-surface-alt rounded cursor-help';
            licenseBadge = `<span class="${licenseClass}" title="${tooltipText}">${licenseText}</span>`;
        }

        // Category badges (up to configured limit)
        const categoriesHtml = app.categories ? app.categories.slice(0, this.alternativesMaxCategoriesPerCard).map(category =>
            `<span class="inline-block bg-badge-bg text-badge-text text-xs px-2 py-0.5 rounded-full">${category}</span>`
        ).join('') + (app.categories.length > this.alternativesMaxCategoriesPerCard ? `<span class="inline-block bg-secondary text-secondary-text text-xs px-2 py-0.5 rounded-full">+${app.categories.length - this.alternativesMaxCategoriesPerCard}</span>` : '') : '';

        // Platform badges (up to configured limit)
        const platformsHtml = app.platforms && app.platforms.length > 0 ? app.platforms.slice(0, this.browseMaxPlatformsPerCard).map(platform => {
            const color = this.getPlatformColor(platform);
            return `<span class="inline-flex items-center text-text-muted text-xs">
                <span class="w-2.5 h-2.5 rounded-full mr-1.5 flex-shrink-0" style="background-color: ${color};"></span>${platform}
            </span>`;
        }).join('') + (app.platforms.length > this.alternativesMaxPlatformsPerCard ? `<span class="inline-block bg-secondary text-secondary-text text-xs px-1.5 py-0.5 rounded">+${app.platforms.length - this.alternativesMaxPlatformsPerCard}</span>` : '') : '';

        // Action links
        const demoLink = (app.demo_url && app.demo_url.trim()) ? `<a href="${app.demo_url}"${getLinkAttrs(app.demo_url, false)} class="text-link hover:text-link-hover font-medium">Demo</a>` : '';
        const sourceLink = (app.repo_url && app.repo_url.trim()) ? `<a href="${app.repo_url}"${getLinkAttrs(app.repo_url, false)} class="text-link hover:text-link-hover font-medium">Source</a>` : '';
        const websiteLink = (app.url && app.url.trim() && app.url !== app.repo_url && app.url !== app.demo_url) ? `<a href="${app.url}"${getLinkAttrs(app.url, false)} class="text-link hover:text-link-hover font-medium">Website</a>` : '';
        const detailsLink = `<a href="${this.basePath}/apps/${app.id}.html"${getLinkAttrs(`${this.basePath}/apps/${app.id}.html`, true)} class="text-link hover:text-link-hover font-medium">Details</a>`;

        // Build indicator icons row
        const indicatorIcons = [dependsIcon, docLanguageIcon, forkIcon].filter(Boolean).join('');

        card.innerHTML = `
            <div class="p-4 flex flex-col flex-grow">
                <div class="flex items-center gap-2.5 mb-2.5">
                    ${iconHtml}
                    <div class="flex-1 min-w-0">
                        <h3 class="text-base font-semibold text-text truncate leading-tight">
                            <a href="${this.basePath}/apps/${app.id}.html" class="hover:text-link">${app.name}</a>
                        </h3>
                    </div>
                    ${licenseBadge}
                </div>

                <div class="flex items-center flex-wrap gap-2.5 mb-2 text-xs">
                    ${starsHtml}${clockHtml}${indicatorIcons}
                </div>

                <p class="text-sm text-text-muted mb-3 flex-grow leading-relaxed">
                    ${this.truncateDescription(app.description)}
                </p>

                ${categoriesHtml ? `<div class="flex flex-wrap gap-1 mb-1.5">${categoriesHtml}</div>` : ''}
                ${platformsHtml ? `<div class="flex flex-wrap gap-2 mb-2">${platformsHtml}</div>` : ''}

                <div class="flex flex-wrap gap-2.5 text-xs mt-auto pt-2 border-t border-border">
                    ${websiteLink}${sourceLink}${demoLink}${detailsLink}
                </div>
            </div>
        `;

        return card;
    }

    // Helper methods
    getPlatformColor(platform) {
        // Common platform colors using CSS variables for light/dark mode support
        const platformVars = {
            'python': 'var(--color-platform-python)',
            'javascript': 'var(--color-platform-javascript)',
            'typescript': 'var(--color-platform-typescript)',
            'java': 'var(--color-platform-java)',
            'go': 'var(--color-platform-go)',
            'rust': 'var(--color-platform-rust)',
            'php': 'var(--color-platform-php)',
            'c': 'var(--color-platform-c)',
            'c++': 'var(--color-platform-cpp)',
            'c#': 'var(--color-platform-csharp)',
            'ruby': 'var(--color-platform-ruby)',
            'shell': 'var(--color-platform-shell)',
            'docker': 'var(--color-platform-docker)',
            'nodejs': 'var(--color-platform-nodejs)',
            'dart': 'var(--color-platform-dart)',
            'kotlin': 'var(--color-platform-kotlin)',
            'swift': 'var(--color-platform-swift)',
            'scala': 'var(--color-platform-scala)',
            'deb': 'var(--color-platform-deb)',
            'k8s': 'var(--color-platform-k8s)',
            'perl': 'var(--color-platform-perl)',
            'elixir': 'var(--color-platform-elixir)',
            '.net': 'var(--color-platform-dotnet)',
            'dotnet': 'var(--color-platform-dotnet)',
            'lua': 'var(--color-platform-lua)',
            'django': 'var(--color-platform-django)',
            'haskell': 'var(--color-platform-haskell)',
            'ansible': 'var(--color-platform-ansible)',
            'deno': 'var(--color-platform-deno)',
            'erlang': 'var(--color-platform-erlang)',
            'ocaml': 'var(--color-platform-ocaml)',
            'commonlisp': 'var(--color-platform-commonlisp)',
            'nix': 'var(--color-platform-nix)',
            'crystal': 'var(--color-platform-crystal)',
            'plpgsql': 'var(--color-platform-plpgsql)',
            'assembly': 'var(--color-platform-assembly)',
            'objective-c': 'var(--color-platform-objectivec)',
            'objectivec': 'var(--color-platform-objectivec)',
            'haxe': 'var(--color-platform-haxe)'
        };
        
        if (!platform) {
            return 'var(--color-platform-default)';
        }
        
        return platformVars[platform.toLowerCase()] || 'var(--color-platform-default)';
    }

    formatStars(stars) {
        if (stars >= 1000) {
            return (stars / 1000).toFixed(1) + 'k';
        }
        return stars.toString();
    }

    getDaysSinceUpdate(lastUpdated) {
        if (!lastUpdated) return null;
        
        const updateDate = new Date(lastUpdated);
        const today = new Date();
        
        // Normalize both dates to midnight (start of day) to calculate calendar days
        const updateMidnight = new Date(updateDate.getFullYear(), updateDate.getMonth(), updateDate.getDate());
        const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        
        const diffTime = Math.abs(todayMidnight - updateMidnight);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        return diffDays;
    }

    getUpdateAgeColor(days) {
        if (days === null || days === undefined) return 'text-text-muted';
        if (days > 365) return 'text-error';
        if (days > 180) return 'text-warning';
        return 'text-success';
    }

    truncateDescription(description, maxLength = null) {
        if (!description) return '';
        
        if (maxLength === null) {
            maxLength = this.alternativesDescriptionLength;
        }
        if (this.alternativesDescriptionFull || description.length <= maxLength) {
            return description;
        }
        
        const truncated = description.substring(0, maxLength).trim();
        const lastSpace = truncated.lastIndexOf(' ');
        const finalText = lastSpace > 0 ? truncated.substring(0, lastSpace) : truncated;
        
        return finalText + '...';
    }

    isNonFreeLicense(licenses) {
        if (!licenses || licenses.length === 0) return false;
        
        // A license is non-free if it IS in the non-free licenses set
        return licenses.some(license => 
            this.nonFreeLicenses.has(license)
        );
    }

    parseUrlParameters() {
        const hash = window.location.hash;
        if (hash && hash.length > 1) {
            // Remove the # and decode any URL encoding
            const searchTerm = decodeURIComponent(hash.substring(1));
            
            // Set the search input value
            const heroSearch = document.getElementById('alternatives-search');
            if (heroSearch) {
                heroSearch.value = searchTerm;
                
                // Trigger the search
                this.filterAlternatives(searchTerm);
                this.currentPage = 1; // Reset to first page
                this.renderAlternatives();
                
                // Scroll to the search input
                heroSearch.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }

    // Pagination methods
    goToPage(page) {
        if (page >= 1 && page <= this.totalPages && page !== this.currentPage) {
            this.currentPage = page;
            this.renderAlternatives();
            if (this.enablePagination) {
                this.updatePaginationControls();
            }
        }
    }

    generatePageRange() {
        const pages = [];
        const totalPages = this.totalPages;
        const currentPage = this.currentPage;
        
        if (totalPages <= 7) {
            // Show all pages if 7 or fewer
            for (let i = 1; i <= totalPages; i++) {
                pages.push(i);
            }
        } else {
            // Always show first page
            pages.push(1);
            
            if (currentPage <= 3) {
                // Near the start: 1, 2, 3, 4, ..., last
                pages.push(2, 3, 4);
                pages.push('...');
                pages.push(totalPages);
            } else if (currentPage >= totalPages - 2) {
                // Near the end: 1, ..., last-3, last-2, last-1, last
                pages.push('...');
                pages.push(totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
            } else {
                // In the middle: 1, ..., current-1, current, current+1, ..., last
                pages.push('...');
                pages.push(currentPage - 1, currentPage, currentPage + 1);
                pages.push('...');
                pages.push(totalPages);
            }
        }
        
        return pages;
    }

    updatePaginationControls() {
        const paginationContainer = document.getElementById('paginationContainer');
        const currentPageElement = document.getElementById('currentPage');
        const totalPagesElement = document.getElementById('totalPages');
        const paginationButtons = document.getElementById('paginationButtons');

        if (this.totalPages > 1) {
            paginationContainer.classList.remove('hidden');

            if (currentPageElement) currentPageElement.textContent = this.currentPage;
            if (totalPagesElement) totalPagesElement.textContent = this.totalPages;

            // Generate pagination buttons
            if (paginationButtons) {
                paginationButtons.innerHTML = '';
                
                const buttonBaseClass = 'px-3 py-2 text-sm font-medium rounded transition-colors';
                const activeClass = `${buttonBaseClass} bg-primary text-surface`;
                const inactiveClass = `${buttonBaseClass} bg-surface-alt text-text hover:bg-secondary`;
                const disabledClass = `${buttonBaseClass} bg-surface-alt text-text-muted cursor-not-allowed`;
                const ellipsisClass = 'px-2 py-2 text-sm text-text-muted';

                // Previous button («)
                const prevButton = document.createElement('button');
                prevButton.innerHTML = '&laquo;';
                prevButton.title = 'Previous page';
                prevButton.className = this.currentPage <= 1 ? disabledClass : inactiveClass;
                prevButton.disabled = this.currentPage <= 1;
                prevButton.addEventListener('click', () => this.goToPage(this.currentPage - 1));
                paginationButtons.appendChild(prevButton);

                // Page number buttons
                const pageRange = this.generatePageRange();
                pageRange.forEach(page => {
                    if (page === '...') {
                        const ellipsis = document.createElement('span');
                        ellipsis.className = ellipsisClass;
                        ellipsis.textContent = '…';
                        paginationButtons.appendChild(ellipsis);
                    } else {
                        const pageButton = document.createElement('button');
                        pageButton.textContent = page;
                        pageButton.className = page === this.currentPage ? activeClass : inactiveClass;
                        pageButton.addEventListener('click', () => this.goToPage(page));
                        paginationButtons.appendChild(pageButton);
                    }
                });

                // Next button (»)
                const nextButton = document.createElement('button');
                nextButton.innerHTML = '&raquo;';
                nextButton.title = 'Next page';
                nextButton.className = this.currentPage >= this.totalPages ? disabledClass : inactiveClass;
                nextButton.disabled = this.currentPage >= this.totalPages;
                nextButton.addEventListener('click', () => this.goToPage(this.currentPage + 1));
                paginationButtons.appendChild(nextButton);
            }
        } else {
            paginationContainer.classList.add('hidden');
        }
    }

    showError(message) {
        const container = document.getElementById('alternativesGrid');
        const loadingMessage = document.getElementById('loadingMessage');
        
        if (loadingMessage) {
            loadingMessage.style.display = 'none';
        }

        container.innerHTML = `
            <div class="text-center py-12">
                <div class="text-error">
                    <svg class="mx-auto h-12 w-12 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <h3 class="text-lg font-medium text-text mb-2">Error Loading Alternatives</h3>
                    <p class="text-text-muted">${message}</p>
                </div>
            </div>
        `;
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new AlternativesPage();
});
