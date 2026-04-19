// Shared app card rendering for browse and roadmap pages.
(function() {
    /**
     * Get anchor target/rel attributes for internal or external links.
     */
    function getLinkAttrs(url, isInternal, openInternalInNewTab, openExternalInNewTab) {
        if (isInternal === null || isInternal === undefined) {
            isInternal = url.startsWith('/') || url.startsWith(window.location.origin);
        }
        if (isInternal && openInternalInNewTab) return ' target="_blank" rel="noopener"';
        if (isInternal && !openInternalInNewTab) return ' target="_self"';
        if (!isInternal && openExternalInNewTab) return ' target="_blank" rel="noopener noreferrer"';
        if (!isInternal && !openExternalInNewTab) return ' target="_self" rel="noreferrer"';
        return '';
    }

    /**
     * Build warning icon for apps that depend on proprietary services.
     */
    function buildDependsIconHtml(app) {
        if (!app.depends_3rdparty) return '';
        return `
            <span class="flex-shrink-0 cursor-help" title="Depends on a proprietary service outside the user's control">
                <svg class="w-4 h-4 text-icon-warning" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                </svg>
            </span>`;
    }

    /**
     * Build warning icon for non-English-only documentation.
     */
    function buildDocumentationLanguageIconHtml(app) {
        if (!app.documentation_language || !Array.isArray(app.documentation_language) || app.documentation_language.length === 0) {
            return '';
        }
        return `
            <span class="flex-shrink-0 cursor-help" title="Documentation only in ${app.documentation_language.join(', ')}">
                <svg class="w-4 h-4 text-icon-warning" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clip-rule="evenodd"/>
                </svg>
            </span>`;
    }

    /**
     * Build icon for applications marked as forks.
     */
    function buildForkIconHtml(app) {
        if (!app.fork_of) return '';
        return `
            <span class="flex-shrink-0 cursor-help" title="Fork of ${app.fork_of}">
                <svg class="w-4 h-4 text-info" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                  <path d="M13.273 7.73a2.51 2.51 0 0 0-3.159-.31 2.5 2.5 0 0 0-.921 1.12 2.23 2.23 0 0 0-.13.44 4.52 4.52 0 0 1-4-4 2.23 2.23 0 0 0 .44-.13 2.5 2.5 0 0 0 1.54-2.31 2.45 2.45 0 0 0-.19-1A2.48 2.48 0 0 0 5.503.19a2.45 2.45 0 0 0-1-.19 2.5 2.5 0 0 0-2.31 1.54 2.52 2.52 0 0 0 .54 2.73c.35.343.79.579 1.27.68v5.1a2.411 2.411 0 0 0-.89.37 2.5 2.5 0 1 0 3.47 3.468 2.5 2.5 0 0 0 .42-1.387 2.45 2.45 0 0 0-.19-1 2.48 2.48 0 0 0-1.81-1.49v-2.4a5.52 5.52 0 0 0 2 1.73 5.65 5.65 0 0 0 2.09.6 2.5 2.5 0 0 0 4.95-.49 2.51 2.51 0 0 0-.77-1.72z"/>
                </svg>
            </span>`;
    }

    /**
     * Build the stars metadata snippet.
     */
    function buildStarsHtml(app, config) {
        if (!app.stars) return '';
        return `
            <span class="inline-flex items-center text-star cursor-help" title="Repository stars">
                <svg class="w-3 h-3 mr-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                </svg>
                <span class="text-xs font-medium">${config.formatStars(app.stars)}</span>
            </span>`;
    }

    /**
     * Build the last-updated metadata snippet.
     */
    function buildClockHtml(app, config) {
        const days = config.getDaysSinceUpdate(app.last_updated);
        if (days === null) return '';
        return `
            <span class="inline-flex items-center cursor-help ${config.getUpdateAgeColor(days)}" title="Last updated ${days} day${days === 1 ? '' : 's'} ago${app.last_updated ? ' (' + app.last_updated + ')' : ''}">
                <svg class="w-3 h-3 mr-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/>
                </svg>
                <span class="text-xs font-medium">${days}d</span>
            </span>`;
    }

    /**
     * Build license badge for an app.
     */
    function buildLicenseBadge(app, config) {
        if (!app.license || app.license.length === 0) return '';
        const firstLicense = app.license[0];
        const licenseText = app.license.length === 1 ? firstLicense : `${firstLicense} (+${app.license.length - 1})`;
        const tooltipText = app.license.length > 1 ? app.license.join(', ') : firstLicense;
        const isNonFree = config.isNonFreeLicense(app.license);
        const licenseClass = isNonFree
            ? 'inline-block text-xs px-1.5 py-0.5 border border-warning text-warning bg-warning/10 rounded cursor-help'
            : 'inline-block text-xs px-1.5 py-0.5 border border-border text-text-muted bg-surface-alt rounded cursor-help';
        return `<span class="${licenseClass}" title="${tooltipText}">${licenseText}</span>`;
    }

    /**
     * Build category badges block for an app.
     */
    function buildCategoriesHtml(app, config) {
        if (!app.categories) return '';
        const visible = app.categories.slice(0, config.maxCategoriesPerCard).map((category) =>
            `<span class="inline-block bg-badge-bg text-badge-text text-xs px-2 py-0.5 rounded-full">${category}</span>`
        ).join('');
        if (app.categories.length <= config.maxCategoriesPerCard) return visible;
        return `${visible}<span class="inline-block bg-secondary text-secondary-text text-xs px-2 py-0.5 rounded-full">+${app.categories.length - config.maxCategoriesPerCard}</span>`;
    }

    /**
     * Build platform badges block for an app.
     */
    function buildPlatformsHtml(app, config) {
        if (!app.platforms || app.platforms.length === 0) return '';
        const visible = app.platforms.slice(0, config.maxPlatformsPerCard).map((platform) => {
            const color = config.getPlatformColor(platform);
            return `<span class="inline-flex items-center text-text-muted text-xs">
                <span class="w-2.5 h-2.5 rounded-full mr-1.5 flex-shrink-0" style="background-color: ${color};"></span>${platform}
            </span>`;
        }).join('');
        if (app.platforms.length <= config.maxPlatformsPerCard) return visible;
        return `${visible}<span class="inline-block bg-secondary text-secondary-text text-xs px-1.5 py-0.5 rounded">+${app.platforms.length - config.maxPlatformsPerCard}</span>`;
    }

    /**
     * Build link row html including optional roadmap controls.
     */
    function buildLinksHtml(app, config, detailsUrl, openInternalInNewTab, openExternalInNewTab) {
        const demoLink = (app.demo_url && app.demo_url.trim()) ? `<a href="${app.demo_url}"${getLinkAttrs(app.demo_url, false, openInternalInNewTab, openExternalInNewTab)} class="text-link hover:text-link-hover font-medium">Demo</a>` : '';
        const sourceLink = (app.repo_url && app.repo_url.trim()) ? `<a href="${app.repo_url}"${getLinkAttrs(app.repo_url, false, openInternalInNewTab, openExternalInNewTab)} class="text-link hover:text-link-hover font-medium">Source</a>` : '';
        const websiteLink = (app.url && app.url.trim() && app.url !== app.repo_url && app.url !== app.demo_url) ? `<a href="${app.url}"${getLinkAttrs(app.url, false, openInternalInNewTab, openExternalInNewTab)} class="text-link hover:text-link-hover font-medium">Website</a>` : '';
        const detailsLink = `<a href="${detailsUrl}"${getLinkAttrs(detailsUrl, true, openInternalInNewTab, openExternalInNewTab)} class="text-link hover:text-link-hover font-medium">Details</a>`;
        const roadmapControl = typeof config.getRoadmapControlHtml === 'function' ? config.getRoadmapControlHtml(app) : '';
        return `${websiteLink}${sourceLink}${demoLink}${detailsLink}${roadmapControl}`;
    }

    /**
     * Build and return a fully rendered app card element.
     */
    window.renderAppCard = function(config) {
        const app = config.app;
        const card = document.createElement('div');
        card.className = 'app-card bg-surface rounded-lg border border-border shadow-sm h-full flex flex-col';
        const openExternalInNewTab = config.openExternalInNewTab;
        const openInternalInNewTab = config.openInternalInNewTab;
        const basePath = config.basePath || '';
        const iconHtml = window.getAppIconHtml ? window.getAppIconHtml(app, 'sm') : '';
        const detailsUrl = `${basePath}/apps/${app.id}.html`;
        const indicatorIcons = [buildDependsIconHtml(app), buildDocumentationLanguageIconHtml(app), buildForkIconHtml(app)].filter(Boolean).join('');
        const licenseBadge = buildLicenseBadge(app, config);
        const starsHtml = buildStarsHtml(app, config);
        const clockHtml = buildClockHtml(app, config);
        const categoriesHtml = buildCategoriesHtml(app, config);
        const platformsHtml = buildPlatformsHtml(app, config);
        const linksHtml = buildLinksHtml(app, config, detailsUrl, openInternalInNewTab, openExternalInNewTab);

        card.innerHTML = `
            <div class="p-4 flex flex-col flex-grow">
                <div class="flex items-center gap-2.5 mb-2.5">
                    ${iconHtml}
                    <div class="flex-1 min-w-0">
                        <h3 class="text-base font-semibold text-text truncate leading-tight">
                            <a href="${detailsUrl}"${getLinkAttrs(detailsUrl, true, openInternalInNewTab, openExternalInNewTab)} class="hover:text-link">${app.name}</a>
                        </h3>
                    </div>
                    ${licenseBadge}
                </div>

                <div class="flex items-center flex-wrap gap-2.5 mb-2 text-xs">
                    ${starsHtml}${clockHtml}${indicatorIcons}
                </div>

                <p class="text-sm text-text-muted mb-3 flex-grow leading-relaxed">
                    ${config.truncateDescription(app.description)}
                </p>

                ${categoriesHtml ? `<div class="flex flex-wrap gap-1 mb-1.5">${categoriesHtml}</div>` : ''}
                ${platformsHtml ? `<div class="flex flex-wrap gap-2 mb-2">${platformsHtml}</div>` : ''}

                <div class="flex flex-wrap gap-2.5 text-xs mt-auto pt-2 border-t border-border">
                    ${linksHtml}
                </div>
            </div>
        `;

        if (typeof config.onCardCreated === 'function') config.onCardCreated(card, app);
        return card;
    };
    /**
     * Shared helper functions for app card rendering across browse and roadmap pages.
     */
    const PLATFORM_VARS = {
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

    window.AppCardHelpers = {
        formatStars(stars) {
            if (stars >= 1000) return (stars / 1000).toFixed(1) + 'k';
            return String(stars || 0);
        },

        getDaysSinceUpdate(lastUpdated) {
            if (!lastUpdated) return null;
            const updateDate = new Date(lastUpdated);
            const today = new Date();
            const updateMidnight = new Date(updateDate.getFullYear(), updateDate.getMonth(), updateDate.getDate());
            const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const diffTime = Math.abs(todayMidnight - updateMidnight);
            return Math.floor(diffTime / (1000 * 60 * 60 * 24));
        },

        getUpdateAgeColor(days) {
            if (days === null || days === undefined) return 'text-text-muted';
            if (days > 365) return 'text-error';
            if (days > 180) return 'text-warning';
            return 'text-success';
        },

        getPlatformColor(platform) {
            if (!platform) return 'var(--color-platform-default)';
            return PLATFORM_VARS[platform.toLowerCase()] || 'var(--color-platform-default)';
        },

        escapeHtml(str) {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }
    };
})();
