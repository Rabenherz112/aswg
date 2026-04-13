// Browse page functionality
class BrowsePage {
    constructor() {
        this.applications = [];
        this.filteredApplications = [];
        this.platforms = new Set();
        this.selectedPlatforms = new Set();
        this.licenses = new Set();
        this.selectedLicenses = new Set();
        this.categories = new Set();
        this.selectedCategories = new Set();
        this.nonFreeLicenses = new Set();
        this.showNonFreeOnly = false;
        this.currentSort = 'name';
        this.basePath = document.querySelector('meta[name="base-path"]')?.content || '';

        // Sort direction tracking
        this.sortDirections = {
            'name': 'asc',      // asc = A-Z, desc = Z-A
            'stars': 'desc',    // desc = highest first, asc = lowest first
            'updated': 'desc',  // desc = newest first, asc = oldest first
            'dateAdded': 'desc' // desc = newest first, asc = oldest first
        };

        // Pagination settings
        this.currentPage = 1;
        this.itemsPerPage = 60;
        this.totalPages = 1;
        this.enablePagination = true;

        // Mobile detection
        this.isMobile = window.innerWidth < 1024;

        // Star count range filter
        this.starsMin = 0;
        this.starsMax = Infinity;
        this.starsDataMin = 0;
        this.starsDataMax = 100000;

        // Last updated range filter (in days)
        this.updatedMin = 0;
        this.updatedMax = Infinity;
        this.updatedDataMax = 365; // Will be calculated from dataset
        this.includeNoUpdateDate = true; // Include apps without update date by default

        this.init();
    }

    async init() {
        await this.loadSearchData();
        await this.loadLicenseData();
        await this.loadConfig();
        this.extractPlatforms();
        this.extractLicenses();
        this.extractCategories();
        this.calculateRangeFilterBounds();
        this.parseUrlParameters();
        this.setupEventListeners();
        this.setupPlatformFilters();
        this.setupLicenseFilters();
        this.setupCategoryFilters();
        this.setupFilterSearch();
        this.setupRangeFilters();
        if (this.enablePagination) {
            this.setupPaginationEventListeners();
            if (this.letUserChoosePaginationSize) {
                this.setupPaginationSizeChooser();
            }
        }
        this.checkAndShowGitSortButton();
        this.updateSortButtons('sortName');

        // Setup mobile/desktop UI
        this.handleResponsiveUI();
        this.setupMobileFilterDrawer();
        this.setupMobileFilters();
        this.setupMobileFilterSearch();
        this.setupMobileRangeFilters();

        // Handle window resize
        window.addEventListener('resize', () => {
            this.handleResize();
        });

        this.filterSortAndRender();
    }

    async loadConfig() {
        // Helper function to get config value from meta tag with fallback
        const getConfigValue = (metaName, defaultValue, parser = parseInt) => {
            const meta = document.querySelector(`meta[name="${metaName}"]`);
            return meta ? parser(meta.content) || defaultValue : defaultValue;
        };

        try {
            // Load all configuration values using the helper function
            this.itemsPerPage = getConfigValue('items-per-page', 60);
            this.enablePagination = getConfigValue('enable-pagination', false, (val) => val.toLowerCase() === 'true');
            this.letUserChoosePaginationSize = getConfigValue('let-user-choose-pagination-size', false, (val) => val.toLowerCase() === 'true');
            this.browseDescriptionLength = getConfigValue('browse-description-length', 80);
            this.browseDescriptionFull = getConfigValue('browse-description-full', false, (val) => val.toLowerCase() === 'true');
            this.browseMaxCategoriesPerCard = getConfigValue('browse-max-categories-per-card', 2);
            this.browseMaxPlatformsPerCard = getConfigValue('browse-max-platforms-per-card', 3);
        } catch (error) {
            console.log('Using default configuration values');
        }
    }

    async loadSearchData() {
        try {
            const response = await fetch(this.basePath + '/static/data/search.json');
            const data = await response.json();
            this.applications = data.apps || [];
            this.filteredApplications = [...this.applications];
            this.gitDataAvailable = data.git_data_available || false;
        } catch (error) {
            console.error('Failed to load search data:', error);
        }
    }

    checkAndShowGitSortButton() {
        const sortDateAddedButton = document.getElementById('sortDateAdded');
        if (sortDateAddedButton && this.gitDataAvailable) {
            sortDateAddedButton.style.display = '';
        }
    }

    parseUrlParameters() {
        const urlParams = new URLSearchParams(window.location.search);
        const categoryParam = urlParams.get('category');
        
        if (categoryParam) {
            // Create a helper to convert category names to URL-friendly slugs
            const slugify = (text) => {
                return text.toLowerCase()
                    .replace(/\s+/g, '-')
                    .replace(/[^a-z0-9-]/g, '-')
                    .replace(/-+/g, '-')
                    .replace(/^-+|-+$/g, '');
            };
            
            // Find matching category by comparing slugified versions and direct matches
            let matchingCategory = Array.from(this.categories).find(cat => {
                const slugifiedCat = slugify(cat);
                return slugifiedCat === categoryParam.toLowerCase() || 
                       cat.toLowerCase() === categoryParam.toLowerCase();
            });
            
            if (matchingCategory) {
                this.selectedCategories.add(matchingCategory);
            }
        }
    }

    setupFilterSearch() {
        // Handle search toggle buttons
        document.querySelectorAll('.filter-search-toggle').forEach(button => {
            button.addEventListener('click', (e) => {
                const targetId = e.currentTarget.getAttribute('data-target');
                const searchContainer = document.getElementById(targetId);
                const searchInput = searchContainer.querySelector('input');
                
                if (searchContainer.classList.contains('hidden')) {
                    searchContainer.classList.remove('hidden');
                    searchInput.focus();
                } else {
                    searchContainer.classList.add('hidden');
                    searchInput.value = '';
                    // Clear any search filtering
                    this.clearFilterSearch(targetId);
                }
            });
        });
    
        // Handle search input
        const searchInputs = ['categorySearch', 'platformSearch', 'licenseSearch'];
        searchInputs.forEach(searchId => {
            const searchContainer = document.getElementById(searchId);
            if (searchContainer) {
                const searchInput = searchContainer.querySelector('input');
                searchInput.addEventListener('input', (e) => {
                    this.filterCheckboxes(searchId, e.target.value);
                });
            }
        });
    }
    
    filterCheckboxes(searchId, query) {
        const filterType = searchId.replace('Search', '');
        const filtersContainer = document.getElementById(filterType + 'Filters');
        
        if (!filtersContainer) return;
        
        const labels = filtersContainer.querySelectorAll('.filter-label');
        const lowerQuery = query.toLowerCase();
        
        labels.forEach(label => {
            // Get the main text content excluding the count span
            const textSpan = label.querySelector('span.flex-1');
            if (textSpan) {
                // Get only the text nodes, excluding the count span
                const clonedSpan = textSpan.cloneNode(true);
                const countSpan = clonedSpan.querySelector('.text-xs.opacity-70');
                if (countSpan) {
                    countSpan.remove();
                }
                const text = clonedSpan.textContent.trim().toLowerCase();
                
                if (text.includes(lowerQuery)) {
                    label.style.display = '';
                } else {
                    label.style.display = 'none';
                }
            } else {
                // Fallback to search full text if structure is different (i.e I ever update the HTML structure and forget to update this)
                const text = label.textContent.toLowerCase();
                if (text.includes(lowerQuery)) {
                    label.style.display = '';
                } else {
                    label.style.display = 'none';
                }
            }
        });
    }
    
