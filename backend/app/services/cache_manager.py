"""
Redis Cache Manager - For fast caching of frequently accessed data
"""

import os
import json
import logging
from typing import Optional, Any, Dict, List
from datetime import datetime, timedelta
from app.core.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()
REDIS_URL = settings.get_effective_redis_url()
USE_REDIS = bool(REDIS_URL)

if USE_REDIS:
    import redis

    logger.info("Redis caching enabled")
else:
    logger.info("Redis not configured - using in-memory fallback")


class CacheManager:
    """Manages caching with Redis (production) or in-memory dict (fallback)."""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(CacheManager, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return

        self._initialized = True
        self._memory_cache = {}  # Fallback for local dev
        self._redis = None

        if USE_REDIS:
            try:
                self._redis = redis.from_url(REDIS_URL, decode_responses=True)
                logger.info(f"Connected to Redis")
            except Exception as e:
                logger.error(f"Failed to connect to Redis: {e}")
                self._redis = None

    def _get_ttl(self, default_ttl: int = None) -> int:
        """Get TTL in seconds."""
        if default_ttl:
            return default_ttl
        return int(os.getenv("REDIS_TTL", "86400"))  # Default 24 hours

    def get(self, key: str) -> Optional[Any]:
        """Get value from cache."""
        try:
            if self._redis:
                data = self._redis.get(key)
                if data:
                    return json.loads(data)
                return None
            else:
                # In-memory fallback
                if key in self._memory_cache:
                    value, expiry = self._memory_cache[key]
                    if datetime.now() < expiry:
                        return value
                    else:
                        del self._memory_cache[key]
                return None
        except Exception as e:
            logger.error(f"Error getting cache key {key}: {e}")
            return None

    def set(self, key: str, value: Any, ttl: int = None) -> bool:
        """Set value in cache."""
        try:
            ttl = self._get_ttl(ttl)

            if self._redis:
                self._redis.setex(key, ttl, json.dumps(value))
                return True
            else:
                # In-memory fallback
                expiry = datetime.now() + timedelta(seconds=ttl)
                self._memory_cache[key] = (value, expiry)
                return True
        except Exception as e:
            logger.error(f"Error setting cache key {key}: {e}")
            return False

    def delete(self, key: str) -> bool:
        """Delete value from cache."""
        try:
            if self._redis:
                self._redis.delete(key)
                return True
            else:
                if key in self._memory_cache:
                    del self._memory_cache[key]
                return True
        except Exception as e:
            logger.error(f"Error deleting cache key {key}: {e}")
            return False

    def clear_pattern(self, pattern: str) -> bool:
        """Clear all keys matching pattern."""
        try:
            if self._redis:
                keys = self._redis.keys(pattern)
                if keys:
                    self._redis.delete(*keys)
                return True
            else:
                # In-memory: delete keys containing pattern
                keys_to_delete = [k for k in self._memory_cache.keys() if pattern in k]
                for k in keys_to_delete:
                    del self._memory_cache[k]
                return True
        except Exception as e:
            logger.error(f"Error clearing cache pattern {pattern}: {e}")
            return False

    # Specific caching methods for HeatGuard AI

    def get_rankings(self, date_str: str) -> Optional[List[Dict]]:
        """Get cached rankings for a date."""
        return self.get(f"rankings:{date_str}")

    def set_rankings(
        self, date_str: str, rankings: List[Dict], ttl: int = None
    ) -> bool:
        """Cache rankings for a date."""
        return self.set(f"rankings:{date_str}", rankings, ttl)

    def get_mortality_risk(self, district_name: str) -> Optional[Dict]:
        """Get cached mortality risk for a district."""
        return self.get(f"mortality:{district_name}")

    def set_mortality_risk(
        self, district_name: str, data: Dict, ttl: int = None
    ) -> bool:
        """Cache mortality risk for a district."""
        return self.set(f"mortality:{district_name}", data, ttl)

    def get_district_history(self, district_name: str) -> Optional[List[Dict]]:
        """Get cached district history."""
        return self.get(f"history:{district_name}")

    def set_district_history(
        self, district_name: str, history: List[Dict], ttl: int = None
    ) -> bool:
        """Cache district history."""
        return self.set(f"history:{district_name}", history, ttl)

    def invalidate_date(self, date_str: str) -> bool:
        """Invalidate all cache for a specific date."""
        return self.clear_pattern(f"*:{date_str}")


# Global instance
cache_manager = CacheManager()
