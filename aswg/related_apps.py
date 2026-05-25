"""
Related applications finding algorithms and similarity calculations.
"""

import re
from typing import Dict, List, Optional, Set
from .data_processor import Application


class RelatedAppsFinder:
    """Finds related applications using various similarity metrics."""

    def __init__(self, config: Dict, licenses_data: Dict = None):
        """
        Initialize the RelatedAppsFinder.

        Args:
            config: Configuration dictionary with scoring and filtering settings
            licenses_data: Optional dictionary of license data for non-free checking
        """
        self.config = config
        self.licenses_data = licenses_data
        self._nonfree_licenses: Optional[Set[str]] = None
        self._cached_app_phrases: Optional[Dict[str, Set[str]]] = None
        self._cached_app_list_id: Optional[int] = None

    def clear_cache(self):
        """Clear the cached phrase data. Useful for testing or when app list changes."""
        self._cached_app_phrases = None
        self._cached_app_list_id = None

    def _get_nonfree_licenses(self) -> Set[str]:
        """Return cached set of non-free license identifiers."""
        if self._nonfree_licenses is None:
            if not self.licenses_data:
                self._nonfree_licenses = set()
            else:
                self._nonfree_licenses = {
                    lic_id
                    for lic_id, lic_info in self.licenses_data.items()
                    if not lic_info.get("free", True)
                }
        return self._nonfree_licenses

    def find_related_apps(
        self,
        target_app: Application,
        all_applications: List[Application],
    ) -> List[Application]:
        """Find applications related to the target app."""
        related = []
        scoring_config = self.config.get("scoring", {})
        debug = self.config.get("debug", False)

        if debug:
            print(f"\n=== Finding related apps for {target_app.name} ===")

        # Pre-compute phrases for all apps if semantic similarity is enabled
        app_phrases = None
        if scoring_config.get("semantic_similarity", {}).get("enabled", True):
            # Use cached phrases if available and the app list hasn't changed
            current_list_id = id(all_applications)
            if self._cached_app_phrases is None or self._cached_app_list_id != current_list_id:
                app_phrases = self._precompute_app_phrases(all_applications)
                self._cached_app_phrases = app_phrases
                self._cached_app_list_id = current_list_id
            else:
                app_phrases = self._cached_app_phrases

        for app in all_applications:
            if app.id == target_app.id:
                continue

            score = 0
            score_breakdown = {}

            # 1. Semantic similarity in descriptions
            if scoring_config.get("semantic_similarity", {}).get("enabled", True):
                semantic_score = self._calculate_semantic_similarity(target_app, app, app_phrases)
                score += semantic_score
                score_breakdown["semantic"] = semantic_score

            # 2. Same categories
            if scoring_config.get("categories", {}).get("enabled", True):
                common_categories = set(app.categories or []) & set(
                    target_app.categories or []
                )
                category_score = len(common_categories) * scoring_config.get(
                    "categories", {}
                ).get("points_per_match", 4)
                score += category_score
                score_breakdown["categories"] = category_score

            # 3. Alternative-to relationships
            if scoring_config.get("alternatives", {}).get("enabled", True):
                alt_score = self._calculate_alternative_similarity(
                    target_app, app, scoring_config
                )
                score += alt_score
                score_breakdown["alternatives"] = alt_score

            # 4. Fork relationships
            if scoring_config.get("forks", {}).get("enabled", True):
                fork_score = self._calculate_fork_similarity(
                    target_app, app, scoring_config
                )
                score += fork_score
                score_breakdown["forks"] = fork_score

            # 5. Similar platform support
            if scoring_config.get("platforms", {}).get("enabled", True):
                common_platforms = set(app.platforms or []) & set(
                    target_app.platforms or []
                )
                platform_score = len(common_platforms) * scoring_config.get(
                    "platforms", {}
                ).get("points_per_match", 2)
                score += platform_score
                score_breakdown["platforms"] = platform_score

            # 6. Same license type (free vs non-free)
            if scoring_config.get("license", {}).get("enabled", True):
                if app.license and target_app.license:
                    target_is_nonfree = self.is_app_nonfree(target_app)
                    app_is_nonfree = self.is_app_nonfree(app)
                    if target_is_nonfree == app_is_nonfree:
                        license_score = scoring_config.get("license", {}).get(
                            "same_type_score", 2
                        )
                        score += license_score
                        score_breakdown["license"] = license_score

            # 7. Similar popularity tier
            if scoring_config.get("popularity", {}).get("enabled", True):
                if app.stars and target_app.stars:
                    target_tier = self.get_popularity_tier(target_app.stars)
                    app_tier = self.get_popularity_tier(app.stars)
                    if target_tier == app_tier:
                        popularity_score = scoring_config.get("popularity", {}).get(
                            "same_tier_score", 1
                        )
                        score += popularity_score
                        score_breakdown["popularity"] = popularity_score

            # 8. Both have or don't have 3rd party dependencies
            if scoring_config.get("dependencies", {}).get("enabled", True):
                if app.depends_3rdparty == target_app.depends_3rdparty:
                    dep_score = scoring_config.get("dependencies", {}).get(
                        "same_status_score", 1
                    )
                    score += dep_score
                    score_breakdown["dependencies"] = dep_score

            # Only include apps that meet minimum score threshold
            min_score = self.config.get("min_score", 3)
            if score >= min_score:
                related.append((app, score, score_breakdown))

                if debug:
                    print(f"  {app.name}: {score} points - {score_breakdown}")

        # Sort by score (descending), then by tiebreakers
        tiebreakers = self.config.get("tiebreakers", ["stars", "name"])

        def sort_key(item):
            app, score, breakdown = item # pylint: disable=unused-variable
            key = [-score]  # Negative for descending order

            for tiebreaker in tiebreakers:
                if tiebreaker == "stars":
                    key.append(-(app.stars or 0))
                elif tiebreaker == "name":
                    key.append(app.name.lower())

            return tuple(key)

        related.sort(key=sort_key)

        # Return only the apps, limited by max_results
        max_results = self.config.get("max_results", 6)
        result_apps = [app for app, score, breakdown in related[:max_results]] # pylint: disable=unused-variable

        if debug:
            print(f"  -> Returning {len(result_apps)} related apps")

        return result_apps

    def _precompute_app_phrases(self, applications: List[Application]) -> Dict[str, Set[str]]:
        """Pre-compute phrase sets for all applications."""
        app_phrases = {}

        for app in applications:
            if app.description:
                app_phrases[app.id] = self._extract_significant_phrases(app.description)
            else:
                app_phrases[app.id] = set()

        return app_phrases

    def _calculate_semantic_similarity(
        self, target_app: Application, app: Application, app_phrases: Dict[str, Set[str]]
    ) -> int:
        """Calculate semantic similarity from phrase detection and pre-computed phrase sets."""
        target_phrases = app_phrases.get(target_app.id, set())
        app_phrases_set = app_phrases.get(app.id, set())

        if not target_phrases or not app_phrases_set:
            return 0

        # Find common phrases
        common_phrases = target_phrases & app_phrases_set

        if not common_phrases:
            return 0

        score = 0
        for phrase in common_phrases:
            # Calculate phrase weight based on characteristics
            phrase_weight = self._calculate_phrase_weight(phrase)
            score += phrase_weight

        return min(int(score), 25)  # Cap at max_score

    def _calculate_phrase_weight(self, phrase: str) -> float:
        """Calculate the weight of a phrase based purely on its characteristics."""
        words = phrase.split()
        word_count = len(words)

        # Base weight by word count (multi-word phrases are more significant)
        if word_count == 1:
            weight = 2.0
        elif word_count == 2:
            weight = 4.0
        elif word_count == 3:
            weight = 6.0
        else:  # 4+ words
            weight = 8.0

        # 1. Boost for compound technical terms (words with hyphens or specific patterns)
        if re.search(r"\b\w+[-_]\w+\b", phrase):
            weight *= 1.3

        # 2. Boost for capitalized words (likely proper nouns/brands/technologies)
        original_phrase = phrase  # We need the original case
        if any(word[0].isupper() for word in original_phrase.split() if len(word) > 1):
            weight *= 1.2

        # 3. Slight boost for longer individual words (more specific terms)
        avg_word_length = sum(len(word) for word in words) / len(words)
        if avg_word_length > 6:  # Longer words tend to be more specific
            weight *= 1.1

        # 4. Reduce weight for very common tech buzzwords
        # Words in here are still considered, but their weight is reduced
        common_buzzwords = [
            "server",
            "web",
            "management",
            "platform",
            "system",
            "application",
            "lightweight",
            "high-performance",
            "modern",
        ]
        if any(buzz in phrase for buzz in common_buzzwords):
            weight *= 0.9

        # 5. Boost for phrases with numbers (versions, ports, etc.)
        if re.search(r"\b\d+\b", phrase):
            weight *= 1.1

        return weight

    def _extract_significant_phrases(self, description: str) -> Set[str]:
        """Extract significant phrases from a description using automatic detection."""
        if not description:
            return set()

        # Clean and normalize text
        text = description.lower()
        # Remove common punctuation but keep hyphens in compound words
        text = re.sub(r"[^\w\s\-]", " ", text)
        # Normalize whitespace
        text = re.sub(r"\s+", " ", text).strip()

        phrases = set()
        words = text.split()

        # Extract phrases of different lengths (1-4 words)
        for length in range(1, 5):  # 1 to 4 words
            for i in range(len(words) - length + 1):
                phrase = " ".join(words[i : i + length])

                # Filter out very common/generic words for single words
                if length == 1 and self._is_generic_word(phrase):
                    continue

                # Filter out phrases that are too generic
                if self._is_significant_phrase(phrase, length):
                    phrases.add(phrase)

        return phrases

    def _is_generic_word(self, word: str) -> bool:
        """Check if a single word is too generic to be meaningful."""
        # Common words that don't indicate similarity
        # Words in here receive a weight of 0
        generic_words = {
            # Articles and prepositions
            "the",
            "a",
            "an",
            "and",
            "or",
            "but",
            "in",
            "on",
            "at",
            "to",
            "for",
            "of",
            "with",
            "by",
            "from",
            "up",
            "about",
            "into",
            "through",
            "during",
            "before",
            "after",
            "above",
            "below",
            "between",
            "among",
            "your",
            # Common verbs
            "is",
            "are",
            "was",
            "were",
            "be",
            "been",
            "have",
            "has",
            "had",
            "do",
            "does",
            "did",
            "will",
            "would",
            "could",
            "should",
            "may",
            "might",
            "must",
            "can",
            # Pronouns and determiners
            "that",
            "which",
            "who",
            "when",
            "where",
            "why",
            "how",
            "all",
            "any",
            "both",
            "each",
            "few",
            "more",
            "most",
            "other",
            "some",
            "such",
            "only",
            "own",
            "same",
            # Common adverbs and adjectives
            "so",
            "than",
            "too",
            "very",
            "just",
            "now",
            "also",
            "different",
            "small",
            "large",
            "new",
            "old",
            "good",
            "great",
            "first",
            "last",
            "long",
            "little",
            "right",
            "big",
            "high",
            "following",
            "local",
            "sure",
            # Common action words that don't indicate domain
            "using",
            "used",
            "use",
            "like",
            "way",
            "make",
            "get",
            "go",
            "know",
            "take",
            "see",
            "come",
            "think",
            "look",
            "want",
            "give",
            "without",
            "including",
            "provides",
            "allows",
            "supports",
            # Common advertisement words
            "best",
            "free",
            "powerful",
            "easy",
            "simple",
            "fast",
            "secure",
            "reliable",
            "open-source",
            "open source",
            "self-hosted",
            "self hosted",
            "community",
            "enterprise",
            "lightweight",
            "high-performance",
        }
        return word in generic_words

    def _is_significant_phrase(self, phrase: str, length: int) -> bool:
        """
        Determine if a phrase is significant enough to consider for similarity.
        """
        # Single word filtering
        if length == 1:
            return (
                len(phrase) > 3
                and not phrase.isdigit()
                and not self._is_generic_word(phrase)
            )

        # Multi-word filtering
        words = phrase.split()

        # 1. Reject phrases that are mostly generic words
        generic_word_count = sum(1 for word in words if self._is_generic_word(word))
        if generic_word_count > len(words) / 2:
            return False

        # 2. Reject phrases that start with generic connectors/articles
        # Patterns in here receive a weight of 0
        useless_patterns = [
            r"^(with|and|for|the|a|an)\s",
            r"^(is|are|can|will|has|have)\s",
            r"^(you|your|it|its|this|that)\s",
            r"^(also|using|used|like|such)\s",
        ]

        for pattern in useless_patterns:
            if re.search(pattern, phrase):
                return False

        # 3. Basic quality filter for remaining multi-word phrases
        if length > 1:
            # Reject phrases where all words are very short (likely abbreviations or noise)
            if all(len(word) <= 2 for word in words):
                return False

            # Accept all other multi-word phrases
            # The weighting system will determine their actual importance
            return True

        # Fallback (shouldn't reach here for valid input)
        return False

    def _calculate_alternative_similarity(
        self, target_app: Application, app: Application, scoring_config: Dict
    ) -> int:
        """Calculate similarity based on alternative-to relationships."""
        alt_config = scoring_config.get("alternatives", {})
        if not alt_config.get("enabled", True):
            return 0

        score = 0

        # If both apps mention being alternatives to the same software
        if (
            hasattr(target_app, "alternative_to")
            and hasattr(app, "alternative_to")
            and target_app.alternative_to
            and app.alternative_to
        ):

            target_alts = set(alt.lower().strip() for alt in target_app.alternative_to)
            app_alts = set(alt.lower().strip() for alt in app.alternative_to)

            common_alternatives = target_alts & app_alts
            points_per_match = alt_config.get("points_per_match", 6)
            score += len(common_alternatives) * points_per_match

        return score

    def _calculate_fork_similarity(
        self, target_app: Application, app: Application, scoring_config: Dict
    ) -> int:
        """Calculate similarity based on fork relationships."""
        fork_config = scoring_config.get("forks", {})
        if not fork_config.get("enabled", True):
            return 0

        score = 0

        # If both are forks of the same project
        if (
            hasattr(target_app, "fork_of")
            and hasattr(app, "fork_of")
            and target_app.fork_of
            and app.fork_of
        ):

            if target_app.fork_of.lower().strip() == app.fork_of.lower().strip():
                same_parent_score = fork_config.get("same_parent_score", 8)
                score += same_parent_score

        return score

    def is_app_nonfree(self, app: Application) -> bool:
        """Check if an application uses non-free licenses."""
        if not app.license:
            return False

        # Get non-free license identifiers from loaded license data
        if self.licenses_data:
            nonfree_licenses = self._get_nonfree_licenses()
            return any(lic in nonfree_licenses for lic in app.license)

        # Fallback to basic check if license data not available
        return any(lic in ["⊘ Proprietary"] for lic in app.license)

    def get_popularity_tier(self, stars: int) -> str:
        """Categorize applications by popularity tier based on star count."""
        if stars >= 10000:
            return "mega"  # 10k+ stars
        if stars >= 5000:
            return "highly"  # 5k-10k stars
        if stars >= 1000:
            return "popular"  # 1k-5k stars
        if stars >= 100:
            return "moderate"  # 100-1k stars
        return "emerging"  # <100 stars
