# Changelog

All notable changes to this project will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),

## [unreleased]

### Additions

- Added Roadmap functionality with Kanban board and ability to share roadmap

### Bug Fixes

- Fixed link in App detail page, to return to browse page

## [2.2.0] - 2026-03-08

### Additions

- Added Icon support for application cards
- Added ability to let users choose the pagination size

### Bug Fixes

- Fixed search bar which sometimes hid itself when typing too fast
- Fixed search bar showing raw star count instead of formatted number
- Fixed scroll-to-top button a circle shape
- Fixed (hopefully) the issue some users had issue with truncation of the app name happening too early
- Fixed broken link to browse page on statistics page
- Fixed incorrectly shown information in `aswg info` command

### Other changes

- Slightly changed overall design to match icon support
- Added pylint checks and formatted code accordingly
- Updated TailwindCSS to version 4.2.0

## [2.1.0] - 2025-12-27

### Additions

- Added ability to easily customize color scheme via TailwindCSS variables in `tailwind-input.css`
- Added in pagination control, page number buttons
- Added support for all platforms colors used in awesome-selfhosted
- Added range filtering for stars and last updated date

### Bug Fixes

- Fixed Last Updated date calculation to show correct number of days since update

### Other changes

- Refactored how colors are defined, by removing the default TailwindCSS colors
- Changed default color scheme to more muted pastel colors

## [2.0.0] - 2025-11-27

### Additions

- Added a mobile sort and filtering menu to the browse page to improve mobile usability
- Added configurable `.htaccess` file generation to remove `.html` extensions from URLs for Apache servers
- Added `{{current_year}}` placeholder support for `credit_text` and `footer_text` configuration fields to dynamically insert the current year

### Bug Fixes

- Fixed link behavior for internal and external links
- Removed unnecessary target attributes for links

### Other changes

- Refactored the project structure to python package
- Removed planned but never implemented modules
- Removed unused options from `config.yml` and `config-pr-preview.yml`
- Removed `PR_PREVIEW.md` file
- Updated AI Disclaimer

## [1.5.2] - 2025-11-10

### Additions

- Added additional statics with fallback with interactive demos, recent activity, releases, and new apps for the current year for the homepage and statistics page.

### Bug Fixes

- Fixed commit history graph sizing to work correctly under 10 commits total.

### Other changes

- Introduced issue templates and project board.

## [1.5.1] - 2025-11-06

### Bug Fixes

- Fixed button layout issues caused by long names in App Details page
- Fixed static commit history graph sizing on desktop in App Details page
- Fixed broken commit history display when no commits were made in recent months in App Details page
- Fixed theme toggle focus outline persisting after click
- Fixed duplicate categories appearing on landing page
- Fixed directory path in documentation

### Other changes

- Enabled HTML minification for PR preview deployments

## [1.5.0] - 2025-10-16

### Additions

- Added `npm run watch-css` script to automatically rebuild CSS on any changes
- Added `lastmod` date to `sitemap.xml` for improved SEO

### Bug Fixes

- Fixed "Alternative to" section on homepage to properly respect the `include_nonfree: false` option
- Fixed inconsistent styling on app detail pages to match the category and platform design used on the browse page

### Other changes

- Updated Tailwind CSS to version 4.1.13
- Standardized generator output format
- Removed Preview System section from main README
- Added documentation strings in `custom.css` for better understanding of custom CSS blocks
- Updated default robots.txt configuration to disallow crawling of all content in `/static/` directory
- Removed latest release icon from app detail pages
- Refactored related app logic into separate `related_apps.py` file for better code organization

## [1.4.0] - 2025-09-13

### Additions

- Added an analysis script for the semantic similarity algorithm `dev-utils/analyze_buzzwords.py`
- Implemented mobile responsiveness for app-detail pages, including a dedicated view for buttons and commit history on smaller screens

### Bug Fixes

- Optimized the semantic similarity algorithm so that app descriptions are now computed only once instead of O(n²)
- Fixed various grammar mistakes across multiple pages

### Other changes

- Updated the main README to correct command-line argument documentation
- Removed the redundant acknowledgments section
- PR Preview now also leverages the semantic similarity algorithm (this is possible thanks to the low generation time)
- Updated the generic filter used by the semantic similarity algorithm

## [1.3.0] - 2025-09-04

### Additions

- Support for git data collection and sorting by date

### Bug Fixes

- Search functionality in alternative view now respects the configurable search parameters

### Other changes

- Configuration value `awesome_selfhosted_data_dir` has been renamed to `data_dir`

## [1.2.1] - 2025-08-28

### Bug Fixes

- The alternative link in the footer is now displayed only when alternative generation is enabled

## [1.2.0] - 2025-08-27

### Additions

- Introduced a new “Alternative to” page that lists open-source alternatives to proprietary software with a search feature (currently disabled by default due to limited dataset coverage in awesome-selfhosted)
- Added a disclaimer regarding the use of LLMs
- The landing page (index.html) now dynamically generates background and box colors, which also resolves the issue where the layout appeared broken if a section was disabled

### Bug Fixes


- Corrected a clone URL in the documentation
- Fixed the flash issue on the Browse Page with the "JavaScript disabled" notification
- Removed the unintended inclusion of `tailwind-input.css` from the output build

### Other changes

- The PR Preview System now detects errors and displays logs
- Updated TailwindCSS to version 4.1.12

## [1.1.0] - 2025-08-22

### Additions

- Search functionality added to the filter option
- Banner support with dismiss logic
- Base URL support for sub-page deployments (currently used in PR Previews)

### Bug Fixes

- Corrected grammar issues in `index.html`

### Other changes

- Integrated Dependabot
- Implemented automated PR preview system using GitHub Actions
- Added automated PR tests against awesome-selfhosted-data
- Introduced PR Preview Index

## [1.0.1] - 2025-08-16

### Additions

- Added non-free licenses to the config.yml

### Bug Fixes

- Fixed the category filter to use the correct slug when used via the homepage
- Fixed that configured truncate length is respected
- Fixed mobile ui bug, with none working "browse" button

### Other changes

- Reduced default browse description length to 90 characters

## [1.0.0] - 2025-08-03

Inital release of the project.

[unreleased]: https://github.com/Rabenherz112/awesome-selfhosted-web-gen/compare/v2.2.0...HEAD
[2.2.0]: https://github.com/Rabenherz112/awesome-selfhosted-web-gen/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/Rabenherz112/awesome-selfhosted-web-gen/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/Rabenherz112/awesome-selfhosted-web-gen/compare/v1.5.2...v2.0.0
[1.5.2]: https://github.com/Rabenherz112/awesome-selfhosted-web-gen/compare/v1.5.1...v1.5.2
[1.5.1]: https://github.com/Rabenherz112/awesome-selfhosted-web-gen/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/Rabenherz112/awesome-selfhosted-web-gen/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/Rabenherz112/awesome-selfhosted-web-gen/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/Rabenherz112/awesome-selfhosted-web-gen/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/Rabenherz112/awesome-selfhosted-web-gen/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/Rabenherz112/awesome-selfhosted-web-gen/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/Rabenherz112/awesome-selfhosted-web-gen/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/Rabenherz112/awesome-selfhosted-web-gen/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/Rabenherz112/awesome-selfhosted-web-gen/releases/tag/v1.0.0
