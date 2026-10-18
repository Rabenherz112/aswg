// Main application JavaScript
(function() {
    // Initialize when DOM is loaded
    document.addEventListener('DOMContentLoaded', function() {
        initializeMobileMenu();
        initializeScrollToTop();
        initializeBanner();
        initializeNavScroll();
    });
    
    // Mobile menu functionality with slide-down animation
    function initializeMobileMenu() {
        // Initializes the mobile hamburger menu with animated open/close
        const mobileMenuButton = document.getElementById('mobile-menu-button');
        const mobileMenu = document.getElementById('mobile-menu');
        const openIcon = document.getElementById('mobile-menu-open-icon');
        const closeIcon = document.getElementById('mobile-menu-close-icon');

        if (mobileMenuButton && mobileMenu) {
            let isOpen = false;

            function toggleMenu(open) {
                // Toggles the mobile menu open or closed
                isOpen = open;
                if (open) {
                    mobileMenu.classList.remove('hidden');
                    // Allow the DOM to update before animating
                    requestAnimationFrame(function() {
                        mobileMenu.style.maxHeight = mobileMenu.scrollHeight + 'px';
                    });
                } else {
                    mobileMenu.style.maxHeight = '0';
                    mobileMenu.addEventListener('transitionend', function handler() {
                        if (!isOpen) {
                            mobileMenu.classList.add('hidden');
                        }
                        mobileMenu.removeEventListener('transitionend', handler);
                    });
                }
                // Toggle hamburger/close icons
                if (openIcon && closeIcon) {
                    openIcon.classList.toggle('hidden', open);
                    closeIcon.classList.toggle('hidden', !open);
                }
            }

            mobileMenuButton.addEventListener('click', function() {
                toggleMenu(!isOpen);
            });

            // Close mobile menu when clicking outside
            document.addEventListener('click', function(event) {
                if (isOpen && !mobileMenuButton.contains(event.target) && !mobileMenu.contains(event.target)) {
                    toggleMenu(false);
                }
            });
        }
    }
    
    // Scroll to top functionality
    function initializeScrollToTop() {
        // Create scroll to top button
        const scrollButton = document.createElement('button');
        scrollButton.innerHTML = '↑';
        scrollButton.className = 'scroll-to-top-btn fixed bottom-6 right-6 bg-primary text-surface rounded-full shadow-lg hover:bg-primary transition-all duration-300 transform translate-y-16 opacity-0 z-50';
        scrollButton.setAttribute('aria-label', 'Scroll to top');
        document.body.appendChild(scrollButton);
        
        // Show/hide based on scroll position
        window.addEventListener('scroll', function() {
            if (window.pageYOffset > 300) {
                scrollButton.classList.remove('translate-y-16', 'opacity-0');
            } else {
                scrollButton.classList.add('translate-y-16', 'opacity-0');
            }
        });
        
        // Scroll to top when clicked
        scrollButton.addEventListener('click', function() {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }
    
    // Utility function to show/hide loading states
    window.setLoading = function(element, loading) {
        if (loading) {
            element.classList.add('loading');
        } else {
            element.classList.remove('loading');
        }
    };
    
    // Utility function for smooth scrolling to elements
    window.scrollToElement = function(selector) {
        const element = document.querySelector(selector);
        if (element) {
            element.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    };
    
    // Add keyboard navigation support
    document.addEventListener('keydown', function(event) {
        // Escape key closes modals and search results
        if (event.key === 'Escape') {
            // Close search results
            const searchResults = document.getElementById('search-results');
            if (searchResults) {
                searchResults.classList.add('hidden');
            }

            // Close mobile menu via animated toggle
            const mobileMenu = document.getElementById('mobile-menu');
            if (mobileMenu && !mobileMenu.classList.contains('hidden')) {
                mobileMenu.style.maxHeight = '0';
                const openIcon = document.getElementById('mobile-menu-open-icon');
                const closeIcon = document.getElementById('mobile-menu-close-icon');
                if (openIcon && closeIcon) {
                    openIcon.classList.remove('hidden');
                    closeIcon.classList.add('hidden');
                }
                mobileMenu.addEventListener('transitionend', function handler() {
                    mobileMenu.classList.add('hidden');
                    mobileMenu.removeEventListener('transitionend', handler);
                });
            }
        }
    });
    
    // Add focus management for better accessibility
    function trapFocus(element) {
        const focusableElements = element.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        
        element.addEventListener('keydown', function(event) {
            if (event.key === 'Tab') {
                if (event.shiftKey) {
                    if (document.activeElement === firstElement) {
                        lastElement.focus();
                        event.preventDefault();
                    }
                } else {
                    if (document.activeElement === lastElement) {
                        firstElement.focus();
                        event.preventDefault();
                    }
                }
            }
        });
    }
    
    // Performance optimization: Lazy load images
    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.dataset.src;
                    img.classList.remove('lazy');
                    observer.unobserve(img);
                }
            });
        });
        
        document.querySelectorAll('img[data-src]').forEach(img => {
            imageObserver.observe(img);
        });
    }
    
    // Navigation scroll effect - adds blur/shadow on scroll
    function initializeNavScroll() {
        // Adds backdrop blur and shadow to the nav bar when scrolled
        const nav = document.getElementById('main-nav');
        if (!nav) return;

        let ticking = false;
        window.addEventListener('scroll', function() {
            if (!ticking) {
                requestAnimationFrame(function() {
                    if (window.scrollY > 10) {
                        nav.classList.add('nav-scrolled');
                    } else {
                        nav.classList.remove('nav-scrolled');
                    }
                    ticking = false;
                });
                ticking = true;
            }
        });
    }

    /**
     * Generate a deterministic background color from a string (app name).
     * Returns an HSL color string suitable for letter avatars.
     */
    window.getLetterAvatarColor = function(name) {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
            hash = hash & hash;
        }
        const hue = Math.abs(hash) % 360;
        return 'hsl(' + hue + ', 45%, 55%)';
    };

    /**
     * Generate the HTML for an application icon element.
     * Returns an <img> if icon_url is set, otherwise a letter avatar <div>.
     * Returns empty string if project icons are disabled via config.
     */
    window.getAppIconHtml = function(app, sizeClass) {
        var showIcons = document.querySelector('meta[name="show-project-icons"]');
        if (showIcons && showIcons.content.toLowerCase() === 'false') {
            return '';
        }

        if (!sizeClass) sizeClass = 'sm';
        const avatarClass = sizeClass === 'lg' ? 'letter-avatar letter-avatar-lg' : 'letter-avatar letter-avatar-sm';
        const imgClass = sizeClass === 'lg' ? 'app-icon-lg' : 'app-icon';

        if (app.icon_url) {
            return '<img src="' + app.icon_url + '" alt="" class="' + imgClass + '" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">'
                 + '<div class="' + avatarClass + '" style="display:none;background:' + window.getLetterAvatarColor(app.name) + ';">'
                 + app.name.charAt(0).toUpperCase() + '</div>';
        }
        return '<div class="' + avatarClass + '" style="background:' + window.getLetterAvatarColor(app.name) + ';">'
             + app.name.charAt(0).toUpperCase() + '</div>';
    };

    // Banner functionality
    function initializeBanner() {
        const banner = document.getElementById('site-banner');
        const dismissButton = document.getElementById('dismiss-banner');
        
        if (!banner) return;
        
        try {
            // Create a hash of the banner content to detect changes
            const bannerText = banner.querySelector('p')?.textContent?.trim() || '';
            const bannerButton = banner.querySelector('a')?.textContent?.trim() || '';
            const bannerContent = bannerText + bannerButton;
            
            // Simple hash function that's more reliable than btoa
            let bannerHash = 0;
            for (let i = 0; i < bannerContent.length; i++) {
                const char = bannerContent.charCodeAt(i);
                bannerHash = ((bannerHash << 5) - bannerHash) + char;
                bannerHash = bannerHash & bannerHash; // Convert to 32-bit integer
            }
            bannerHash = Math.abs(bannerHash).toString(16);
            
            // Check if this specific banner was previously dismissed
            const dismissedBanners = JSON.parse(localStorage.getItem('dismissed-banners') || '[]');
            if (dismissedBanners.includes(bannerHash)) {
                banner.style.display = 'none';
                return;
            }
            
            // Handle dismiss button
            if (dismissButton) {
                dismissButton.addEventListener('click', function() {
                    banner.style.display = 'none';
                    
                    try {
                        // Add this banner's hash to the dismissed list
                        const currentDismissed = JSON.parse(localStorage.getItem('dismissed-banners') || '[]');
                        if (!currentDismissed.includes(bannerHash)) {
                            currentDismissed.push(bannerHash);
                            // Keep only the last 3 dismissed banners to avoid localStorage bloat
                            const recentDismissed = currentDismissed.slice(-3);
                            localStorage.setItem('dismissed-banners', JSON.stringify(recentDismissed));
                        }
                    } catch (e) {
                        console.log('Could not save banner dismiss state:', e);
                    }
                });
            }
        } catch (error) {
            console.log('Banner initialization error:', error);
            
            // Fallback: simple dismiss without content tracking
            if (dismissButton) {
                dismissButton.addEventListener('click', function() {
                    banner.style.display = 'none';
                });
            }
        }
    }

    console.log('[OK] ASWG initialized');
})(); 