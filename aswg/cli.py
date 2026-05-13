"""
Awesome Self-Hosted Website Generator

Command-line interface for generating a static website from awesome-selfhosted data.
"""

import argparse
import json
import os
import platform
import shutil
import sys
import time
import traceback
from dataclasses import asdict
from datetime import datetime
from pathlib import Path

from .config import Config
from .data_processor import DataProcessor, Application
from .site_generator import SiteGenerator
from .utils import format_bytes, get_directory_size, print_build_stats


def create_parser():
    """Create the argument parser."""
    root_parser = argparse.ArgumentParser(add_help=False)
    root_parser.add_argument('--config', '-c', default='config/config.yml', help='Configuration file path (default: config/config.yml)')
    root_parser.add_argument('--verbose', '-v', action='store_true', help='Enable verbose output')

    # Keep subcommand defaults suppressed so root options provided before the command are preserved.
    subcommand_parser = argparse.ArgumentParser(add_help=False)
    subcommand_parser.add_argument('--config', '-c', default=argparse.SUPPRESS, help='Configuration file path (default: config/config.yml)')
    subcommand_parser.add_argument('--verbose', '-v', action='store_true', default=argparse.SUPPRESS, help='Enable verbose output')

    parser = argparse.ArgumentParser(
        description='Awesome Self-Hosted Website Generator - Generate a beautiful static website from the awesome-selfhosted dataset.',
        parents=[root_parser],
    )

    subparsers = parser.add_subparsers(dest='command', help='Available commands')

    # Fetch command
    subparsers.add_parser('fetch', help='Fetch and process awesome-selfhosted data', parents=[subcommand_parser])

    # Build command
    build_parser = subparsers.add_parser('build', help='Build the complete static website', parents=[subcommand_parser])
    build_parser.add_argument('--fetch-first', action='store_true', help='Fetch fresh data before building')

    # Watch command
    watch_parser = subparsers.add_parser(
        'watch', help='Watch for changes and rebuild automatically', parents=[subcommand_parser]
    )
    watch_parser.add_argument('--interval', '-i', type=int, default=5, help='Watch interval in seconds (default: 5)')

    # Clean command
    subparsers.add_parser('clean', help='Clean output and cache directories', parents=[subcommand_parser])

    # Info command
    subparsers.add_parser('info', help='Show configuration and system information', parents=[subcommand_parser])

    return parser


def load_config(config_path, verbose=False):
    """Load configuration and handle errors."""
    try:
        config = Config(config_path)
        if verbose:
            print(f"Using configuration: {config_path}")
        return config
    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


def cmd_fetch(config, verbose=False):
    """Fetch and process awesome-selfhosted data."""
    print("  Fetching awesome-selfhosted data...")

    try:
        processor = DataProcessor(config)

        # Fetch raw data
        print("  Fetching data files...")
        raw_data = processor.fetch_awesome_data()

        # Process applications
        print("Processing application data...")
        applications = processor.process_applications(raw_data['apps'], raw_data.get('git_data', {}))

        print(f"  Processed {len(applications)} applications")

        # Generate additional data structures
        categories = processor.create_category_hierarchy(applications, raw_data['categories'])
        statistics = processor.generate_statistics(applications, categories)

        print(f"  Statistics: {statistics['total_apps']} apps, {statistics['categories_count']} categories")

        # Cache processed data
        cache_file = config.data_cache_dir / 'processed_data.json'

        # Ensure cache directory exists
        config.data_cache_dir.mkdir(parents=True, exist_ok=True)

        processed_data = {
            'applications': [asdict(app) for app in applications],
            'categories': categories,

            'licenses': raw_data['licenses'],
            'statistics': statistics,
            'markdown': raw_data.get('markdown', {}),
            'processed_at': time.strftime('%Y-%m-%d %H:%M:%S')
        }

        with open(cache_file, 'w', encoding='utf-8') as f:
            json.dump(processed_data, f, indent=2, ensure_ascii=False)

        print(f"Cached processed data to {cache_file}")

    except (OSError, TypeError, ValueError) as e:
        print(f"Error fetching data: {e}", file=sys.stderr)
        if verbose:
            traceback.print_exc()
        sys.exit(1)


