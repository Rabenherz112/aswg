"""
Site generation module using Jinja2 templates.
"""

import json
import random
import shutil
from dataclasses import asdict
from datetime import datetime
from typing import Dict, List, Any
from jinja2 import Environment, FileSystemLoader, select_autoescape

try:
    from minify_html import minify

    MINIFY_AVAILABLE = True
except ImportError:
    MINIFY_AVAILABLE = False

from .config import Config
from .data_processor import Application, DataProcessor
from .template_helpers import TemplateHelpers
from .related_apps import RelatedAppsFinder


class SiteGenerator:  # pylint: disable=too-few-public-methods
    """Static site generator using Jinja2 templates."""

    def __init__(self, config: Config):
        """Initialize site generator with configuration."""
        self.config = config
        self.licenses_data = None
        self.template_helpers = TemplateHelpers(config)
        self.related_apps_config = self.config.get("related_apps", {})
        self.related_apps_finder = RelatedAppsFinder(self.related_apps_config)

        # Set up Jinja2 environment
        self.jinja_env = Environment(
            loader=FileSystemLoader(str(config.template_dir)),
            autoescape=select_autoescape(["html", "xml"]),
            trim_blocks=True,
            lstrip_blocks=True,
        )

        # Register template helpers
        self._register_template_functions()

    def _register_template_functions(self):
        """Register custom template functions and filters."""
        # Global functions
        self.jinja_env.globals.update(
            {
                "site_config": self.config.get_site_config(),
                "ui_config": self.config.get("ui", {}),
                "footer_config": self.config.get("footer", {}),
                "hero_config": self.config.get("hero", {}),
                "navigation_config": self.config.get("navigation", {}),
                "pages_config": self.config.get("pages", {}),
                "roadmap_config": self.config.get("roadmap", {}),
                "links_config": self.config.get("links", {}),
                "robots_config": self.config.get("robots", {}),
                "related_apps_config": self.config.get("related_apps", {}),
                "generation_config": self.config.get_generation_config(),
                "search_config": self.config.get_search_config(),
                "performance_config": self.config.get_performance_config(),
                "format_stars": self.template_helpers.format_stars,
                "format_date": self.template_helpers.format_date,
                "format_license": self.template_helpers.format_license,
                "format_licenses": self.template_helpers.format_licenses,
                "is_license_nonfree": self.template_helpers.is_license_nonfree,
                "format_platforms": self.template_helpers.format_platforms,
                "get_platforms_badges_html": self.template_helpers.get_platforms_badges_html,
                "get_categories_badges_html": self.template_helpers.get_categories_badges_html,
                "truncate_description": self.template_helpers.truncate_description,
                "get_app_url": self.template_helpers.get_app_url,
                "get_platform_color": self.template_helpers.get_platform_color,
                "render_template_string": self.template_helpers.render_template_string,
                "get_link_target_attrs": self.template_helpers.get_link_target_attrs,
                "markdown_to_html": self.template_helpers.markdown_to_html,
                "style_description_links": self.template_helpers.style_description_links,
                "process_banner_text": self.template_helpers.process_banner_text,
                "base_path": self.config.get("site.base_path", "").rstrip("/"),
                "url_for": self.template_helpers.url_for,
                "asset_url": self.template_helpers.asset_url,
                "filter_navigation": self.template_helpers.filter_navigation,
                "get_letter_avatar_color": self.template_helpers.get_letter_avatar_color,
                "get_app_icon_html": self.template_helpers.get_app_icon_html,
            }
        )

        # Custom filters
        self.jinja_env.filters.update(
            {
                "slugify": self.template_helpers.slugify,
                "sort_by_stars": self.template_helpers.sort_by_stars,
            }
        )

    def generate_site(  # pylint: disable=too-many-arguments
        self,
        applications: List[Application],
        categories: Dict,
        statistics: Dict,
        licenses: Dict = None,
        markdown_data: Dict = None,
    ):
        """Generate the complete static site."""
        print("Starting site generation...")

        # Update template helpers and related apps finder with license data
        if licenses:
            self.licenses_data = licenses  # Store for use in related apps algorithm
            self.template_helpers = TemplateHelpers(self.config, licenses)
            self.related_apps_finder = RelatedAppsFinder(self.related_apps_config, licenses)
            self._register_template_functions()

        # Ensure output directories exist
        self.config.ensure_directories()

        # Copy static assets
        self._copy_static_assets()

        # Generate search data
        if self.config.get("generation.enable_search_index", True):
            search_data = self._generate_search_data(applications)
            self._generate_search_data_file(search_data)
            print("  Search index enabled - search data generated")
        else:
            search_data = None
            print("  Search index disabled - skipping search data generation")

        # Generate pages
        self._generate_homepage(applications, categories, statistics, markdown_data)
        self._generate_browse_page(applications, categories)
        self._generate_statistics_page(applications, categories, statistics)
        self._generate_app_detail_pages(applications)
        if self.config.get("roadmap.enabled", False):
            self._generate_roadmap_page()

        # Generate alternatives page
        if self.config.get("alternatives.enabled", False):
            self._generate_alternatives_page(applications)
            # Generate alternatives data file for client-side loading
            self._generate_alternatives_data_file(applications)
            print("Alternatives data file generated")

        # Generate additional files
        if self.config.get("generation.generate_sitemap", True):
            self._generate_sitemap(applications)
        else:
            print("Sitemap generation disabled - skipping sitemap.xml")
        self._generate_robots_txt()
        self._generate_htaccess()

        # Show minification status
        if self.config.get("generation.minify_html", False):
            if MINIFY_AVAILABLE:
                print("  HTML minification enabled")
            else:
                print("  HTML minification enabled but minify-html library not available")
        else:
            print("  HTML minification disabled")

        print("Site generation complete!")

    def _copy_static_assets(self):
        """Copy static assets to output directory."""
        if self.config.static_dir.exists():
            output_static = self.config.output_dir / "static"

            # Remove existing static directory
            if output_static.exists():
                shutil.rmtree(output_static)

            # Files to exclude from copying
            exclude_files = {'tailwind-input.css'}

            # Copy static files
            for item in self.config.static_dir.rglob('*'):
                if item.is_file() and item.name not in exclude_files:
                    rel_path = item.relative_to(self.config.static_dir)
                    dst_path = output_static / rel_path
                    dst_path.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(item, dst_path)
            print("  Static assets copied")

    def _generate_homepage(
        self,
        applications: List[Application],
        categories: Dict,
        statistics: Dict,
        markdown_data: Dict = None,
    ):
        """Generate the homepage."""
        template = self.jinja_env.get_template("pages/index.html")

        homepage_config = self.config.get("ui.homepage", {})
        limits = self.config.get("ui.limits", {})
        include_nonfree = homepage_config.get("include_nonfree", True)

        # Filter applications based on include_nonfree setting
        if include_nonfree:
            filtered_apps = applications
        else:
            filtered_apps = [
                app for app in applications if not self.related_apps_finder.is_app_nonfree(app)
            ]

        # Get popular applications (top starred)
        popular_apps = sorted(
            [app for app in filtered_apps if app.stars],
            key=lambda x: x.stars or 0,
            reverse=True,
        )[: limits.get("homepage_popular_apps", 12)]

        # Get recent updates
        recent_apps = sorted(
            [app for app in filtered_apps if app.last_updated],
            key=lambda x: x.last_updated or "",
            reverse=True,
        )[: limits.get("homepage_recently_updated", 8)]

        # Get random picks (high quality apps with good ratings)
        quality_apps = [app for app in filtered_apps if app.stars and app.stars >= 100]
        random.shuffle(quality_apps)
        random_picks = quality_apps[: limits.get("homepage_random_picks", 6)]

        # Get alternatives
        top_alternatives = []
        if self.config.get("alternatives.enabled", False):
            processor = DataProcessor(self.config)
            alternatives_data = processor.generate_alternatives_data(applications)

            # Get top alternatives (by number of alternative apps)
            min_alternatives = self.config.get("alternatives.min_alternatives", 2)

            # Filter alternatives based on include_nonfree setting
            if include_nonfree:
                # Include all apps
                alternatives_for_homepage = alternatives_data['alternatives']
            else:
                # Filter out nonfree apps from each alternative group
                alternatives_for_homepage = {}
                for name, apps in alternatives_data['alternatives'].items():
                    filtered_apps_for_alt = [app for app in apps if not self.related_apps_finder.is_app_nonfree(app)]
                    if filtered_apps_for_alt:  # Only include if there are free alternatives
                        alternatives_for_homepage[name] = filtered_apps_for_alt

            filtered_alternatives = {
            name: apps for name, apps in alternatives_for_homepage.items()
            if len(apps) >= min_alternatives
            }

            # Sort by number of alternatives and take top ones for homepage
            top_alternatives = sorted(
                filtered_alternatives.items(),
                key=lambda x: len(x[1]),
                reverse=True
            )[: limits.get("homepage_alternatives", 6)]

        # Get top categories by app count
        category_stats = []
        for cat_id, cat_info in categories.items():
            if cat_info["count"] > 0:
                # Create slugified version of the category name for consistent URLs
                category_name = cat_info["name"]
                category_slug = self.template_helpers.slugify(category_name)

                category_stats.append(
                    {
                        "id": cat_id,
                        "name": category_name,
                        "count": cat_info["count"],
                        "url": f"/browse.html?category={category_slug}",
                    }
                )

        category_stats.sort(key=lambda x: x["count"], reverse=True)

        # Deduplicate categories while preserving order (highest counts first)
        unique_category_stats = []
        seen_category_slugs = set()
        for category in category_stats:
            category_slug = self.template_helpers.slugify(category["name"])
            if category_slug in seen_category_slugs:
                continue
            seen_category_slugs.add(category_slug)
            unique_category_stats.append(category)

        content = template.render(
            popular_apps=popular_apps,
            recent_apps=recent_apps,
            random_picks=random_picks,
            alternatives=top_alternatives,
            categories=unique_category_stats[: limits.get("homepage_popular_categories", 8)],
            statistics=statistics,
            total_applications=len(applications),
            markdown_data=markdown_data or {},
            homepage_config=homepage_config,
            page_title=None,  # Use site title for homepage
        )

        # Minify HTML if enabled
        content = self._minify_html_if_enabled(content)

        output_path = self.config.output_dir / "index.html"
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(content)

        print("  Homepage generated")

    def _generate_browse_page(self, applications: List[Application], categories: Dict):
        """Generate the browse page at /browse.html with client-side pagination."""
        template = self.jinja_env.get_template("pages/browse.html")

        # Generate single page with empty applications (JavaScript will populate)
        content = template.render(
            applications=[],  # Empty - JavaScript will handle all rendering
            categories=categories,
            total_applications=len(applications),
            items_per_page=self.config.get("generation.items_per_page", 24),
            page_title="Browse Applications",
        )

        # Minify HTML if enabled
        content = self._minify_html_if_enabled(content)

        # Save browse page
        output_path = self.config.output_dir / "browse.html"
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(content)

        print(
            f"  Browse page generated (client-side rendering for {len(applications)} apps)"
        )

    def _generate_browse_as_homepage(
        self, applications: List[Application], categories: Dict
    ):
        """Generate the browse page as homepage (index.html) with client-side pagination."""
        # This has been deprecated in favor of _generate_homepage, however I will keep it here for now for reference and future use
        template = self.jinja_env.get_template("pages/browse.html")

        # Generate single page with empty applications (JavaScript will populate)
        content = template.render(
            applications=[],  # Empty - JavaScript will handle all rendering
            categories=categories,
            total_applications=len(applications),
            items_per_page=self.config.get("generation.items_per_page", 24),
            page_title="Browse Applications",
        )

        # Minify HTML if enabled
        content = self._minify_html_if_enabled(content)

        # Save single homepage
        output_path = self.config.output_dir / "index.html"
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(content)

        print(
            f"  Browse page generated (client-side rendering for {len(applications)} apps)"
        )

    def _generate_alternatives_page(self, applications: List[Application]):
        """Generate the alternatives page."""
        processor = DataProcessor(self.config)
        alternatives_data = processor.generate_alternatives_data(applications)

        # Apply minimum alternatives filter
        min_alternatives = self.config.get("alternatives.min_alternatives", 2)
        filtered_alternatives_raw = {
            name: apps for name, apps in alternatives_data['alternatives'].items()
            if len(apps) >= min_alternatives
        }

        # Convert Application objects to dictionaries for JSON serialization
        filtered_alternatives = {}
        for name, apps in filtered_alternatives_raw.items():
            filtered_alternatives[name] = [asdict(app) for app in apps]

        template = self.jinja_env.get_template("pages/alternatives.html")

        content = template.render(
            alternatives=filtered_alternatives,
            alternatives_statistics=alternatives_data['statistics'],
            total_software=len(filtered_alternatives),
            total_alternatives=sum(len(apps) for apps in filtered_alternatives.values()),
            total_all_applications=len(applications),  # Total applications in the dataset
            alternatives_config=self.config.get("alternatives", {}),
            page_title="Alternative Software"
        )

        # Minify HTML if enabled
        content = self._minify_html_if_enabled(content)

        output_path = self.config.output_dir / "alternatives.html"
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(content)

        print(f"Alternatives page generated ({len(filtered_alternatives)} software with alternatives)")

    def _generate_statistics_page(
        self, applications: List[Application], categories: Dict, statistics: Dict):
        """Generate the statistics page."""
        template = self.jinja_env.get_template("pages/statistics.html")

        content = template.render(
            applications=applications,
            categories=categories,
            statistics=statistics,
            page_title="Statistics",
        )

        # Minify HTML if enabled
        content = self._minify_html_if_enabled(content)

        output_path = self.config.output_dir / "statistics.html"
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(content)

        print("  Statistics page generated")

    def _generate_roadmap_page(self):
        """Generate the roadmap page."""
        template = self.jinja_env.get_template("pages/roadmap.html")

        content = template.render(
            page_title="My Roadmap",
        )

        content = self._minify_html_if_enabled(content)
        output_path = self.config.output_dir / "roadmap.html"
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(content)

        print("  Roadmap page generated")

    def _generate_app_detail_pages(self, applications: List[Application]):
        """Generate individual application detail pages."""
        template = self.jinja_env.get_template("pages/app_detail.html")
        related_apps_limit = self.config.get("ui.limits.related_apps", 6)

        # Create apps directory
        apps_dir = self.config.output_dir / "apps"
        apps_dir.mkdir(exist_ok=True)

        for app in applications:
            # Find related applications
            related_apps_found = self.related_apps_finder.find_related_apps(app, applications)

            content = template.render(
                app=app,
                related_apps=related_apps_found[:related_apps_limit],
                page_title=f"{app.name} - Applications",
            )

            # Minify HTML if enabled
            content = self._minify_html_if_enabled(content)

            output_path = apps_dir / f"{app.id}.html"
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(content)

        print(f"  Application detail pages generated ({len(applications)} apps)")

    def _generate_search_data(self, applications: List[Application]) -> Dict[str, Any]:
        """Generate search data for client-side search."""
        search_data = []

        for app in applications:
            search_entry = {
                "id": app.id,
                "name": app.name,
                "description": app.description,
                "url": app.url,
                "repo_url": app.repo_url,
                "demo_url": app.demo_url,
                "categories": app.categories,
                "license": app.license,
                "platforms": app.platforms,
                "stars": app.stars or 0,
                "last_updated": app.last_updated,
                "depends_3rdparty": app.depends_3rdparty,
                "icon_url": app.icon_url,
                "current_release": app.current_release,
                "commit_history": app.commit_history,
                "is_nonfree": self.related_apps_finder.is_app_nonfree(app),
                "date_added": app.date_added,
                "documentation_language": app.documentation_language,
                "fork_of": app.fork_of,
                "fork_url": app.fork_url,
            }
            search_data.append(search_entry)

        # Get non-free license identifiers for frontend
        nonfree_licenses = []
        if hasattr(self, "licenses_data") and self.licenses_data:
            nonfree_licenses = [
                lic_id
                for lic_id, lic_info in self.licenses_data.items()
                if not lic_info.get("free", True)
            ]

        # Check if git data is available
        git_data_available = any(app.date_added for app in applications)

        return {
            "apps": search_data,
            "total": len(search_data),
            "nonfree_licenses": nonfree_licenses,
            "git_data_available": git_data_available,
        }

    def _generate_search_data_file(self, search_data: Dict[str, Any]):
        """Generate search data JSON file for client-side search."""
        search_file = self.config.output_dir / "static" / "data" / "search.json"
        search_file.parent.mkdir(exist_ok=True)

        with open(search_file, "w", encoding="utf-8") as f:
            json.dump(search_data, f, separators=(",", ":"))

        print("  Search data file generated")

    def _generate_alternatives_data_file(self, applications: List[Application]) -> Dict[str, Any]:
        """Generate alternatives data JSON file for client-side alternatives page."""
        processor = DataProcessor(self.config)
        alternatives_data = processor.generate_alternatives_data(applications)

        # Apply minimum alternatives filter
        min_alternatives = self.config.get("alternatives.min_alternatives", 2)
        filtered_alternatives = {
            name: [asdict(app) for app in apps]
            for name, apps in alternatives_data['alternatives'].items()
            if len(apps) >= min_alternatives
        }

        # Create the data structure for the JSON file
        json_data = {
            "alternatives": filtered_alternatives,
            "statistics": alternatives_data['statistics'],
            "total_software": len(filtered_alternatives),
            "total_alternatives": sum(len(apps) for apps in filtered_alternatives.values()),
            "config": self.config.get("alternatives", {})
        }

        # Write to file
        alternatives_file = self.config.output_dir / "static" / "data" / "alternatives.json"
        alternatives_file.parent.mkdir(exist_ok=True)

        with open(alternatives_file, "w", encoding="utf-8") as f:
            json.dump(json_data, f, separators=(",", ":"))

        return json_data

    def _generate_sitemap(self, applications: List[Application]):
        """Generate XML sitemap."""

        template = self.jinja_env.get_template("sitemap.xml")
        base_path = self.config.get('site.base_path', '').rstrip('/')

        # Current date in W3C Datetime format (YYYY-MM-DD)
        current_date = datetime.now().strftime('%Y-%m-%d')

        urls = [
            {"loc": base_path + "/", "lastmod": current_date, "priority": "1.0"},  # Homepage
            {"loc": base_path + "/browse.html", "lastmod": current_date, "priority": "0.9"},  # Browse page
            {"loc": base_path + "/statistics.html", "lastmod": current_date, "priority": "0.7"},  # Statistics page
        ]

        if self.config.get("roadmap.enabled", False):
            urls.append({"loc": base_path + "/roadmap.html", "lastmod": current_date, "priority": "0.6"})

        # Add alternatives page if enabled
        if self.config.get("alternatives.enabled", False):
            urls.append({"loc": base_path + "/alternatives.html", "lastmod": current_date, "priority": "0.8"})

        # Add application pages
        for app in applications:
            urls.append({
                "loc": base_path + f"/apps/{app.id}.html",
                "lastmod": current_date,
                "priority": "0.1"
            })

        content = template.render(
            urls=urls,
            site_url=self.config.get("site.url", "https://awesome-selfhosted.net") + base_path,
        )

        output_path = self.config.output_dir / "sitemap.xml"
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(content)

        print("  Sitemap generated")

    def _generate_robots_txt(self):
        """Generate robots.txt file."""
        robots_config = self.config.get("robots", {})
        base_path = self.config.get('site.base_path', '').rstrip('/')

        # Skip generation if not enabled
        if not robots_config.get("generate", True):
            return

        # Default robots.txt content
        content = []

        # User-agent
        user_agent = robots_config.get("user_agent", "*")
        content.append(f"User-agent: {user_agent}")

        # Allow directives
        allow_paths = robots_config.get("allow", ["/"])
        for path in allow_paths:
            content.append(f"Allow: {path}")

        # Disallow directives
        disallow_paths = robots_config.get("disallow", ["/static/data/"])
        for path in disallow_paths:
            content.append(f"Disallow: {path}")

        # Sitemap URL
        site_url = self.config.get("site.url", "")
        sitemap_path = robots_config.get("sitemap_url", "/sitemap.xml")
        if site_url:
            content.append(f"\nSitemap: {site_url}{base_path}{sitemap_path}")

        # Write robots.txt
        robots_path = self.config.output_dir / "robots.txt"
        with open(robots_path, "w", encoding="utf-8") as f:
            f.write("\n".join(content))

        print("  Robots.txt generated")

    def _generate_htaccess(self):
        """Generate .htaccess file for Apache servers."""
        htaccess_config = self.config.get("htaccess", {})
        base_path = self.config.get('site.base_path', '').rstrip('/')

        # Skip generation if not enabled
        if not htaccess_config.get("generate", False):
            return

        content = []

        # Add header comment
        content.append("# Generated by Awesome Selfhosted Website Generator")
        content.append("# This file removes .html extensions from URLs")
        content.append("")

        # Enable rewrite engine
        content.append("RewriteEngine On")
        content.append("")

        # Handle base path if configured
        if base_path:
            content.append(f"RewriteBase {base_path}/")
            content.append("")

        # Only add HTML extension removal rules if enabled
        if htaccess_config.get("remove_html_extension", True):
            # Remove .html extension from URLs
            content.append("# Remove .html extension from URLs")
            content.append("# If the request has a .html extension")
            content.append("RewriteCond %{THE_REQUEST} \\.html")
            content.append("# Redirect to the same URL without .html extension")
            content.append(r"RewriteRule ^(.*)\.html$ /$1 [R=301,L]")
            content.append("")

            # Add .html internally when accessing URLs without extension
            content.append("# Add .html extension internally for file resolution")
            content.append("# If the request is not for a file or directory that exists")
            content.append("RewriteCond %{REQUEST_FILENAME} !-f")
            content.append("RewriteCond %{REQUEST_FILENAME} !-d")
            content.append("# And the .html version of the file exists")
            content.append("RewriteCond %{REQUEST_FILENAME}.html -f")
            content.append("# Serve the .html file")
            content.append("RewriteRule ^(.*)$ $1.html [L]")

        # Write .htaccess file
        htaccess_path = self.config.output_dir / ".htaccess"
        with open(htaccess_path, "w", encoding="utf-8") as f:
            f.write("\n".join(content))

        print("  .htaccess generated")

    def _minify_html_if_enabled(self, html_content: str) -> str:
        """Minify HTML content if enabled in configuration."""
        if self.config.get("generation.minify_html", False):
            if MINIFY_AVAILABLE:
                try:
                    return minify(html_content, minify_js=True, minify_css=True)
                except (TypeError, ValueError) as e:
                    print(f"Warning: HTML minification failed: {e}")
                    return html_content
            else:
                print(
                    "Warning: HTML minification enabled but minify-html library not available"
                )
                return html_content
        return html_content
