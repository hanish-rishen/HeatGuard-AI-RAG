"""
NFHS Mortality Service - Loads NFHS-5 disease indicators and computes mortality risk uplift.
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional

from app.core.config import get_backend_dir

logger = logging.getLogger(__name__)

# Lazy import for pandas
pd = None


def _get_pandas():
    global pd
    if pd is None:
        import pandas as _pd

        pd = _pd
    return pd


class NFHSMortalityService:
    _instance: Optional["NFHSMortalityService"] = None
    _initialized: bool = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if NFHSMortalityService._initialized:
            return
        self.district_metrics: Dict[str, Dict[str, float]] = {}
        self.district_metrics_lower: Dict[str, str] = {}
        self.district_state: Dict[str, str] = {}
        self.district_state_lower: Dict[str, str] = {}
        self.indicator_stats: Dict[str, Dict[str, Optional[float]]] = {}
        self._data_loaded = False
        NFHSMortalityService._initialized = True

    def _ensure_loaded(self):
        """Lazy load data on first use."""
        if not self._data_loaded:
            self._load_nfhs_data()
            self._data_loaded = True

    def _load_nfhs_data(self) -> None:
        try:
            backend_dir = get_backend_dir()
            csv_path = backend_dir.parent / "data" / "NFHS-5-Districts.csv"

            if not csv_path.exists():
                logger.error(f"NFHS dataset not found at {csv_path}")
                return

            pandas = _get_pandas()
            df = pandas.read_csv(csv_path)

            indicator_map = {
                "overweight_children_pct": "77. Children under 5 years who are overweight (weight-for-height)20 (%)",
                "overweight_women_pct": "79. Women who are overweight or obese (BMI ≥25.0 kg/m2)21 (%)",
                "blood_sugar_high_female_pct": "86. Blood sugar level - high (141-160 mg/dl)23 (%)",
                "blood_sugar_very_high_female_pct": "87. Blood sugar level - very high (>160 mg/dl)23 (%)",
                "blood_sugar_high_or_meds_female_pct": "88. Blood sugar level - high or very high (>140 mg/dl) or taking medicine to control blood sugar level23 (%)",
                "blood_sugar_high_male_pct": "89. Blood sugar level - high (141-160 mg/dl)23 (%)",
                "blood_sugar_very_high_male_pct": "90. Blood sugar level - very high (>160 mg/dl)23 (%)",
                "blood_sugar_high_or_meds_male_pct": "91. Blood sugar level - high or very high (>140 mg/dl) or taking medicine to control blood sugar level23 (%)",
                "bp_mild_female_pct": "92. Mildly elevated blood pressure (Systolic 140-159 mm of Hg and/or Diastolic 90-99 mm of Hg) (%)",
                "bp_severe_female_pct": "93. Moderately or severely elevated blood pressure (Systolic ≥160mm of Hg and/or Diastolic ≥100mm of Hg) (%)",
                "bp_elevated_or_meds_female_pct": "94. Elevated blood pressure (Systolic ≥140 mm of Hg and/or Diastolic ≥90 mm of Hg) or taking medicine to control blood pressure (%)",
                "bp_mild_male_pct": "95. Mildly elevated blood pressure (Systolic 140-159 mm of Hg and/or Diastolic 90-99 mm of Hg) (%)",
                "bp_severe_male_pct": "96. Moderately or severely elevated blood pressure (Systolic ≥160mm of Hg and/or Diastolic ≥100mm of Hg) (%)",
                "bp_elevated_or_meds_male_pct": "97. Elevated blood pressure (Systolic ≥140 mm of Hg and/or Diastolic ≥90 mm of Hg) or taking medicine to control blood pressure (%)",
            }

            state_map = self._load_state_mapping(backend_dir)

            df = df[df["Indicator"].isin(indicator_map.values())].copy()
            if df.empty:
                logger.warning("NFHS dataset did not contain expected indicators")
                return

            df["NFHS-5"] = pandas.to_numeric(df["NFHS-5"], errors="coerce")
            pivot = df.pivot_table(
                index="District",
                columns="Indicator",
                values="NFHS-5",
                aggfunc="first",
            )

            metrics: Dict[str, Dict[str, float]] = {}
            indicator_values: Dict[str, List[float]] = {
                key: [] for key in indicator_map.keys()
            }

            for district, row in pivot.iterrows():
                name = str(district).strip()
                if not name:
                    continue

                district_metrics: Dict[str, float] = {}
                has_value = False
                for key, indicator in indicator_map.items():
                    val = row.get(indicator)
                    if pandas.notna(val):
                        val_f = float(val)
                        district_metrics[key] = val_f
                        indicator_values[key].append(val_f)
                        has_value = True
                    else:
                        district_metrics[key] = None

                if has_value:
                    metrics[name] = district_metrics

            self.indicator_stats = {
                key: {
                    "min": min(values) if values else None,
                    "max": max(values) if values else None,
                }
                for key, values in indicator_values.items()
            }
            self.district_metrics = metrics
            self.district_metrics_lower = {k.casefold(): k for k in metrics.keys()}
            self.district_state = state_map
            self.district_state_lower = {k.casefold(): v for k, v in state_map.items()}

            logger.info(
                f"Loaded NFHS indicators for {len(self.district_metrics)} districts"
            )
        except Exception as e:
            logger.error(f"Failed to load NFHS data: {e}")

    def _normalize(
        self, value: Optional[float], min_val: Optional[float], max_val: Optional[float]
    ) -> float:
        if value is None or min_val is None or max_val is None:
            return 0.0
        if max_val <= min_val:
            return 0.0
        return float((value - min_val) / (max_val - min_val))

    def get_state_for_district(
        self, district_name: str, lat: Optional[float], lon: Optional[float]
    ) -> Optional[str]:
        self._ensure_loaded()
        if not district_name:
            return None
        direct = self.district_state.get(district_name)
        if direct:
            return direct
        direct = self.district_state.get(str(district_name).strip())
        if direct:
            return direct
        direct = self.district_state_lower.get(str(district_name).casefold())
        if direct:
            return direct
        return None

    def _normalize_district(self, name: str) -> str:
        if not name:
            return ""
        normalized = name.strip()
        if "(" in normalized and normalized.endswith(")"):
            normalized = normalized.split("(", 1)[0].strip()
        normalized = normalized.replace("-", " ")
        normalized = " ".join(normalized.split())
        normalized = normalized.replace(" & ", " and ").replace("&", "and")
        return normalized.casefold()

    def _load_state_mapping(self, backend_dir) -> Dict[str, str]:
        mapping_path = backend_dir.parent / "data" / "india_2011_district.csv"
        if not mapping_path.exists():
            return {}
        try:
            pandas = _get_pandas()
            df = pandas.read_csv(mapping_path)
        except Exception:
            return {}

        df = df[["district", "st_nm"]].dropna().copy()
        df["district"] = df["district"].astype(str).str.strip()
        df["st_nm"] = df["st_nm"].astype(str).str.strip()
        mapping = dict(df.drop_duplicates(subset=["district"]).values.tolist())
        normalized = {self._normalize_district(k): v for k, v in mapping.items()}

        aliases = {
            "ahmadabad": "ahmedabad",
            "ahmadnagar": "ahmednagar",
            "haora": "howrah",
            "barddhaman": "burdwan",
            "puruliya": "purulia",
            "pashchim medinipur": "paschim medinipur",
            "purba medinipur": "purba medinipur",
            "pashchim champaran": "paschim champaran",
            "purba champaran": "purba champaran",
            "dima hasao": "north cachar hills",
        }
        for alias, target in aliases.items():
            if target in normalized:
                normalized[alias] = normalized[target]

        telangana_districts = {
            "adilabad",
            "bhadradri kothagudem",
            "hanumakonda",
            "hyderabad",
            "jagtial",
            "jangaon",
            "jayashankar bhupalpally",
            "jogulamba gadwal",
            "kamareddy",
            "karimnagar",
            "khammam",
            "kumuram bheem",
            "komaram bheem",
            "mahabubabad",
            "mahabubnagar",
            "mancherial",
            "medak",
            "medchal malkajgiri",
            "mulugu",
            "nagarkurnool",
            "nalgonda",
            "narayanpet",
            "nirmal",
            "nizamabad",
            "peddapalli",
            "rajanna sircilla",
            "rangareddy",
            "sangareddy",
            "siddipet",
            "suryapet",
            "vikarabad",
            "wanaparthy",
            "warangal",
            "yadadri bhuvanagiri",
            "yadadri bhongir",
        }

        final_map: Dict[str, str] = {}
        for district, state in mapping.items():
            normalized_name = self._normalize_district(district)
            mapped_state = normalized.get(normalized_name, state)
            if normalized_name in telangana_districts:
                mapped_state = "Telangana"
            final_map[district] = mapped_state
        return final_map

    def _build_reason(
        self, metrics: Dict[str, Optional[float]], normalized: Dict[str, float]
    ) -> Optional[str]:
        label_map = {
            "overweight_children_pct": "children overweight",
            "overweight_women_pct": "women overweight/obese",
            "blood_sugar_high_or_meds_female_pct": "women with high blood sugar",
            "blood_sugar_high_or_meds_male_pct": "men with high blood sugar",
            "bp_elevated_or_meds_female_pct": "women with elevated blood pressure",
            "bp_elevated_or_meds_male_pct": "men with elevated blood pressure",
            "blood_sugar_high_female_pct": "women with high blood sugar (141-160)",
            "blood_sugar_very_high_female_pct": "women with very high blood sugar",
            "blood_sugar_high_male_pct": "men with high blood sugar (141-160)",
            "blood_sugar_very_high_male_pct": "men with very high blood sugar",
            "bp_mild_female_pct": "women with mildly elevated blood pressure",
            "bp_severe_female_pct": "women with severe blood pressure",
            "bp_mild_male_pct": "men with mildly elevated blood pressure",
            "bp_severe_male_pct": "men with severe blood pressure",
        }

        preferred_keys = [
            "blood_sugar_high_or_meds_female_pct",
            "blood_sugar_high_or_meds_male_pct",
            "bp_elevated_or_meds_female_pct",
            "bp_elevated_or_meds_male_pct",
            "overweight_women_pct",
            "overweight_children_pct",
        ]

        candidates = []
        for key in preferred_keys:
            value = metrics.get(key)
            if value is None:
                continue
            candidates.append((normalized.get(key, 0.0), key, value))

        if not candidates:
            for key, value in metrics.items():
                if value is None:
                    continue
                candidates.append((normalized.get(key, 0.0), key, value))

        if not candidates:
            return None

        candidates.sort(key=lambda x: x[0], reverse=True)
        top = candidates[:2]
        parts = []
        for _, key, value in top:
            label = label_map.get(key, key.replace("_", " "))
            parts.append(f"{label} {value:.1f}%")

        return f"Risk factors: {', '.join(parts)}."

    def get_mortality_risk(
        self, district_name: str, heat_risk: Optional[float]
    ) -> Optional[Dict[str, float]]:
        self._ensure_loaded()
        if heat_risk is None:
            return None
        metrics = self.district_metrics.get(district_name)
        if not metrics:
            metrics = self.district_metrics.get(str(district_name).strip())
        if not metrics:
            match = self.district_metrics_lower.get(str(district_name).casefold())
            if match:
                metrics = self.district_metrics.get(match)
        if not metrics:
            return None

        normalized: Dict[str, float] = {}
        values: List[float] = []
        for key, value in metrics.items():
            if value is None:
                continue
            stats = self.indicator_stats.get(key) or {}
            norm = self._normalize(value, stats.get("min"), stats.get("max"))
            normalized[key] = norm
            values.append(norm)

        if not values:
            return None

        disease_index = float(sum(values) / len(values))
        mortality_risk_score = min(1.0, float(heat_risk) * (1 + disease_index * 0.5))
        reason = self._build_reason(metrics, normalized)

        return {
            "mortality_risk_score": float(mortality_risk_score),
            "mortality_risk_reason": reason,
            "mortality_disease_index": float(disease_index),
        }

    def attach_mortality_risk(self, results: List[Dict[str, float]]) -> None:
        available = []
        missing = []
        for item in results:
            district_name = item.get("district_name")
            heat_risk = item.get("risk_score")
            if not district_name or heat_risk is None:
                continue
            lat = item.get("lat")
            lon = item.get("lon")
            state = self.get_state_for_district(str(district_name), lat, lon)
            if state:
                item["state"] = state
            mortality = self.get_mortality_risk(str(district_name), float(heat_risk))
            if mortality:
                item.update(mortality)
                if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
                    available.append(
                        {
                            "lat": float(lat),
                            "lon": float(lon),
                            "mortality_risk_score": mortality["mortality_risk_score"],
                            "mortality_disease_index": mortality[
                                "mortality_disease_index"
                            ],
                        }
                    )
            else:
                missing.append(item)

        if not available:
            return

        avg_score = sum(d["mortality_risk_score"] for d in available) / len(available)
        avg_index = sum(d["mortality_disease_index"] for d in available) / len(
            available
        )

        def distance(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
            return (a_lat - b_lat) ** 2 + (a_lon - b_lon) ** 2

        for item in missing:
            lat = item.get("lat")
            lon = item.get("lon")
            if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
                neighbors = sorted(
                    available,
                    key=lambda d: distance(float(lat), float(lon), d["lat"], d["lon"]),
                )[:5]
                if neighbors:
                    item["mortality_risk_score"] = sum(
                        d["mortality_risk_score"] for d in neighbors
                    ) / len(neighbors)
                    item["mortality_disease_index"] = sum(
                        d["mortality_disease_index"] for d in neighbors
                    ) / len(neighbors)
                    item["mortality_risk_reason"] = (
                        "Risk factors: averaged from nearby districts."
                    )
                    continue

            item["mortality_risk_score"] = avg_score
            item["mortality_disease_index"] = avg_index
            item["mortality_risk_reason"] = (
                "Risk factors: averaged from available districts."
            )


nfhs_service = NFHSMortalityService()