def cmd_build(config, fetch_first=False, verbose=False):
    """Build the complete static website."""
    print("Building awesome-selfhosted website...")

    try:
        # Fetch data if requested
        if fetch_first:
            cmd_fetch(config, verbose)

        # Load processed data
        cache_file = config.data_cache_dir / 'processed_data.json'

        if not cache_file.exists():
            print("No cached data found. Running fetch first...")
            cmd_fetch(config, verbose)

        # Load the data
        with open(cache_file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        # Convert back to Application objects
        applications = [Application(**app_data) for app_data in data['applications']]
        categories = data['categories']
        statistics = data['statistics']
        markdown_data = data.get('markdown', {})

        print(f"  Loaded {len(applications)} applications from cache")

        # Generate the site
        generator = SiteGenerator(config)
        base_path = config.get('site.base_path', '').rstrip('/')
        if base_path:
            print(f"Base path configured: {base_path}")
            site_url = config.get('site.url', '')
            print(f"   Website will be deployed at: {site_url}{base_path}")
        else:
            print("Building for root deployment (/)")

        generator.generate_site(applications, categories, statistics, data.get('licenses', {}), markdown_data)

        # Print build statistics
        print_build_stats(config.output_dir)

        print("Website generated successfully!")

    except (OSError, json.JSONDecodeError, TypeError, KeyError, ValueError) as e:
        print(f"Error building site: {e}", file=sys.stderr)
        if verbose:
            traceback.print_exc()
        sys.exit(1)


def cmd_watch(config, interval=5, verbose=False):
    """Watch for changes and rebuild automatically."""
    print(f"Watching for changes (checking every {interval}s)...")
    print("Press Ctrl+C to stop")

    # Get initial modification times
    watch_files = [
        config.config_path,
        config.template_dir,
        config.static_dir,
    ]

    def get_modification_times():
        times = {}
        for path in watch_files:
            if path.exists():
                if path.is_file():
                    times[str(path)] = path.stat().st_mtime
                else:
                    # Directory - check all files
                    for file_path in path.rglob('*'):
                        if file_path.is_file():
                            times[str(file_path)] = file_path.stat().st_mtime
        return times

    last_times = get_modification_times()

    try:
        while True:
            time.sleep(interval)
            current_times = get_modification_times()

            # Check for changes
            changed_files = []
            for file_path, mod_time in current_times.items():
                if file_path not in last_times or last_times[file_path] != mod_time:
                    changed_files.append(file_path)

            if changed_files:
                print(f"\nChanges detected in {len(changed_files)} files")
                for file_path in changed_files[:3]:  # Show first 3
                    print(f"   • {Path(file_path).name}")
                if len(changed_files) > 3:
                    print(f"   • ... and {len(changed_files) - 3} more")

                # Rebuild the site
                cmd_build(config, verbose=verbose)
                last_times = current_times
                print("Rebuild complete. Watching for more changes...")

    except KeyboardInterrupt:
        print("\nWatch stopped")


def cmd_clean(config):
    """Clean output and cache directories."""
    print("Cleaning directories...")

    # Clean output directory
    if config.output_dir.exists():
        shutil.rmtree(config.output_dir)
        print(f"   - Removed {config.output_dir}")

    # Clean cache directory
    if config.data_cache_dir.exists():
        shutil.rmtree(config.data_cache_dir)
        print(f"   - Removed {config.data_cache_dir}")

    print("Cleanup complete")


def cmd_info(config):  # pylint: disable=too-many-locals,too-many-statements
    """Show comprehensive configuration and system information."""
    data_config = config.get_data_config()
    generation_config = config.get_generation_config()

    # Version and environment
    print("Version and environment:")
    print(f"   Python version: {sys.version.split()[0]}")
    print(f"   Platform: {platform.platform()}")
    print(f"   Architecture: {platform.architecture()[0]}")
    print(f"   Working directory: {os.getcwd()}")
    print(f"   Config file: {config.config_path}")

    # Site configuration
    site_config = config.get_site_config()
    print("\nSite configuration:")
    print(f"   Title: {site_config.get('title', 'N/A')}")
    print(f"   Description: {site_config.get('description', 'N/A')}")
    print(f"   URL: {site_config.get('url', 'N/A')}")
    print(f"   Author: {site_config.get('author', 'N/A')}")
    print(f"   Base path: {site_config.get('base_path', 'N/A')}")

    # Data source
    data_dir = Path(data_config.get('data_dir', 'awesome-selfhosted-data'))
    print("\nData source:")
    print(f"   Source directory: {data_dir}")
    if data_dir.exists():
        print("   Status: Available")
        software_dir = data_dir / data_config.get('software_dir', 'software')
        categories_dir = data_dir / data_config.get('categories_dir', 'tags')
        platforms_dir = data_dir / data_config.get('platforms_dir', 'platforms')
        sw_count = len(list(software_dir.glob('*.yml'))) if software_dir.exists() else 0
        cat_count = len(list(categories_dir.glob('*.yml'))) if categories_dir.exists() else 0
        plat_count = len(list(platforms_dir.glob('*.yml'))) if platforms_dir.exists() else 0
        print(f"   Software files: {sw_count}")
        print(f"   Category files: {cat_count}")
        print(f"   Platforms files: {plat_count}")
    else:
        print("   Status: Not found")
        print("   Run 'aswg fetch' to download data")

    print("\nData configuration:")
    print(f"   Awesome data directory: {data_config.get('data_dir', 'awesome-selfhosted-data')}")
    print(f"   Software directory: {data_config.get('software_dir', 'software')}")
    print(f"   Categories directory: {data_config.get('categories_dir', 'tags')}")
    print(f"   Platforms directory: {data_config.get('platforms_dir', 'platforms')}")
    print(f"   Licenses file: {data_config.get('licenses_file', 'licenses.yml')}")
    nonfree_file = data_config.get('licenses_nonfree_file')
    print(f"   Licenses nonfree file: {nonfree_file if nonfree_file else '(not configured)'}")
    print(f"   Use git data: {generation_config.get('use_git_data', True)}")

    # Cached data
    cache_file = config.data_cache_dir / 'processed_data.json'
    if cache_file.exists():
        try:
            with open(cache_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            stat = cache_file.stat()
            file_size = format_bytes(stat.st_size)
            modified_time = datetime.fromtimestamp(stat.st_mtime).strftime('%Y-%m-%d %H:%M:%S')
            print("\nCached data:")
            print(f"   File: {cache_file}")
            print(f"   File size: {file_size}")
            print(f"   Last modified: {modified_time}")
            print(f"   Processed at: {data.get('processed_at', 'Unknown')}")
            print(f"   Applications: {len(data.get('applications', []))}")
            print(f"   Categories: {len(data.get('categories', {}))}")
            print(f"   Licenses: {len(data.get('licenses', {}))}")
            stats = data.get('statistics', {})
            if stats:
                print(f"   Total apps: {stats.get('total_apps', 0)}")
                print(f"   Categories count: {stats.get('categories_count', 0)}")
                print(f"   Platforms count: {stats.get('total_platforms', 0)}")
                print(f"   Licenses count: {stats.get('total_licenses', 0)}")
        except (OSError, json.JSONDecodeError, KeyError, TypeError) as e:
            print(f"\nCached data: Corrupted ({str(e)})")
    else:
        print("\nCached data: Not found")

    # Build paths and directory status
    build_config = config.get_build_config()
    print("\nBuild configuration:")
    print(f"   Output directory: {build_config.get('output_dir', 'output')}")
    print(f"   Template directory: {build_config.get('template_dir', 'templates')}")
    print(f"   Static directory: {build_config.get('static_dir', 'static')}")
    print(f"   Data cache directory: {build_config.get('data_cache_dir', 'data')}")

    print("\nDirectory status:")
    directories = [
        ('Templates', config.template_dir),
        ('Static files', config.static_dir),
        ('Output', config.output_dir),
        ('Data cache', config.data_cache_dir),
    ]
    for name, path in directories:
        if path.exists():
            size = get_directory_size(path)
            file_count = len(list(path.rglob('*'))) if path.is_dir() else 1
            print(f"   {name}: Exists ({format_bytes(size)}, {file_count} items)")
        else:
            print(f"   {name}: Missing ({path})")

    # Generation options and search
    alternatives_config = config.get_alternatives_config()
    print("\nGeneration options:")
    print(f"   Enable pagination: {generation_config.get('enable_pagination', True)}")
    if generation_config.get('enable_pagination', True):
        print(f"   Items per page: {generation_config.get('items_per_page', 60)}")
        print(f"   Let user choose pagination size: {generation_config.get('let_user_choose_pagination_size', False)}")
    print(f"   Enable search index: {generation_config.get('enable_search_index', True)}")
    print(f"   Enable alternatives: {alternatives_config.get('enabled', False)}")
    print(f"   Generate sitemap: {generation_config.get('generate_sitemap', True)}")
    print(f"   Minify HTML: {generation_config.get('minify_html', False)}")

    search_config = config.get_search_config()
    print("\nSearch configuration:")
    print(f"   Fuzzy threshold: {search_config.get('fuzzy_threshold', 0.3)}")
    print(f"   Max results: {search_config.get('max_results', 8)}")
    print(f"   Min query length: {search_config.get('min_query_length', 3)}")
    print(f"   Search fields: {', '.join(search_config.get('search_fields', []))}")

    # Links, robots, htaccess, build statistics
    links_config = config.get('links', {})
    print("\nLinks configuration:")
    print(f"   Open internal links in new tab: {links_config.get('open_in_new_tab_for_internal_links', False)}")
    print(f"   Open external links in new tab: {links_config.get('open_in_new_tab_for_external_links', False)}")

    robots_config = config.get('robots', {})
    print("\nRobots configuration:")
    print(f"   Generate robots.txt: {robots_config.get('generate', True)}")
    print(f"   User agent: {robots_config.get('user_agent', '*')}")
    print(f"   Sitemap URL: {robots_config.get('sitemap_url', '/sitemap.xml')}")

    htaccess_config = config.get('htaccess', {})
    print("\nHtaccess configuration:")
    print(f"   Generate .htaccess: {htaccess_config.get('generate', False)}")
    print(f"   Remove HTML extension: {htaccess_config.get('remove_html_extension', True)}")

    if config.output_dir.exists():
        print_build_stats(config.output_dir)

def main():
    """Main entry point."""
    parser = create_parser()
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    # Load configuration
    config = load_config(args.config, args.verbose)

    # Execute command
    if args.command == 'fetch':
        cmd_fetch(config, args.verbose)

    elif args.command == 'build':
        cmd_build(config, args.fetch_first, args.verbose)

    elif args.command == 'watch':
        cmd_watch(config, args.interval, args.verbose)

    elif args.command == 'clean':
        cmd_clean(config)

    elif args.command == 'info':
        cmd_info(config)
