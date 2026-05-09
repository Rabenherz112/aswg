"""
Template helper functions for Jinja2 templates.
"""

import html
import re
from datetime import datetime
from typing import List, Any
from urllib.parse import urlparse
from jinja2 import Template, TemplateError
from .config import Config


class TemplateHelpers:  # pylint: disable=too-many-public-methods
    """Helper functions for Jinja2 templates."""

    def __init__(self, config: Config, licenses_data: dict = None):
        """Initialize template helpers with configuration and license data."""
        self.config = config
        self.licenses_data = licenses_data or {}

    def slugify(self, text: str) -> str:
        """Convert text to URL-friendly slug."""
        if not text:
            return ""

        # Convert to lowercase and replace spaces/special chars with hyphens
        slug = re.sub(r"[^a-z0-9]+", "-", text.lower().strip())
        return slug.strip("-")

    def get_letter_avatar_color(self, name: str) -> str:
        """Generate a deterministic HSL color from a name string for letter avatars."""
        hash_val = 0
        for ch in name:
            hash_val = ord(ch) + ((hash_val << 5) - hash_val)
            hash_val = hash_val & 0xFFFFFFFF  # keep 32-bit
        hue = abs(hash_val) % 360
        return f"hsl({hue}, 45%, 55%)"

    def get_app_icon_html(self, app, size: str = "sm") -> str:
        """Return HTML for an app icon or letter-avatar fallback. Returns empty string if disabled."""
        if not self.config.get("ui.show_project_icons", True):
            return ""

        if size == "lg":
            avatar_cls = "letter-avatar letter-avatar-lg"
            img_cls = "app-icon-lg"
        else:
            avatar_cls = "letter-avatar letter-avatar-sm"
            img_cls = "app-icon"

        first_letter = app.name[0].upper() if app.name else "?"
        color = self.get_letter_avatar_color(app.name)
        icon_url = getattr(app, "icon_url", None)

        if icon_url:
            return (
                f'<img src="{icon_url}" alt="" class="{img_cls}" loading="lazy">'
            )
        return (
            f'<div class="{avatar_cls}" style="background:{color};">'
            f'{first_letter}</div>'
        )

    def format_stars(self, stars: int) -> str:
        """Format star count for display."""
        if stars is None or stars == 0:
            return ""

        if stars >= 1000:
            return f"{stars / 1000:.1f}k"
        return str(stars)

    def format_date(self, date_str: str) -> str:
        """Format date string for display."""
        if not date_str:
            return ""

        try:
            # Handle different date formats
            if "T" in date_str:
                # ISO datetime format (2023-12-01T10:30:00Z)
                dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            else:
                # Simple date format (2025-07-21)
                dt = datetime.strptime(date_str, "%Y-%m-%d")

            return dt.strftime("%B %d, %Y")
        except (ValueError, AttributeError) as e:
            print(f"Warning: Could not parse date '{date_str}': {e}")
            return date_str

    def truncate_description(self, description: str, length: int = None, show_full: bool = None) -> str:
        """Truncate description to specified length with configurable behavior."""
        if not description:
            return ""

        truncation_config = self.config.get("ui.truncation", {})
        if length is None:
            length = truncation_config.get("default_description_length", 150)
        if show_full is None:
            show_full = truncation_config.get("browse_description_full", False)

        if show_full or len(description) <= length:
            return description

        # Avoid leaking broken markdown fragments (e.g. "[Label](https://...") in previews.
        preview_text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1", description)
        truncated = preview_text[:length]
        last_space = truncated.rfind(" ")

        if last_space > 0:
            truncated = truncated[:last_space]

        return truncated + "..."

    def get_app_url(self, app_id: str) -> str:
        """Get URL for application detail page."""
        # Don't use url_for here as it will be called from templates
        return f"/apps/{app_id}.html"

    def format_license(self, license_name: str) -> str:
        """Format single license name for display using loaded license data."""
        if not license_name:
            return "Unknown"

        # First try exact match
        if license_name in self.licenses_data:
            return self.licenses_data[license_name]["name"]

        # Try case-insensitive match
        for license_id, license_info in self.licenses_data.items():
            if license_id.lower() == license_name.lower():
                return license_info["name"]

        # Return original name if no match found
        return license_name

    def format_licenses(self, licenses) -> str:
        """Format multiple licenses for display."""
        if not licenses:
            return "Unknown"

        # Handle both list and string cases
        if isinstance(licenses, str):
            return self.format_license(licenses)

        if isinstance(licenses, list):
            if len(licenses) == 1:
                return self.format_license(licenses[0])
            formatted_licenses = [self.format_license(license) for license in licenses]
            return " / ".join(formatted_licenses)

        return str(licenses)

    def is_license_nonfree(self, license_id: str) -> bool:
        """Check if a single license is non-free."""
        if not license_id:
            return False

        # Get non-free license identifiers from loaded license data
        if hasattr(self, "licenses_data") and self.licenses_data:
            nonfree_licenses = {
                lic_id
                for lic_id, lic_info in self.licenses_data.items()
                if not lic_info.get("free", True)
            }
            return license_id in nonfree_licenses

        # Fallback to basic check if license data not available
        return license_id in ["⊘ Proprietary"]

    def format_platforms(self, platforms) -> str:
        """Format multiple platforms for display."""
        if not platforms:
            return ""

        # Handle both list and string cases
        if isinstance(platforms, str):
            return platforms

        if isinstance(platforms, list):
            if len(platforms) == 1:
                return platforms[0]
            return " / ".join(platforms)

        return str(platforms)

    def get_platforms_badges_html(self, platforms) -> str:
        """Generate HTML badges for platforms."""
        if not platforms:
            return ""

        # Handle both list and string cases
        if isinstance(platforms, str):
            platforms = [platforms]
        elif not isinstance(platforms, list):
            return ""

        html_parts = []
        for platform in platforms:
            if platform:
                color = self.get_platform_color(platform)
                html_parts.append(
                    f'<span class="inline-flex items-center text-text-muted text-sm mr-2 mb-1">'
                    f'<div class="w-3 h-3 rounded-full mr-2" style="background-color: {color};"></div>'
                    f'{platform}</span>'
                )

        return " ".join(html_parts)

    def get_categories_badges_html(self, categories) -> str:
        """Generate HTML badges for categories."""
        if not categories:
            return ""

        # Handle both list and string cases
        if isinstance(categories, str):
            categories = [categories]
        elif not isinstance(categories, list):
            return ""

        html_parts = []
        for category in categories:
            if category:
                html_parts.append(
                    f'<span class="inline-block bg-badge-bg text-badge-text text-sm px-3 py-1 rounded-full">{category}</span>'
                )

        return " ".join(html_parts)

    def sort_by_stars(self, apps: List[Any], reverse: bool = True) -> List[Any]:
        """Sort applications by star count."""
        return sorted(apps, key=lambda x: x.stars or 0, reverse=reverse)

    def get_platform_color(self, platform: str) -> str:
        """Get color for platform/technology using CSS variables for light/dark mode support."""
        # Common platform colors using CSS variables
        platform_vars = {
            "python": "var(--color-platform-python)",
            "javascript": "var(--color-platform-javascript)",
            "typescript": "var(--color-platform-typescript)",
            "java": "var(--color-platform-java)",
            "go": "var(--color-platform-go)",
            "rust": "var(--color-platform-rust)",
            "php": "var(--color-platform-php)",
            "c": "var(--color-platform-c)",
            "c++": "var(--color-platform-cpp)",
            "c#": "var(--color-platform-csharp)",
            "ruby": "var(--color-platform-ruby)",
            "shell": "var(--color-platform-shell)",
            "docker": "var(--color-platform-docker)",
            "nodejs": "var(--color-platform-nodejs)",
            "dart": "var(--color-platform-dart)",
            "kotlin": "var(--color-platform-kotlin)",
            "swift": "var(--color-platform-swift)",
            "scala": "var(--color-platform-scala)",
            "deb": "var(--color-platform-deb)",
            "k8s": "var(--color-platform-k8s)",
            "perl": "var(--color-platform-perl)",
            "elixir": "var(--color-platform-elixir)",
            ".net": "var(--color-platform-dotnet)",
            "dotnet": "var(--color-platform-dotnet)",
            "lua": "var(--color-platform-lua)",
            "django": "var(--color-platform-django)",
            "haskell": "var(--color-platform-haskell)",
            "ansible": "var(--color-platform-ansible)",
            "deno": "var(--color-platform-deno)",
            "erlang": "var(--color-platform-erlang)",
            "ocaml": "var(--color-platform-ocaml)",
            "commonlisp": "var(--color-platform-commonlisp)",
            "nix": "var(--color-platform-nix)",
            "crystal": "var(--color-platform-crystal)",
            "plpgsql": "var(--color-platform-plpgsql)",
            "assembly": "var(--color-platform-assembly)",
            "objective-c": "var(--color-platform-objectivec)",
            "objectivec": "var(--color-platform-objectivec)",
            "haxe": "var(--color-platform-haxe)",
        }

        if not platform:
            return "var(--color-platform-default)"

        return platform_vars.get(platform.lower(), "var(--color-platform-default)")

    def render_template_string(self, template_str: str, context: dict = None) -> str:
        """Render a template string with given context."""
        if not template_str:
            return ""

        # Merge with site config by default
        full_context = {
            "site": self.config.get_site_config(),
            "current_year": datetime.now().year
        }
        if context:
            full_context.update(context)

        try:
            template = Template(template_str)
            return template.render(**full_context)
        except TemplateError as e:
            print(f"Warning: Could not render template string '{template_str}': {e}")
            return template_str

    def get_link_target_attrs(self, url: str, is_internal: bool = None) -> str:
        """Get target and rel attributes for links based on configuration."""
        links_config = self.config.get("links", {})

        # Auto-detect if internal/external if not specified
        if is_internal is None:
            site_url = self.config.get("site.url", "")
            is_site_url = site_url and url.startswith(site_url)
            # For non-site URLs, check if it's a local path or file
            is_local = (
                url.startswith("/")
                or url.startswith("./")
                or url.startswith("../")
                or (
                    not url.startswith("http")
                    and (url.endswith(".html") or url.endswith(".htm"))
                )
            )

            is_internal = is_site_url or is_local

        target_attrs = ""

        if is_internal:
            if links_config.get("open_in_new_tab_for_internal_links", False):
                target_attrs = ' target="_blank" rel="noopener"'
            else:
                target_attrs = ' target="_self"'
        else:
            if links_config.get("open_in_new_tab_for_external_links", False):
                target_attrs = ' target="_blank" rel="noopener noreferrer"'
            else:
                target_attrs = ' target="_self" rel="noreferrer"'

        return target_attrs

    def markdown_to_html(self, markdown_text: str) -> str:
        """Convert markdown text to HTML for footer content."""
        if not markdown_text:
            return ""

        processed_text = markdown_text

        # Get footer configuration for section filtering
        footer_config = self.config.get("ui.footer_markdown", {})
        excluded_sections = footer_config.get("exclude_sections", [])

        # Remove excluded sections if configured
        if excluded_sections:
            for section in excluded_sections:
                # Remove section by header (case-insensitive)
                section_pattern = rf"^#+\s+{re.escape(section)}.*?(?=^#+|\Z)"
                processed_text = re.sub(
                    section_pattern,
                    "",
                    processed_text,
                    flags=re.MULTILINE | re.DOTALL | re.IGNORECASE,
                )

        # Remove horizontal rules (---- patterns)
        processed_text = re.sub(r"^-{4,}\s*$", "", processed_text, flags=re.MULTILINE)
        processed_text = re.sub(r"^={4,}\s*$", "", processed_text, flags=re.MULTILINE)

        # Remove relative links like [](#awesome-selfhosted) and empty links
        processed_text = re.sub(r"\*\*\[[^\]]*\]\(#[^)]+\)\*\*", "", processed_text)
        processed_text = re.sub(r"\[[^\]]*\]\(#[^)]+\)", "", processed_text)

        # Remove code blocks (backticks)
        processed_text = re.sub(r"`[^`]*?`", "", processed_text)

        # Convert links: [text](url) - use proper link target configuration
        def replace_link(match):
            text = match.group(1)
            url = match.group(2)

            # For markdown links, treat all URLs as external unless they are relative paths
            is_internal = (
                url.startswith("/")
                or url.startswith("./")
                or url.startswith("../")
                or url.startswith("#")
            )
            target_attrs = self.get_link_target_attrs(url, is_internal)
            return f'<a href="{url}"{target_attrs} class="text-link hover:text-link-hover underline">{text}</a>'

        processed_text = re.sub(
            r"\[([^\]]+)\]\(([^)]+)\)", replace_link, processed_text, flags=re.MULTILINE
        )

        # Convert headers (## and ### only)
        processed_text = re.sub(
            r"^### (.+)$",
            r'<h3 class="text-2xl font-bold text-text mb-4 mt-8 text-center">\1</h3>',
            processed_text,
            flags=re.MULTILINE,
        )
        processed_text = re.sub(
            r"^## (.+)$",
            r'<h2 class="text-3xl font-bold text-text mb-4 text-center">\1</h2>',
            processed_text,
            flags=re.MULTILINE,
        )

        # Convert bold text - but skip if it contains empty links
        def replace_bold(match):
            content = match.group(1)
            # Skip if this contains an empty link pattern
            if re.search(r"\[\]\([^)]+\)", content):
                return match.group(0)  # Return unchanged
            return f'<strong class="font-semibold">{content}</strong>'

        processed_text = re.sub(r"\*\*([^*]+)\*\*", replace_bold, processed_text)

        # Split into paragraphs and process
        paragraphs = processed_text.split("\n\n")
        html_paragraphs = []

        for paragraph in paragraphs:
            paragraph = paragraph.strip()
            if not paragraph:
                continue

            # Skip if it's already a header
            if paragraph.startswith("<h"):
                html_paragraphs.append(paragraph)
            else:
                # Check if this is an unordered list
                lines = paragraph.split("\n")
                is_unordered_list = all(
                    line.strip().startswith("- ") or line.strip() == ""
                    for line in lines
                    if line.strip()
                )

                if is_unordered_list and any(
                    line.strip().startswith("- ") for line in lines
                ):
                    # Convert to unordered list
                    list_items = []
                    for line in lines:
                        line = line.strip()
                        if line.startswith("- "):
                            item_content = line[2:].strip()
                            list_items.append(
                                f'<li class="text-text-muted mb-2">{item_content}</li>'
                            )

                    if list_items:
                        html_paragraphs.append(
                            f'<ul class="list-disc list-outside mb-4 space-y-1 pl-5">\n{"".join(list_items)}\n</ul>'
                        )
                else:
                    # Handle as regular paragraph
                    processed_lines = []

                    for line in lines:
                        line = line.strip()
                        if line:
                            processed_lines.append(line)

                    if processed_lines:
                        # Join lines with space and wrap in paragraph
                        paragraph_content = " ".join(processed_lines)
                        html_paragraphs.append(
                            f'<p class="text-text-muted mb-4 leading-relaxed text-center">{paragraph_content}</p>'
                        )

        # Join all paragraphs
        processed_text = "\n\n".join(html_paragraphs)

        # Clean up any extra whitespace left from removed sections
        processed_text = re.sub(r"\n{3,}", "\n\n", processed_text)
        processed_text = processed_text.strip()

        return processed_text

    def style_description_links(self, description: str) -> str:
        """Add proper styling to links in description text."""
        if not description:
            return ""

        # Style any <a> tags that don't already have classes
        def style_link(match):
            full_tag = match.group(0)
            # If it already has a class attribute, don't modify
            if "class=" in full_tag:
                return full_tag

            # Extract href and content
            href_match = re.search(r'href="([^"]*)"', full_tag)
            content_match = re.search(r">([^<]*)</a>", full_tag)

            if href_match and content_match:
                href = href_match.group(1)
                content = content_match.group(1)

                # Add proper target attributes using the helper
                target_attrs = self.get_link_target_attrs(
                    href, not href.startswith("http")
                )

                return f'<a href="{href}"{target_attrs} class="text-link hover:text-link-hover underline font-medium">{content}</a>'

            return full_tag

        return re.sub(r"<a[^>]*>.*?</a>", style_link, description)

    def autolink_description_urls(self, description: str) -> str:
        """Convert plain HTTP(S) URLs in description text into safe anchor tags."""
        if not description:
            return ""
        pattern = re.compile(r"\[([^\]]+)\]\((https?://[^)\s]+)\)|https?://[^\s<>\"]+")
        parts = []
        last_end = 0
        for match in pattern.finditer(description):
            start, end = match.span()
            markdown_label = match.group(1)
            markdown_url = match.group(2)
            raw_url = markdown_url if markdown_url else match.group(0)
            url = raw_url
            trailing = ""
            while url and url[-1] in ".,;:!?)]":
                if url[-1] == ")" and url.count("(") >= url.count(")"):
                    break
                trailing = url[-1] + trailing
                url = url[:-1]
            is_valid_url = False
            parsed = urlparse(url)
            if parsed.scheme.lower() in ("http", "https") and parsed.netloc:
                is_valid_url = True
            parts.append(html.escape(description[last_end:start]))
            if is_valid_url:
                href = html.escape(url, quote=True)
                text = html.escape(markdown_label) if markdown_label else html.escape(url)
                attrs = self.get_link_target_attrs(url, False)
                parts.append(f'<a href="{href}"{attrs} class="text-link hover:text-link-hover underline font-medium">{text}</a>')
                if not markdown_label:
                    parts.append(html.escape(trailing))
            else:
                parts.append(html.escape(match.group(0)))
            last_end = end
        parts.append(html.escape(description[last_end:]))
        return "".join(parts)

    def process_banner_text(self, text: str) -> str:
        """Process banner text to handle markdown-style bold formatting."""
        if not text:
            return ""

        # Replace **text** with <strong>text</strong>
        # This regex captures non-greedy content between ** pairs
        processed = re.sub(r'\*\*(.*?)\*\*', r'<strong class="font-semibold">\1</strong>', text)

        return processed

    def get_base_path(self) -> str:
        """Get the base path for the site."""
        return self.config.get('site.base_path', '').rstrip('/')

    def url_for(self, path: str) -> str:
        """Generate a URL with the base path prepended."""
        base_path = self.get_base_path()

        # Handle absolute URLs (external links)
        if path.startswith('http://') or path.startswith('https://'):
            return path

        # Ensure path starts with /
        if not path.startswith('/'):
            path = '/' + path

        # Prepend base path
        return base_path + path

    def asset_url(self, path: str) -> str:
        """Generate an asset URL with the base path prepended."""
        # Remove leading slash if present for consistency
        if path.startswith('/'):
            path = path[1:]

        base_path = self.get_base_path()
        return f"{base_path}/{path}"

    def filter_navigation(self, navigation_items: list) -> list:
        """Filter navigation items based on enabled conditions."""
        if not navigation_items:
            return []

        filtered_items = []
        for item in navigation_items:
            # Check if item has enabled condition
            if 'enabled' in item:
                enabled_condition = item['enabled']

                # Handle template string evaluation
                if isinstance(enabled_condition, str) and '{{' in enabled_condition:
                    try:
                        # Generic evaluation for patterns like {{ section.option }}
                        match = re.search(r"\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}", enabled_condition)
                        if match:
                            config_key = match.group(1)
                            enabled = bool(self.config.get(config_key, False))
                            if not enabled:
                                continue
                    except (AttributeError, KeyError, TypeError):
                        # If template evaluation fails, default to enabled
                        pass
                elif isinstance(enabled_condition, bool) and not enabled_condition:
                    # Skip disabled items
                    continue

            # Item is enabled, add to filtered list
            filtered_items.append(item)

        return filtered_items