    clearFilterSearch(searchId) {
        const filterType = searchId.replace('Search', '');
        const filtersContainer = document.getElementById(filterType + 'Filters');
        
        if (!filtersContainer) return;
        
        const labels = filtersContainer.querySelectorAll('.filter-label');
        labels.forEach(label => {
            label.style.display = '';
        });
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

    extractPlatforms() {
        this.applications.forEach(app => {
            if (app.platforms) {
                app.platforms.forEach(platform => {
                    if (platform && platform.trim()) {
                        this.platforms.add(platform.trim());
                    }
                });
            }
        });
    }

    extractLicenses() {
        this.applications.forEach(app => {
            if (app.license) {
                app.license.forEach(license => {
                    if (license && license.trim()) {
                        this.licenses.add(license.trim());
                    }
                });
            }
        });
    }

    extractCategories() {
        this.applications.forEach(app => {
            if (app.categories) {
                app.categories.forEach(category => {
                    if (category && category.trim()) {
                        this.categories.add(category.trim());
                    }
                });
            }
        });
    }

    calculateRangeFilterBounds() {
        // Calculate star count bounds
        let maxStars = 0;
        let maxDays = 0;

        this.applications.forEach(app => {
            // Stars
            if (app.stars && app.stars > maxStars) {
                maxStars = app.stars;
            }

            // Last updated
            const days = this.getDaysSinceUpdate(app.last_updated);
            if (days !== null && days > maxDays) {
                maxDays = days;
            }
        });

        // Define discrete step values for stars slider (logarithmic-like progression)
        this.starsSteps = [0, 10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000, 15000, 20000, 25000, 50000, 75000, 100000, 150000, 200000, 250000, 500000, 750000, 1000000];
        
        // Filter steps to only include values up to and including the next step above maxStars
        const maxStarsIndex = this.starsSteps.findIndex(s => s >= maxStars);
        if (maxStarsIndex >= 0) {
            this.starsSteps = this.starsSteps.slice(0, maxStarsIndex + 1);
        } else {
            // maxStars exceeds all predefined steps - add a step at or above maxStars
            // Round up to a nice number following the progression pattern
            // After 1M, use increments of 500k, then 1M for larger values
            let nextStep;
            if (maxStars <= 1500000) {
                nextStep = Math.ceil(maxStars / 250000) * 250000; // Round to nearest 250k
            } else if (maxStars <= 5000000) {
                nextStep = Math.ceil(maxStars / 500000) * 500000; // Round to nearest 500k
            } else {
                nextStep = Math.ceil(maxStars / 1000000) * 1000000; // Round to nearest 1M
            }
            this.starsSteps.push(nextStep);
        }
        // Ensure we have at least a reasonable range
        if (this.starsSteps.length < 2) {
            this.starsSteps = [0, 100];
        }
        
        this.starsDataMin = 0;
        this.starsDataMax = this.starsSteps[this.starsSteps.length - 1];
        // Keep starsMax at Infinity to show all apps by default (user can filter if needed)
        // this.starsMax remains Infinity from constructor

        // Define discrete step values for days slider (meaningful time periods)
        // Include steps beyond 5 years to allow filtering of older apps
        this.daysSteps = [0, 1, 3, 7, 14, 21, 30, 60, 90, 120, 180, 365, 730, 1095, 1825, 2555, 3285, 3650, 5475, 7300];
        
        // Filter steps to only include values up to and including the next step above maxDays
        const maxDaysIndex = this.daysSteps.findIndex(d => d >= maxDays);
        if (maxDaysIndex >= 0) {
            // Include the step that's >= maxDays to ensure all apps are visible
            this.daysSteps = this.daysSteps.slice(0, maxDaysIndex + 1);
        } else {
            // maxDays exceeds all predefined steps - add a step at or above maxDays
            // Round up to a nice number following the progression pattern
            // After 7300 days (20 years), use increments of 1 year, then 5 years for larger values
            let nextStep;
            if (maxDays <= 10950) { // ~30 years
                nextStep = Math.ceil(maxDays / 365) * 365; // Round to nearest year
            } else if (maxDays <= 18250) { // ~50 years
                nextStep = Math.ceil(maxDays / 1825) * 1825; // Round to nearest 5 years
            } else {
                nextStep = Math.ceil(maxDays / 3650) * 3650; // Round to nearest 10 years
            }
            this.daysSteps.push(nextStep);
        }
        // Ensure we have at least a reasonable range
        if (this.daysSteps.length < 2) {
            this.daysSteps = [0, 30];
        }
        
        this.updatedDataMax = this.daysSteps[this.daysSteps.length - 1];
        // Keep updatedMax at Infinity to show all apps by default (user can filter if needed)
        // this.updatedMax remains Infinity from constructor
    }

    // Convert slider position (0 to steps.length-1) to actual value
    sliderPosToValue(pos, steps) {
        const index = Math.round(pos);
        return steps[Math.min(Math.max(0, index), steps.length - 1)];
    }

    // Convert actual value to slider position
    valueToSliderPos(value, steps) {
        // If value is Infinity, return the last step position
        if (value === Infinity) {
            return steps.length - 1;
        }
        // Find the closest step
        let closestIndex = 0;
        let closestDiff = Math.abs(steps[0] - value);
        for (let i = 1; i < steps.length; i++) {
            const diff = Math.abs(steps[i] - value);
            if (diff < closestDiff) {
                closestDiff = diff;
                closestIndex = i;
            }
        }
        return closestIndex;
    }

    // Format days as human-readable string
    formatDaysValue(days) {
        if (days === 0) return '0';
        if (days < 14) return days + 'd';
        if (days < 60) return Math.round(days / 7) + 'w';
        if (days < 365) return Math.round(days / 30) + 'mo';
        return (days / 365).toFixed(days % 365 === 0 ? 0 : 1) + 'y';
    }

    // Parse days from human-readable string
    parseDaysValue(str) {
        str = str.trim().toLowerCase();
        
        if (str.endsWith('y')) {
            const num = parseFloat(str);
            if (isNaN(num)) return 0;
            return Math.round(num * 365);
        }
        if (str.endsWith('mo')) {
            const num = parseFloat(str);
            if (isNaN(num)) return 0;
            return Math.round(num * 30);
        }
        if (str.endsWith('w')) {
            const num = parseFloat(str);
            if (isNaN(num)) return 0;
            return Math.round(num * 7);
        }
        if (str.endsWith('d')) {
            const num = parseInt(str);
            return isNaN(num) ? 0 : num;
        }
        const num = parseInt(str);
        return isNaN(num) ? 0 : num;
    }

    setupRangeFilters() {
        // Setup star count range filter
        this.setupStarsRangeFilter('starsMinSlider', 'starsMaxSlider', 'starsMinValue', 'starsMaxValue', 'starsRangeHighlight', 'resetStarsFilter');

        // Setup last updated range filter
        this.setupUpdatedRangeFilter('updatedMinSlider', 'updatedMaxSlider', 'updatedMinValue', 'updatedMaxValue', 'updatedRangeHighlight', 'resetUpdatedFilter');

        // Setup "include no update date" checkbox
        this.setupIncludeNoUpdateDateCheckbox();
    }

    setupIncludeNoUpdateDateCheckbox() {
        const checkbox = document.getElementById('includeNoUpdateDate');
        if (checkbox) {
            checkbox.checked = this.includeNoUpdateDate;
            checkbox.addEventListener('change', (e) => {
                this.includeNoUpdateDate = e.target.checked;
                this.currentPage = 1;
                this.filterSortAndRender();
                // Sync with mobile
                const mobileCheckbox = document.getElementById('mobileIncludeNoUpdateDate');
                if (mobileCheckbox) {
                    mobileCheckbox.checked = e.target.checked;
                }
            });
        }
    }

    setupStarsRangeFilter(minSliderId, maxSliderId, minValueId, maxValueId, highlightId, resetId, syncTarget = 'mobile', initializeFromState = false) {
        const minSlider = document.getElementById(minSliderId);
        const maxSlider = document.getElementById(maxSliderId);
        const minValue = document.getElementById(minValueId);
        const maxValue = document.getElementById(maxValueId);
        const highlight = document.getElementById(highlightId);
        const resetBtn = document.getElementById(resetId);

        if (!minSlider || !maxSlider) return;

        const steps = this.starsSteps;
        const maxPos = steps.length - 1;

        // Set slider bounds (position-based, not value-based)
        minSlider.min = 0;
        minSlider.max = maxPos;
        minSlider.step = 1;
        maxSlider.min = 0;
        maxSlider.max = maxPos;
        maxSlider.step = 1;

        // Set initial slider values
        if (initializeFromState) {
            minSlider.value = this.valueToSliderPos(this.starsMin, steps);
            maxSlider.value = this.valueToSliderPos(this.starsMax, steps);
        } else {
            minSlider.value = 0;
            maxSlider.value = maxPos;
        }

        // Set initial display values
        if (initializeFromState) {
            if (minValue) minValue.value = this.formatStarsValue(this.starsMin);
            if (maxValue) {
                // If starsMax is Infinity, use the last step value for display
                const isAtMax = this.starsMax === Infinity || this.starsMax >= steps[maxPos];
                const displayMax = this.starsMax === Infinity ? steps[maxPos] : this.starsMax;
                maxValue.value = this.formatStarsValue(displayMax) + (isAtMax ? '+' : '');
            }
        } else {
            if (minValue) minValue.value = this.formatStarsValue(steps[0]);
            if (maxValue) maxValue.value = this.formatStarsValue(steps[maxPos]) + '+';
        }

        // Update highlight
        this.updateRangeHighlight(minSlider, maxSlider, highlight);

        // Min slider event
        minSlider.addEventListener('input', () => {
            let minPos = parseInt(minSlider.value);
            let maxPos = parseInt(maxSlider.value);

            // Prevent min slider from reaching or exceeding max slider position
            // Allow same position only if there's only one step available
            if (minPos >= maxPos && maxPos > 0) {
                minPos = Math.max(0, maxPos - 1);
                minSlider.value = minPos;
            }

            const minVal = steps[minPos];
            const maxVal = steps[maxPos];
            this.starsMin = minVal;
            this.starsMax = maxPos === steps.length - 1 ? Infinity : maxVal;
            if (minValue) minValue.value = this.formatStarsValue(minVal);
            this.updateRangeHighlight(minSlider, maxSlider, highlight);
            this.updateResetButton(resetId, minPos !== 0 || maxPos !== steps.length - 1);
            this.currentPage = 1;
            this.filterSortAndRender();
            // Use this.starsMax to ensure sync matches stored state (may be Infinity when at max)
            this.syncStarsSlider(syncTarget, minVal, this.starsMax);
        });

        // Max slider event
        maxSlider.addEventListener('input', () => {
            let minPos = parseInt(minSlider.value);
            let maxPos = parseInt(maxSlider.value);

            // Prevent max slider from reaching or going below min slider position
            // Allow same position only if there's only one step available
            if (maxPos <= minPos && minPos < steps.length - 1) {
                maxPos = Math.min(steps.length - 1, minPos + 1);
                maxSlider.value = maxPos;
            }

            const minVal = steps[minPos];
            const maxVal = steps[maxPos];
            // If slider is at max position, set filter to Infinity to show all apps
            this.starsMax = maxPos === steps.length - 1 ? Infinity : maxVal;
            const isAtMax = maxPos === steps.length - 1;
            if (maxValue) maxValue.value = this.formatStarsValue(maxVal) + (isAtMax ? '+' : '');
            this.updateRangeHighlight(minSlider, maxSlider, highlight);
            this.updateResetButton(resetId, minPos !== 0 || maxPos !== steps.length - 1);
            this.currentPage = 1;
            this.filterSortAndRender();
            this.syncStarsSlider(syncTarget, minVal, isAtMax ? Infinity : maxVal);
        });

        // Editable min value - allows custom values (not just steps)
        if (minValue) {
            minValue.addEventListener('change', () => {
                let val = this.parseStarsValue(minValue.value);
                val = Math.max(0, Math.min(val, this.starsMax));
                this.starsMin = val; // Store exact value for filtering
                let pos = this.valueToSliderPos(val, steps);
                
                // Ensure min slider doesn't reach or exceed max slider position
                const maxPos = parseInt(maxSlider.value);
                if (pos >= maxPos && maxPos > 0) {
                    pos = Math.max(0, maxPos - 1);
                }
                
                minSlider.value = pos; // Slider snaps to nearest step visually
                minValue.value = this.formatStarsValue(val); // Display exact value
                this.updateRangeHighlight(minSlider, maxSlider, highlight);
                this.updateResetButton(resetId, val !== steps[0] || this.starsMax !== Infinity);
                this.currentPage = 1;
                this.filterSortAndRender();
                this.syncStarsSlider(syncTarget, val, this.starsMax);
            });

            minValue.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    minValue.blur();
                }
            });
        }

        // Editable max value - allows custom values (not just steps)
        if (maxValue) {
            maxValue.addEventListener('change', () => {
                let val = this.parseStarsValue(maxValue.value);
                val = Math.max(this.starsMin, val);
                // If value is at or above the last step, set filter to Infinity
                const isAtMax = val >= steps[steps.length - 1];
                this.starsMax = isAtMax ? Infinity : val; // Store exact value for filtering
                const pos = this.valueToSliderPos(val, steps);
                maxSlider.value = pos; // Slider snaps to nearest step visually
                maxValue.value = this.formatStarsValue(val) + (isAtMax ? '+' : ''); // Display exact value
                this.updateRangeHighlight(minSlider, maxSlider, highlight);
                // Show reset button if either min or max is not at default (min=steps[0], max=Infinity)
                this.updateResetButton(resetId, this.starsMin !== steps[0] || this.starsMax !== Infinity);
                this.currentPage = 1;
                this.filterSortAndRender();
                this.syncStarsSlider(syncTarget, this.starsMin, isAtMax ? Infinity : val);
            });

            maxValue.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    maxValue.blur();
                }
            });
        }

        // Reset button
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.starsMin = steps[0];
                this.starsMax = Infinity; // Reset to show all apps
                minSlider.value = 0;
                maxSlider.value = steps.length - 1;
                if (minValue) minValue.value = this.formatStarsValue(steps[0]);
                if (maxValue) maxValue.value = this.formatStarsValue(steps[steps.length - 1]) + '+';
                this.updateRangeHighlight(minSlider, maxSlider, highlight);
                this.updateResetButton(resetId, false);
                this.currentPage = 1;
                this.filterSortAndRender();
                this.syncStarsSlider(syncTarget, steps[0], Infinity);
            });
        }
    }

    setupUpdatedRangeFilter(minSliderId, maxSliderId, minValueId, maxValueId, highlightId, resetId, syncTarget = 'mobile', initializeFromState = false) {
        const minSlider = document.getElementById(minSliderId);
        const maxSlider = document.getElementById(maxSliderId);
        const minValue = document.getElementById(minValueId);
        const maxValue = document.getElementById(maxValueId);
        const highlight = document.getElementById(highlightId);
        const resetBtn = document.getElementById(resetId);

        if (!minSlider || !maxSlider) return;

        const steps = this.daysSteps;
        const maxPos = steps.length - 1;

        // Set slider bounds (position-based, not value-based)
        minSlider.min = 0;
        minSlider.max = maxPos;
        minSlider.step = 1;
        maxSlider.min = 0;
        maxSlider.max = maxPos;
        maxSlider.step = 1;

        // Set initial slider values
        if (initializeFromState) {
            minSlider.value = this.valueToSliderPos(this.updatedMin, steps);
            maxSlider.value = this.valueToSliderPos(this.updatedMax, steps);
        } else {
            minSlider.value = 0;
            maxSlider.value = maxPos;
        }

        // Set initial display values
        if (initializeFromState) {
            if (minValue) minValue.value = this.formatDaysValue(this.updatedMin);
            if (maxValue) {
                // If updatedMax is Infinity, use the last step value for display
                const displayMax = this.updatedMax === Infinity ? steps[maxPos] : this.updatedMax;
                const isAtMax = this.updatedMax === Infinity || this.updatedMax >= steps[maxPos];
                maxValue.value = this.formatDaysValue(displayMax) + (isAtMax ? '+' : '');
            }
        } else {
            if (minValue) minValue.value = this.formatDaysValue(steps[0]);
            if (maxValue) maxValue.value = this.formatDaysValue(steps[maxPos]) + '+';
        }

        // Update highlight
        this.updateRangeHighlight(minSlider, maxSlider, highlight);

        // Min slider event
        minSlider.addEventListener('input', () => {
            let minPos = parseInt(minSlider.value);
            let maxPos = parseInt(maxSlider.value);

            // Prevent min slider from reaching or exceeding max slider position
            // Allow same position only if there's only one step available
            if (minPos >= maxPos && maxPos > 0) {
                minPos = Math.max(0, maxPos - 1);
                minSlider.value = minPos;
            }

            const minVal = steps[minPos];
            const maxVal = steps[maxPos];
            this.updatedMin = minVal;
            this.updatedMax = maxPos === steps.length - 1 ? Infinity : maxVal;
            if (minValue) minValue.value = this.formatDaysValue(minVal);
            this.updateRangeHighlight(minSlider, maxSlider, highlight);
            this.updateResetButton(resetId, minPos !== 0 || maxPos !== steps.length - 1);
            this.currentPage = 1;
            this.filterSortAndRender();
            // Use this.updatedMax to ensure sync matches stored state (may be Infinity when at max)
            this.syncUpdatedSlider(syncTarget, minVal, this.updatedMax);
        });

        // Max slider event
        maxSlider.addEventListener('input', () => {
            let minPos = parseInt(minSlider.value);
            let maxPos = parseInt(maxSlider.value);

            // Prevent max slider from reaching or going below min slider position
            // Allow same position only if there's only one step available
            if (maxPos <= minPos && minPos < steps.length - 1) {
                maxPos = Math.min(steps.length - 1, minPos + 1);
                maxSlider.value = maxPos;
            }

            const minVal = steps[minPos];
            const maxVal = steps[maxPos];
            // If slider is at max position, set filter to Infinity to show all apps
            this.updatedMax = maxPos === steps.length - 1 ? Infinity : maxVal;
            if (maxValue) maxValue.value = this.formatDaysValue(maxVal) + (maxPos === steps.length - 1 ? '+' : '');
            this.updateRangeHighlight(minSlider, maxSlider, highlight);
            this.updateResetButton(resetId, minPos !== 0 || maxPos !== steps.length - 1);
            this.currentPage = 1;
            this.filterSortAndRender();
            this.syncUpdatedSlider(syncTarget, minVal, maxPos === steps.length - 1 ? Infinity : maxVal);
        });

        // Editable min value - allows custom values (not just steps)
        if (minValue) {
            minValue.addEventListener('change', () => {
                let val = this.parseDaysValue(minValue.value);
                val = Math.max(0, Math.min(val, this.updatedMax));
                this.updatedMin = val; // Store exact value for filtering
                let pos = this.valueToSliderPos(val, steps);
                
                // Ensure min slider doesn't reach or exceed max slider position
                const maxPos = parseInt(maxSlider.value);
                if (pos >= maxPos && maxPos > 0) {
                    pos = Math.max(0, maxPos - 1);
                }
                
                minSlider.value = pos; // Slider snaps to nearest step visually
                minValue.value = this.formatDaysValue(val); // Display exact value
                this.updateRangeHighlight(minSlider, maxSlider, highlight);
                this.updateResetButton(resetId, val !== steps[0] || this.updatedMax !== Infinity);
                this.currentPage = 1;
                this.filterSortAndRender();
                this.syncUpdatedSlider(syncTarget, val, this.updatedMax);
            });

            minValue.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    minValue.blur();
                }
            });
        }

        // Editable max value - allows custom values (not just steps)
        if (maxValue) {
            maxValue.addEventListener('change', () => {
                let val = this.parseDaysValue(maxValue.value);
                val = Math.max(this.updatedMin, val);
                // If value is at or above the last step, set filter to Infinity
                const isAtMax = val >= steps[steps.length - 1];
                this.updatedMax = isAtMax ? Infinity : val; // Store exact value for filtering
                const pos = this.valueToSliderPos(val, steps);
                maxSlider.value = pos; // Slider snaps to nearest step visually
                maxValue.value = this.formatDaysValue(val) + (isAtMax ? '+' : ''); // Display exact value
                this.updateRangeHighlight(minSlider, maxSlider, highlight);
                this.updateResetButton(resetId, this.updatedMin !== steps[0] || this.updatedMax !== Infinity);
                this.currentPage = 1;
                this.filterSortAndRender();
                this.syncUpdatedSlider(syncTarget, this.updatedMin, isAtMax ? Infinity : val);
            });

            maxValue.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    maxValue.blur();
                }
            });
        }

        // Reset button
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.updatedMin = steps[0];
                this.updatedMax = Infinity; // Reset to show all apps
                minSlider.value = 0;
                maxSlider.value = steps.length - 1;
                if (minValue) minValue.value = this.formatDaysValue(steps[0]);
                if (maxValue) maxValue.value = this.formatDaysValue(steps[steps.length - 1]) + '+';
                this.updateRangeHighlight(minSlider, maxSlider, highlight);
                this.updateResetButton(resetId, false);
                this.currentPage = 1;
                this.filterSortAndRender();
                this.syncUpdatedSlider(syncTarget, steps[0], Infinity);
            });
        }
    }

    updateRangeHighlight(minSlider, maxSlider, highlight) {
        if (!highlight) return;
        
        const min = parseInt(minSlider.min);
        const max = parseInt(minSlider.max);
        const minVal = parseInt(minSlider.value);
        const maxVal = parseInt(maxSlider.value);
        
        const range = max - min;
        const left = ((minVal - min) / range) * 100;
        const width = ((maxVal - minVal) / range) * 100;
        
        highlight.style.left = left + '%';
        highlight.style.width = width + '%';
    }

    updateResetButton(resetId, show) {
        const resetBtn = document.getElementById(resetId);
        if (resetBtn) {
            if (show) {
                resetBtn.classList.remove('hidden');
            } else {
                resetBtn.classList.add('hidden');
            }
        }
    }

    formatStarsValue(value) {
        if (value >= 1000000) {
            return (value / 1000000).toFixed(value % 1000000 === 0 ? 0 : 1) + 'M';
        }
        if (value >= 1000) {
            return (value / 1000).toFixed(value % 1000 === 0 ? 0 : 1) + 'k';
        }
        return value.toString();
    }

    parseStarsValue(str) {
        str = str.replace(/[+,]/g, '').trim().toLowerCase();
        
        if (str.endsWith('m')) {
            const num = parseFloat(str);
            if (isNaN(num)) return 0;
            return num * 1000000;
        }
        if (str.endsWith('k')) {
            const num = parseFloat(str);
            if (isNaN(num)) return 0;
            return num * 1000;
        }
        const num = parseInt(str);
        return isNaN(num) ? 0 : num;
    }

    syncStarsSlider(target, minVal, maxVal) {
        const isMobile = target === 'mobile';
        const minSliderId = isMobile ? 'mobileStarsMinSlider' : 'starsMinSlider';
        const maxSliderId = isMobile ? 'mobileStarsMaxSlider' : 'starsMaxSlider';
        const minValueId = isMobile ? 'mobileStarsMinValue' : 'starsMinValue';
        const maxValueId = isMobile ? 'mobileStarsMaxValue' : 'starsMaxValue';
        const highlightId = isMobile ? 'mobileStarsRangeHighlight' : 'starsRangeHighlight';
        const resetId = isMobile ? 'mobileResetStarsFilter' : 'resetStarsFilter';

        const minSlider = document.getElementById(minSliderId);
        const maxSlider = document.getElementById(maxSliderId);
        const minValue = document.getElementById(minValueId);
        const maxValue = document.getElementById(maxValueId);
        const highlight = document.getElementById(highlightId);

        const steps = this.starsSteps;
        const minPos = this.valueToSliderPos(minVal, steps);
        // If maxVal is Infinity, use the last step position
        const maxPos = maxVal === Infinity ? steps.length - 1 : this.valueToSliderPos(maxVal, steps);

        if (minSlider) minSlider.value = minPos;
        if (maxSlider) maxSlider.value = maxPos;
        if (minValue) minValue.value = this.formatStarsValue(minVal); // Display exact value
        if (maxValue) {
            const isAtMax = maxVal === Infinity || maxVal >= steps[steps.length - 1];
            const displayVal = maxVal === Infinity ? steps[steps.length - 1] : maxVal;
            maxValue.value = this.formatStarsValue(displayVal) + (isAtMax ? '+' : ''); // Display exact value
        }
        if (minSlider && maxSlider && highlight) {
            this.updateRangeHighlight(minSlider, maxSlider, highlight);
        }
        // Check against actual values, not positions
        this.updateResetButton(resetId, minVal !== steps[0] || maxVal !== Infinity);
    }

    syncUpdatedSlider(target, minVal, maxVal) {
        const isMobile = target === 'mobile';
        const minSliderId = isMobile ? 'mobileUpdatedMinSlider' : 'updatedMinSlider';
        const maxSliderId = isMobile ? 'mobileUpdatedMaxSlider' : 'updatedMaxSlider';
        const minValueId = isMobile ? 'mobileUpdatedMinValue' : 'updatedMinValue';
        const maxValueId = isMobile ? 'mobileUpdatedMaxValue' : 'updatedMaxValue';
        const highlightId = isMobile ? 'mobileUpdatedRangeHighlight' : 'updatedRangeHighlight';
        const resetId = isMobile ? 'mobileResetUpdatedFilter' : 'resetUpdatedFilter';

        const minSlider = document.getElementById(minSliderId);
        const maxSlider = document.getElementById(maxSliderId);
        const minValue = document.getElementById(minValueId);
        const maxValue = document.getElementById(maxValueId);
        const highlight = document.getElementById(highlightId);

        const steps = this.daysSteps;
        const minPos = this.valueToSliderPos(minVal, steps);
        // If maxVal is Infinity, use the last step position
        const maxPos = maxVal === Infinity ? steps.length - 1 : this.valueToSliderPos(maxVal, steps);

        if (minSlider) minSlider.value = minPos;
        if (maxSlider) maxSlider.value = maxPos;
        if (minValue) minValue.value = this.formatDaysValue(minVal); // Display exact value
        if (maxValue) {
            const isAtMax = maxVal === Infinity || maxVal >= steps[steps.length - 1];
            const displayVal = maxVal === Infinity ? steps[steps.length - 1] : maxVal;
            maxValue.value = this.formatDaysValue(displayVal) + (isAtMax ? '+' : ''); // Display exact value
        }
        if (minSlider && maxSlider && highlight) {
            this.updateRangeHighlight(minSlider, maxSlider, highlight);
        }
        // Check against actual values, not positions
        this.updateResetButton(resetId, minVal !== steps[0] || maxVal !== Infinity);
    }

    setupEventListeners() {
        // Show non-free toggle
        const showNonFreeToggle = document.getElementById('showNonFree');
        if (showNonFreeToggle) {
            showNonFreeToggle.addEventListener('change', (e) => {
                this.showNonFreeOnly = e.target.checked;
                this.currentPage = 1; // Reset to first page

                // Sync with mobile toggle
                const mobileToggle = document.getElementById('mobileShowNonFree');
                if (mobileToggle) {
                    mobileToggle.checked = e.target.checked;
                }

                // Re-setup license filters when toggle changes
                this.setupLicenseFilters();

                // Re-setup mobile license filters if they exist
                const mobileLicenseContainer = document.getElementById('mobileLicenseFilters');
                if (mobileLicenseContainer) {
                    this.setupMobileLicenseFilters();
                }

                this.filterSortAndRender();
            });
        }

        // Sort buttons
        const sortButtons = {
            'sortName': 'name',
            'sortStars': 'stars',
            'sortUpdated': 'updated',
            'sortDateAdded': 'dateAdded'
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
                    this.currentPage = 1; // Reset to first page
                    this.filterSortAndRender();
                });
            }
        });
    }

    setupPlatformFilters() {
        const platformFiltersContainer = document.getElementById('platformFilters');
        if (!platformFiltersContainer) return;

        const sortedPlatforms = Array.from(this.platforms).sort();
        
        sortedPlatforms.forEach(platform => {
            const platformCount = this.applications.filter(app => 
                app.platforms && app.platforms.includes(platform)
            ).length;

            const filterDiv = document.createElement('label');
            filterDiv.className = 'filter-label cursor-pointer';
            filterDiv.setAttribute('for', `platform-${this.sanitizeId(platform)}`);
            
            filterDiv.innerHTML = `
                <input type="checkbox" id="platform-${this.sanitizeId(platform)}" 
                       class="filter-checkbox" 
                       data-platform="${platform}">
                <span class="flex-1">
                    ${platform}
                    <span class="text-xs opacity-70 ml-1">(${platformCount})</span>
                </span>
            `;

            const checkbox = filterDiv.querySelector('input');
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.selectedPlatforms.add(platform);
                } else {
                    this.selectedPlatforms.delete(platform);
                }
                this.currentPage = 1; // Reset to first page
                this.filterSortAndRender();
                this.syncMobilePlatformFilter(platform, e.target.checked);
            });

            platformFiltersContainer.appendChild(filterDiv);
        });
    }

    setupLicenseFilters() {
        const licenseFiltersContainer = document.getElementById('licenseFilters');
        if (!licenseFiltersContainer) return;

        // Clear existing filters
        licenseFiltersContainer.innerHTML = '';

        // Filter licenses based on the non-free toggle state
        const allLicenses = Array.from(this.licenses).sort();
        const filteredLicenses = allLicenses.filter(license => {
            // If non-free toggle is OFF, hide non-free licenses
            if (!this.showNonFreeOnly && this.isNonFreeLicense([license])) {
                return false;
            }
            return true;
        });
        
        filteredLicenses.forEach(license => {
            const licenseCount = this.applications.filter(app => 
                app.license && app.license.includes(license)
            ).length;

            const filterDiv = document.createElement('label');
            filterDiv.className = 'filter-label cursor-pointer';
            filterDiv.setAttribute('for', `license-${this.sanitizeId(license)}`);
            
            filterDiv.innerHTML = `
                <input type="checkbox" id="license-${this.sanitizeId(license)}" 
                       class="filter-checkbox" 
                       data-license="${license}">
                <span class="flex-1">
                    ${license}
                    <span class="text-xs opacity-70 ml-1">(${licenseCount})</span>
                </span>
            `;

            const checkbox = filterDiv.querySelector('input');
            
            // Restore selected state if license was previously selected
            if (this.selectedLicenses.has(license)) {
                checkbox.checked = true;
            }
            
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.selectedLicenses.add(license);
                } else {
                    this.selectedLicenses.delete(license);
                }
                this.currentPage = 1; // Reset to first page
                this.filterSortAndRender();
                this.syncMobileLicenseFilter(license, e.target.checked);
            });

            licenseFiltersContainer.appendChild(filterDiv);
        });
    }

    setupCategoryFilters() {
        const categoryFiltersContainer = document.getElementById('categoryFilters');
        if (!categoryFiltersContainer) return;

        const sortedCategories = Array.from(this.categories).sort();
        
        sortedCategories.forEach(category => {
            const categoryCount = this.applications.filter(app => 
                app.categories && app.categories.includes(category)
            ).length;

            const filterDiv = document.createElement('label');
            filterDiv.className = 'filter-label cursor-pointer';
            filterDiv.setAttribute('for', `category-${this.sanitizeId(category)}`);
            
            filterDiv.innerHTML = `
                <input type="checkbox" id="category-${this.sanitizeId(category)}" 
                       class="filter-checkbox" 
                       data-category="${category}">
                <span class="flex-1">
                    ${category}
                    <span class="text-xs opacity-70 ml-1">(${categoryCount})</span>
                </span>
            `;

            const checkbox = filterDiv.querySelector('input');
            // Check if this category was selected from URL parameters
            if (this.selectedCategories.has(category)) {
                checkbox.checked = true;
            }
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.selectedCategories.add(category);
                } else {
                    this.selectedCategories.delete(category);
                }
                this.currentPage = 1; // Reset to first page
                this.filterSortAndRender();
                this.syncMobileCategoryFilter(category, e.target.checked);
            });

            categoryFiltersContainer.appendChild(filterDiv);
        });
    }

    setupPaginationEventListeners() {
        // Pagination is now handled dynamically via updatePaginationControls
        // Event listeners are attached when buttons are created
    }

    setupPaginationSizeChooser() {
        /**Set up the pagination size dropdown so users can pick items per page.*/
        const chooser = document.getElementById('paginationSizeChooser');
        const select = document.getElementById('paginationSizeSelect');
        if (!chooser || !select) return;

        chooser.classList.remove('hidden');

        // Build size options relative to the configured default
        const defaultSize = this.itemsPerPage;
        const options = new Set();
        options.add(Math.max(12, Math.round(defaultSize / 4)));
        options.add(Math.max(12, Math.round(defaultSize / 2)));
        options.add(defaultSize);
        options.add(defaultSize * 2);
        options.add(defaultSize * 4);

        const sorted = Array.from(options).sort((a, b) => a - b);

        select.innerHTML = '';
        sorted.forEach(size => {
            const option = document.createElement('option');
            option.value = size;
            option.textContent = size + ' per page';
            if (size === this.itemsPerPage) option.selected = true;
            select.appendChild(option);
        });

        // "All" option to show every item on one page
        const allOption = document.createElement('option');
        allOption.value = 'all';
        allOption.textContent = 'All';
        select.appendChild(allOption);

        select.addEventListener('change', () => {
            if (select.value === 'all') {
                // Use total application count so everything fits on one page
                this.itemsPerPage = Math.max(this.applications.length, 1);
            } else {
                this.itemsPerPage = parseInt(select.value, 10);
            }
            this.currentPage = 1;
            this.filterSortAndRender();
        });
    }

    goToPage(page) {
        if (page >= 1 && page <= this.totalPages && page !== this.currentPage) {
            this.currentPage = page;
            this.renderCurrentPage();
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

    sanitizeId(str) {
        return str.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    }

    updateSortButtons(activeButtonId) {
        const sortButtons = {
            'sortName': 'name',
            'sortStars': 'stars', 
            'sortUpdated': 'updated',
            'sortDateAdded': 'dateAdded'
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

    isNonFreeLicense(licenses) {
        if (!licenses || licenses.length === 0) return false;
        
        // A license is non-free if it IS in the non-free licenses set
        return licenses.some(license => 
            this.nonFreeLicenses.has(license)
        );
    }

    filterSortAndRender() {
        // Filter applications
        this.filteredApplications = this.applications.filter(app => {
            // Platform filter
            if (this.selectedPlatforms.size > 0) {
                const hasSelectedPlatform = app.platforms && 
                    app.platforms.some(platform => this.selectedPlatforms.has(platform));
                if (!hasSelectedPlatform) return false;
            }

            // License filter
            if (this.selectedLicenses.size > 0) {
                const hasSelectedLicense = app.license && 
                    app.license.some(license => this.selectedLicenses.has(license));
                if (!hasSelectedLicense) return false;
            }

            // Category filter
            if (this.selectedCategories.size > 0) {
                const hasSelectedCategory = app.categories && 
                    app.categories.some(category => this.selectedCategories.has(category));
                if (!hasSelectedCategory) return false;
            }

            // Non-free license filter
            if (this.showNonFreeOnly) {
                // When toggle is ON: show ALL software (free + non-free)
                // No filtering needed - show everything
            } else {
                // When toggle is OFF: hide non-free software (show only free software)
                if (this.isNonFreeLicense(app.license)) return false;
            }

            // Star count filter
            const appStars = app.stars || 0;
            if (appStars < this.starsMin || appStars > this.starsMax) {
                return false;
            }

            // Last updated filter (in days)
            const daysSinceUpdate = this.getDaysSinceUpdate(app.last_updated);
            if (daysSinceUpdate !== null) {
                if (daysSinceUpdate < this.updatedMin || daysSinceUpdate > this.updatedMax) {
                    return false;
                }
            } else {
                // App has no last_updated date - check if we should include it
                if (!this.includeNoUpdateDate) {
                    return false;
                }
            }

            return true;
        });

        // Sort applications
        this.sortApplications();
        
        // Calculate pagination
        this.totalPages = Math.ceil(this.filteredApplications.length / this.itemsPerPage);
        if (this.currentPage > this.totalPages) {
            this.currentPage = Math.max(1, this.totalPages);
        }
        
        // Render current page
        this.renderCurrentPage();
        this.updateCounts();
        if (this.enablePagination) {
            this.updatePaginationControls();
        }
    }

    sortApplications() {
        this.filteredApplications.sort((a, b) => {
            const sortType = this.currentSort;
            const direction = this.sortDirections[sortType];
            let comparison = 0;

            switch (sortType) {
                case 'stars':
                    const starsA = a.stars || 0;
                    const starsB = b.stars || 0;
                    comparison = direction === 'asc' ? starsA - starsB : starsB - starsA;
                    break;
                case 'updated':
                    // Handle different date formats
                    const parseDate = (dateStr) => {
                        if (!dateStr) return new Date(0);
                        // Handle YYYY-MM-DD format
                        if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                            return new Date(dateStr + 'T00:00:00Z');
                        }
                        // Handle ISO format
                        return new Date(dateStr);
                    };
                    
                    const dateA = parseDate(a.last_updated);
                    const dateB = parseDate(b.last_updated);
                    comparison = direction === 'asc' ? 
                        dateA.getTime() - dateB.getTime() : 
                        dateB.getTime() - dateA.getTime();
                    break;
                case 'dateAdded':
                    // Handle date added sorting
                    const parseDateAdded = (dateStr) => {
                        if (!dateStr) return new Date(0);
                        // Handle YYYY-MM-DD format
                        if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                            return new Date(dateStr + 'T00:00:00Z');
                        }
                        // Handle ISO format
                        return new Date(dateStr);
                    };
                    
                    const addedDateA = parseDateAdded(a.date_added);
                    const addedDateB = parseDateAdded(b.date_added);
                    comparison = direction === 'asc' ? 
                        addedDateA.getTime() - addedDateB.getTime() : 
                        addedDateB.getTime() - addedDateA.getTime();
                    break;
                case 'name':
                default:
                    comparison = direction === 'asc' ? 
                        a.name.localeCompare(b.name) : 
                        b.name.localeCompare(a.name);
                    break;
            }
            
            return comparison;
        });
    }

    renderCurrentPage() {
        const gridContainer = document.getElementById('applicationsGrid');
        if (!gridContainer) return;

        // Clear existing content
        gridContainer.innerHTML = '';

        // Calculate start and end indices for current page (or show all if pagination disabled)
        let pageApplications;
        if (this.enablePagination) {
            const startIndex = (this.currentPage - 1) * this.itemsPerPage;
            const endIndex = Math.min(startIndex + this.itemsPerPage, this.filteredApplications.length);
            pageApplications = this.filteredApplications.slice(startIndex, endIndex);
        } else {
            pageApplications = this.filteredApplications; // Show all applications
        }

        // Render applications for current page
        pageApplications.forEach(app => {
            const appCard = this.createApplicationCard(app);
            gridContainer.appendChild(appCard);
        });

        // Show loading message if no applications
        if (pageApplications.length === 0) {
            gridContainer.innerHTML = `
                <div class="col-span-full text-center py-12">
                    <div class="text-text-muted">
                        ${this.filteredApplications.length === 0 ? 'No applications match your filters.' : 'Loading...'}
                    </div>
                </div>
            `;
        }
    }

    createApplicationCard(app) {
        // Creates a single application card element for the browse grid
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
        const categoriesHtml = app.categories ? app.categories.slice(0, this.browseMaxCategoriesPerCard).map(category =>
            `<span class="inline-block bg-badge-bg text-badge-text text-xs px-2 py-0.5 rounded-full">${category}</span>`
        ).join('') + (app.categories.length > this.browseMaxCategoriesPerCard ? `<span class="inline-block bg-secondary text-secondary-text text-xs px-2 py-0.5 rounded-full">+${app.categories.length - this.browseMaxCategoriesPerCard}</span>` : '') : '';

        // Platform badges (up to configured limit)
        const platformsHtml = app.platforms && app.platforms.length > 0 ? app.platforms.slice(0, this.browseMaxPlatformsPerCard).map(platform => {
            const color = this.getPlatformColor(platform);
            return `<span class="inline-flex items-center text-text-muted text-xs">
                <span class="w-2.5 h-2.5 rounded-full mr-1.5 flex-shrink-0" style="background-color: ${color};"></span>${platform}
            </span>`;
        }).join('') + (app.platforms.length > this.browseMaxPlatformsPerCard ? `<span class="inline-block bg-secondary text-secondary-text text-xs px-1.5 py-0.5 rounded">+${app.platforms.length - this.browseMaxPlatformsPerCard}</span>` : '') : '';

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

    getPlatformColor(platform) {
        // Common platform colors using CSS variables for light/dark mode support
        // Change this in template_helpers.py as well
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

    formatReleaseDate(dateStr) {
        if (!dateStr) return '';
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
            });
        } catch (e) {
            return dateStr;
        }
    }

    truncateDescription(description, maxLength = null) {
        if (!description) return '';
        
        if (maxLength === null) {
            maxLength = this.browseDescriptionLength;
        }
        if (this.browseDescriptionFull || description.length <= maxLength) {
            return description;
        }
        
        const truncated = description.substring(0, maxLength).trim();
        const lastSpace = truncated.lastIndexOf(' ');
        const finalText = lastSpace > 0 ? truncated.substring(0, lastSpace) : truncated;
        
        return finalText + '...';
    }

    updateCounts() {
        const visibleCountElement = document.getElementById('visibleCount');
        const totalCountElement = document.getElementById('totalCount');
        
        if (visibleCountElement) {
            const startIndex = (this.currentPage - 1) * this.itemsPerPage + 1;
            const endIndex = Math.min(startIndex + this.itemsPerPage - 1, this.filteredApplications.length);
            const displayText = this.filteredApplications.length > 0 ? `${startIndex}-${endIndex}` : '0';
            visibleCountElement.textContent = displayText;
        }
        
        if (totalCountElement) {
            totalCountElement.textContent = this.filteredApplications.length;
        }
    }

    updatePaginationControls() {
        const paginationContainer = document.getElementById('paginationContainer');
        const currentPageElement = document.getElementById('currentPage');
        const totalPagesElement = document.getElementById('totalPages');
        const paginationButtons = document.getElementById('paginationButtons');

        // Always show the pagination bar when the size chooser is active
        const hasChooser = this.letUserChoosePaginationSize;

        if (this.totalPages > 1 || hasChooser) {
            paginationContainer.classList.remove('hidden');

            if (currentPageElement) currentPageElement.textContent = this.currentPage;
            if (totalPagesElement) totalPagesElement.textContent = this.totalPages;

            // Generate pagination buttons (only when there are multiple pages)
            if (paginationButtons) {
                paginationButtons.innerHTML = '';

                if (this.totalPages > 1) {
                    const buttonBaseClass = 'px-3 py-2 text-sm font-medium rounded transition-colors';
                    const activeClass = `${buttonBaseClass} bg-primary text-surface`;
                    const inactiveClass = `${buttonBaseClass} bg-surface-alt text-text hover:bg-secondary`;
                    const disabledClass = `${buttonBaseClass} bg-surface-alt text-text-muted cursor-not-allowed`;
                    const ellipsisClass = 'px-2 py-2 text-sm text-text-muted';

                    // Previous button (|<)
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

                    // Next button (>|)
                    const nextButton = document.createElement('button');
                    nextButton.innerHTML = '&raquo;';
                    nextButton.title = 'Next page';
                    nextButton.className = this.currentPage >= this.totalPages ? disabledClass : inactiveClass;
                    nextButton.disabled = this.currentPage >= this.totalPages;
                    nextButton.addEventListener('click', () => this.goToPage(this.currentPage + 1));
                    paginationButtons.appendChild(nextButton);
                }
            }
        } else {
            paginationContainer.classList.add('hidden');
        }
    }

    // MOBILE/DESKTOP RESPONSIVE UI METHODS

    handleResponsiveUI() {
        const mobileButtonContainer = document.getElementById('mobileFilterButtonContainer');
        const desktopSidebar = document.getElementById('desktopFilterSidebar');
        const desktopSortControls = document.getElementById('desktopSortControls');

        if (this.isMobile) {
            // Show mobile button, hide desktop sidebar and sort controls
            if (mobileButtonContainer) {
                mobileButtonContainer.classList.remove('hidden');
            }
            if (desktopSidebar) {
                desktopSidebar.classList.add('hidden');
            }
            if (desktopSortControls) {
                desktopSortControls.classList.add('hidden');
            }
        } else {
            // Hide mobile button, show desktop sidebar and sort controls
            if (mobileButtonContainer) {
                mobileButtonContainer.classList.add('hidden');
            }
            if (desktopSidebar) {
                desktopSidebar.classList.remove('hidden');
            }
            if (desktopSortControls) {
                desktopSortControls.classList.remove('hidden');
            }
        }
    }

    handleResize() {
        const wasMobile = this.isMobile;
        this.isMobile = window.innerWidth < 1024;

        // Only update UI if mobile state changed
        if (wasMobile !== this.isMobile) {
            this.handleResponsiveUI();

            // Close mobile drawer if switching from mobile to desktop
            if (!this.isMobile) {
                this.closeMobileFilterDrawer();
            }
        }
    }

    // MOBILE FILTER DRAWER METHODS

    setupMobileFilterDrawer() {
        const mobileFilterButton = document.getElementById('mobileFilterButton');
        const mobileFilterDrawer = document.getElementById('mobileFilterDrawer');
        const mobileFilterClose = document.getElementById('mobileFilterClose');
        const mobileFilterBackdrop = document.getElementById('mobileFilterBackdrop');
        const mobileApplyFilters = document.getElementById('mobileApplyFilters');

        if (!mobileFilterButton || !mobileFilterDrawer) return;

        // Open drawer
        mobileFilterButton.addEventListener('click', () => {
            this.openMobileFilterDrawer();
        });

        // Close drawer
        if (mobileFilterClose) {
            mobileFilterClose.addEventListener('click', () => {
                this.closeMobileFilterDrawer();
            });
        }

        // Close drawer when clicking backdrop
        if (mobileFilterBackdrop) {
            mobileFilterBackdrop.addEventListener('click', () => {
                this.closeMobileFilterDrawer();
            });
        }

        // Apply filters and close drawer
        if (mobileApplyFilters) {
            mobileApplyFilters.addEventListener('click', () => {
                this.closeMobileFilterDrawer();
            });
        }
    }

    openMobileFilterDrawer() {
        const drawer = document.getElementById('mobileFilterDrawer');
        if (drawer) {
            drawer.classList.remove('hidden');
            drawer.classList.add('show');
            document.body.classList.add('mobile-drawer-open');

            // Sync mobile sort buttons to show current state
            this.syncMobileSortState();
        }
    }

    syncMobileSortState() {
        // Find which sort button should be active based on currentSort
        const sortButtonMap = {
            'name': 'mobileSortName',
            'stars': 'mobileSortStars',
            'updated': 'mobileSortUpdated',
            'dateAdded': 'mobileSortDateAdded'
        };

        const activeButtonId = sortButtonMap[this.currentSort];
        if (activeButtonId) {
            this.updateMobileSortButtons(activeButtonId);
        }
    }

    closeMobileFilterDrawer() {
        const drawer = document.getElementById('mobileFilterDrawer');
        if (drawer) {
            drawer.classList.add('hidden');
            drawer.classList.remove('show');
            document.body.classList.remove('mobile-drawer-open');
        }
    }

    setupMobileFilters() {
        // Setup mobile platform filters
        this.setupMobilePlatformFilters();

        // Setup mobile license filters
        this.setupMobileLicenseFilters();

        // Setup mobile category filters
        this.setupMobileCategoryFilters();

        // Setup mobile sort buttons
        this.setupMobileSortButtons();

        // Setup mobile non-free toggle
        this.setupMobileNonFreeToggle();
    }

    setupMobilePlatformFilters() {
        const mobilePlatformFiltersContainer = document.getElementById('mobilePlatformFilters');
        if (!mobilePlatformFiltersContainer) return;

        const sortedPlatforms = Array.from(this.platforms).sort();

        sortedPlatforms.forEach(platform => {
            const platformCount = this.applications.filter(app =>
                app.platforms && app.platforms.includes(platform)
            ).length;

            const filterDiv = document.createElement('label');
            filterDiv.className = 'filter-label cursor-pointer';
            filterDiv.setAttribute('for', `mobile-platform-${this.sanitizeId(platform)}`);

            filterDiv.innerHTML = `
                <input type="checkbox" id="mobile-platform-${this.sanitizeId(platform)}"
                       class="filter-checkbox"
                       data-platform="${platform}">
                <span class="flex-1">
                    ${platform}
                    <span class="text-xs opacity-70 ml-1">(${platformCount})</span>
                </span>
            `;

            const checkbox = filterDiv.querySelector('input');

            // Check if this platform is already selected
            if (this.selectedPlatforms.has(platform)) {
                checkbox.checked = true;
            }

            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.selectedPlatforms.add(platform);
                } else {
                    this.selectedPlatforms.delete(platform);
                }
                this.currentPage = 1;
                this.filterSortAndRender();
                this.syncDesktopPlatformFilter(platform, e.target.checked);
            });

            mobilePlatformFiltersContainer.appendChild(filterDiv);
        });
    }

    setupMobileLicenseFilters() {
        const mobileLicenseFiltersContainer = document.getElementById('mobileLicenseFilters');
        if (!mobileLicenseFiltersContainer) return;

        mobileLicenseFiltersContainer.innerHTML = '';

        const allLicenses = Array.from(this.licenses).sort();
        const filteredLicenses = allLicenses.filter(license => {
            if (!this.showNonFreeOnly && this.isNonFreeLicense([license])) {
                return false;
            }
            return true;
        });

        filteredLicenses.forEach(license => {
            const licenseCount = this.applications.filter(app =>
                app.license && app.license.includes(license)
            ).length;

            const filterDiv = document.createElement('label');
            filterDiv.className = 'filter-label cursor-pointer';
            filterDiv.setAttribute('for', `mobile-license-${this.sanitizeId(license)}`);

            filterDiv.innerHTML = `
                <input type="checkbox" id="mobile-license-${this.sanitizeId(license)}"
                       class="filter-checkbox"
                       data-license="${license}">
                <span class="flex-1">
                    ${license}
                    <span class="text-xs opacity-70 ml-1">(${licenseCount})</span>
                </span>
            `;

            const checkbox = filterDiv.querySelector('input');

            if (this.selectedLicenses.has(license)) {
                checkbox.checked = true;
            }

            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.selectedLicenses.add(license);
                } else {
                    this.selectedLicenses.delete(license);
                }
                this.currentPage = 1;
                this.filterSortAndRender();
                this.syncDesktopLicenseFilter(license, e.target.checked);
            });

            mobileLicenseFiltersContainer.appendChild(filterDiv);
        });
    }

    setupMobileCategoryFilters() {
        const mobileCategoryFiltersContainer = document.getElementById('mobileCategoryFilters');
        if (!mobileCategoryFiltersContainer) return;

        const sortedCategories = Array.from(this.categories).sort();

        sortedCategories.forEach(category => {
            const categoryCount = this.applications.filter(app =>
                app.categories && app.categories.includes(category)
            ).length;

            const filterDiv = document.createElement('label');
            filterDiv.className = 'filter-label cursor-pointer';
            filterDiv.setAttribute('for', `mobile-category-${this.sanitizeId(category)}`);

            filterDiv.innerHTML = `
                <input type="checkbox" id="mobile-category-${this.sanitizeId(category)}"
                       class="filter-checkbox"
                       data-category="${category}">
                <span class="flex-1">
                    ${category}
                    <span class="text-xs opacity-70 ml-1">(${categoryCount})</span>
                </span>
            `;

            const checkbox = filterDiv.querySelector('input');

            if (this.selectedCategories.has(category)) {
                checkbox.checked = true;
            }

            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.selectedCategories.add(category);
                } else {
                    this.selectedCategories.delete(category);
                }
                this.currentPage = 1;
                this.filterSortAndRender();
                this.syncDesktopCategoryFilter(category, e.target.checked);
            });

            mobileCategoryFiltersContainer.appendChild(filterDiv);
        });
    }

    setupMobileSortButtons() {
        const sortButtons = {
            'mobileSortName': 'name',
            'mobileSortStars': 'stars',
            'mobileSortUpdated': 'updated',
            'mobileSortDateAdded': 'dateAdded'
        };

        Object.entries(sortButtons).forEach(([buttonId, sortType]) => {
            const button = document.getElementById(buttonId);
            if (button) {
                // Show git sort button if available
                if (buttonId === 'mobileSortDateAdded' && this.gitDataAvailable) {
                    button.style.display = '';
                }

                button.addEventListener('click', () => {
                    if (this.currentSort === sortType) {
                        this.sortDirections[sortType] = this.sortDirections[sortType] === 'asc' ? 'desc' : 'asc';
                    } else {
                        this.currentSort = sortType;
                    }

                    this.updateSortButtons('sort' + sortType.charAt(0).toUpperCase() + sortType.slice(1));
                    this.updateMobileSortButtons(buttonId);
                    this.currentPage = 1;
                    this.filterSortAndRender();
                });
            }
        });
    }

    setupMobileNonFreeToggle() {
        const mobileShowNonFreeToggle = document.getElementById('mobileShowNonFree');
        if (mobileShowNonFreeToggle) {
            // Sync initial state with desktop
            const desktopToggle = document.getElementById('showNonFree');
            if (desktopToggle) {
                mobileShowNonFreeToggle.checked = desktopToggle.checked;
            }

            mobileShowNonFreeToggle.addEventListener('change', (e) => {
                this.showNonFreeOnly = e.target.checked;
                this.currentPage = 1;

                // Sync with desktop toggle
                if (desktopToggle) {
                    desktopToggle.checked = e.target.checked;
                }

                // Re-setup both mobile and desktop license filters
                this.setupLicenseFilters();
                this.setupMobileLicenseFilters();

                this.filterSortAndRender();
            });
        }
    }

    setupMobileFilterSearch() {
        // Handle mobile search toggle buttons
        document.querySelectorAll('.mobile-filter-search-toggle').forEach(button => {
            button.addEventListener('click', (e) => {
                const targetId = e.currentTarget.getAttribute('data-target');
                const searchContainer = document.getElementById(targetId);
                const searchInput = searchContainer.querySelector('input');

                if (searchContainer.classList.contains('hidden')) {
                    searchContainer.classList.remove('hidden');
                    searchInput.focus();
                } else {
                    searchContainer.classList.add('hidden');
                    searchInput.value = '';
                    this.clearMobileFilterSearch(targetId);
                }
            });
        });

        // Handle mobile search input
        const mobileSearchInputs = ['mobileCategorySearch', 'mobilePlatformSearch', 'mobileLicenseSearch'];
        mobileSearchInputs.forEach(searchId => {
            const searchContainer = document.getElementById(searchId);
            if (searchContainer) {
                const searchInput = searchContainer.querySelector('input');
                searchInput.addEventListener('input', (e) => {
                    this.filterMobileCheckboxes(searchId, e.target.value);
                });
            }
        });
    }

    filterMobileCheckboxes(searchId, query) {
        const filterType = searchId.replace('mobile', '').replace('Search', '');
        const filtersContainer = document.getElementById('mobile' + filterType + 'Filters');

        if (!filtersContainer) return;

        const labels = filtersContainer.querySelectorAll('.filter-label');
        const lowerQuery = query.toLowerCase();

        labels.forEach(label => {
            const textSpan = label.querySelector('span.flex-1');
            if (textSpan) {
                const clonedSpan = textSpan.cloneNode(true);
                const countSpan = clonedSpan.querySelector('.text-xs.opacity-70');
                if (countSpan) {
                    countSpan.remove();
                }
                const text = clonedSpan.textContent.trim().toLowerCase();

                if (text.includes(lowerQuery)) {
                    label.style.display = '';
                } else {
                    label.style.display = 'none';
                }
            } else {
                const text = label.textContent.toLowerCase();
                if (text.includes(lowerQuery)) {
                    label.style.display = '';
                } else {
                    label.style.display = 'none';
                }
            }
        });
    }

    clearMobileFilterSearch(searchId) {
        const filterType = searchId.replace('mobile', '').replace('Search', '');
        const filtersContainer = document.getElementById('mobile' + filterType + 'Filters');

        if (!filtersContainer) return;

        const labels = filtersContainer.querySelectorAll('.filter-label');
        labels.forEach(label => {
            label.style.display = '';
        });
    }

    updateMobileSortButtons(activeButtonId) {
        const sortButtons = {
            'mobileSortName': 'name',
            'mobileSortStars': 'stars',
            'mobileSortUpdated': 'updated',
            'mobileSortDateAdded': 'dateAdded'
        };

        Object.entries(sortButtons).forEach(([buttonId, sortType]) => {
            const button = document.getElementById(buttonId);
            if (button) {
                let baseText = button.textContent.replace(/[↑↓]/g, '').trim();

                if (buttonId === activeButtonId) {
                    button.className = 'sort-button active text-sm';
                    const direction = this.sortDirections[sortType];
                    const arrow = direction === 'asc' ? '↑' : '↓';
                    button.textContent = `${baseText} ${arrow}`;
                } else {
                    button.className = 'sort-button text-sm';
                    button.textContent = baseText;
                }
            }
        });
    }

    syncDesktopPlatformFilter(platform, checked) {
        const desktopCheckbox = document.querySelector(`#platformFilters input[data-platform="${platform}"]`);
        if (desktopCheckbox) {
            desktopCheckbox.checked = checked;
        }
    }

    syncDesktopLicenseFilter(license, checked) {
        const desktopCheckbox = document.querySelector(`#licenseFilters input[data-license="${license}"]`);
        if (desktopCheckbox) {
            desktopCheckbox.checked = checked;
        }
    }

    syncDesktopCategoryFilter(category, checked) {
        const desktopCheckbox = document.querySelector(`#categoryFilters input[data-category="${category}"]`);
        if (desktopCheckbox) {
            desktopCheckbox.checked = checked;
        }
    }

    syncMobilePlatformFilter(platform, checked) {
        const mobileCheckbox = document.querySelector(`#mobilePlatformFilters input[data-platform="${platform}"]`);
        if (mobileCheckbox) {
            mobileCheckbox.checked = checked;
        }
    }

    syncMobileLicenseFilter(license, checked) {
        const mobileCheckbox = document.querySelector(`#mobileLicenseFilters input[data-license="${license}"]`);
        if (mobileCheckbox) {
            mobileCheckbox.checked = checked;
        }
    }

    syncMobileCategoryFilter(category, checked) {
        const mobileCheckbox = document.querySelector(`#mobileCategoryFilters input[data-category="${category}"]`);
        if (mobileCheckbox) {
            mobileCheckbox.checked = checked;
        }
    }

    setupMobileRangeFilters() {
        // Setup mobile star count range filter
        this.setupMobileStarsRangeFilter();

        // Setup mobile last updated range filter
        this.setupMobileUpdatedRangeFilter();

        // Setup mobile "include no update date" checkbox
        this.setupMobileIncludeNoUpdateDateCheckbox();
    }

    setupMobileIncludeNoUpdateDateCheckbox() {
        const checkbox = document.getElementById('mobileIncludeNoUpdateDate');
        if (checkbox) {
            checkbox.checked = this.includeNoUpdateDate;
            checkbox.addEventListener('change', (e) => {
                this.includeNoUpdateDate = e.target.checked;
                this.currentPage = 1;
                this.filterSortAndRender();
                // Sync with desktop
                const desktopCheckbox = document.getElementById('includeNoUpdateDate');
                if (desktopCheckbox) {
                    desktopCheckbox.checked = e.target.checked;
                }
            });
        }
    }

    setupMobileStarsRangeFilter() {
        // Use the unified setupStarsRangeFilter function with mobile IDs and desktop sync target
        this.setupStarsRangeFilter(
            'mobileStarsMinSlider',
            'mobileStarsMaxSlider',
            'mobileStarsMinValue',
            'mobileStarsMaxValue',
            'mobileStarsRangeHighlight',
            'mobileResetStarsFilter',
            'desktop', // Sync to desktop when mobile slider changes
            true // Initialize from current state to sync with desktop
        );
    }

    setupMobileUpdatedRangeFilter() {
        // Use the unified setupUpdatedRangeFilter function with mobile IDs and desktop sync target
        this.setupUpdatedRangeFilter(
            'mobileUpdatedMinSlider',
            'mobileUpdatedMaxSlider',
            'mobileUpdatedMinValue',
            'mobileUpdatedMaxValue',
            'mobileUpdatedRangeHighlight',
            'mobileResetUpdatedFilter',
            'desktop', // Sync to desktop when mobile slider changes
            true // Initialize from current state to sync with desktop
        );
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new BrowsePage();
}); 