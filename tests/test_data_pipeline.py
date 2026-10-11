"""Contratos de datos, denominadores y decisiones que afectan al mapa."""

import json
import math
from pathlib import Path

import pytest
from shapely import transform
from shapely.geometry import Point, shape

from scripts.build_data import (
    ROOT,
    TO_METERS,
    boolean,
    buffer_geometry,
    build,
    classification,
    clean_text,
    match_table9,
    numeric,
    ratio,
    sha256,
)


@pytest.fixture(scope="session")
def datasets(tmp_path_factory):
    output = tmp_path_factory.mktemp("datasets")
    report = build(output=output)
    return output, report


def read(datasets, filename):
    return json.loads((datasets[0] / filename).read_text())


def test_missing_is_distinct_from_zero():
    assert numeric(float("nan")) is None
    assert numeric(0) == 0
    assert boolean(0) is False
    assert ratio(0, 1) == 0
    assert ratio(0, 0) is None
    assert classification(None) is None
    assert classification(36) == "unhealthy"
    assert classification(36.01) == "healthy"


def test_normalization_preserves_names_and_decodes_mojibake():
    assert clean_text("  Escola  Àgora  ") == "Escola Àgora"
    assert clean_text("PoblaciÃ³") == "Població"
    assert clean_text(" ") is None
    with pytest.raises(ValueError):
        boolean(2)


def test_reference_counts_reproduce_thesis(datasets):
    assert datasets[1]["counts"] == {
        "schools": 22,
        "stores": 3644,
        "geolocated_stores": 3640,
        "unlocated_stores": 4,
        "surveyed_stores": 306,
        "nutrition_observations": 153,
        "published_unhealthy": 146,
        "documented_rule_unhealthy": 147,
        "positive_peadc": 230,
        "zero_peadc": 76,
        "neighborhoods_geometry": 73,
        "neighborhoods_with_historical_context": 40,
    }


def test_primary_keys_and_foreign_keys(datasets):
    schools = read(datasets, "schools.json")
    stores = read(datasets, "stores.json")
    school_ids = {s["school_id"] for s in schools}
    store_ids = {s["store_id"] for s in stores}
    assert len(store_ids) == len(stores)
    assert len(school_ids) == len(schools)
    assert {s["school_id"] for s in stores} == school_ids
    links = read(datasets, "school_store_links.json")
    assert len(links) == len(store_ids)
    assert {s["store_id"] for s in links} == store_ids
    for filename in ("nutrition_observations.json", "promotion_observations.json"):
        observations = read(datasets, filename)
        assert len({r["store_id"] for r in observations}) == len(observations)
        assert {r["store_id"] for r in observations} <= store_ids


def test_historial_geographic_enrichment_does_not_change_sample(datasets):
    stores = {r["store_id"]: r for r in read(datasets, "stores.json")}
    assert stores[59407]["sample_excel_2021"]
    assert not stores[59407]["surveyed_2022"]
    assert stores[59407]["peadc_score"] is None
    assert stores[59752]["surveyed_2022"]
    assert not stores[59752]["sample_excel_2021"]
    assert stores[59752]["peadc_score"] == 14
    assert stores[59752]["has_geometry"]
    assert stores[1000001]["coordinate_source"] == "thesis_sample_excel"


def test_unlocated_records_remain_without_fabricated_points(datasets):
    features = read(datasets, "stores.geojson")["features"]
    missing = [f for f in features if f["geometry"] is None]
    assert {f["id"] for f in missing} == {1000002, 1000003, 1000004, 1000005}
    for f in missing:
        assert f["properties"]["longitude"] is None
        assert f["properties"]["latitude"] is None
        assert not f["properties"]["has_geometry"]


def test_geojson_uses_longitude_latitude_and_valid_geometry(datasets):
    for name in ("schools", "stores", "neighborhoods", "buffers"):
        data = read(datasets, f"{name}.geojson")
        assert data["type"] == "FeatureCollection"
        for feature in data["features"]:
            if feature["geometry"] is None:
                continue
            geometry = shape(feature["geometry"])
            assert geometry.is_valid and not geometry.is_empty
            west, south, east, north = geometry.bounds
            assert 2.0 < west <= east < 2.3
            assert 41.3 < south <= north < 41.5
            if geometry.geom_type == "Point":
                assert geometry.x == round(feature["properties"]["longitude"], 6)
                assert geometry.y == round(feature["properties"]["latitude"], 6)


def test_projected_buffer_is_400_meters():
    lon, lat = 2.1678, 41.383
    buffer = shape(buffer_geometry(lon, lat))
    center = transform(Point(lon, lat), TO_METERS, interleaved=False)
    polygon = transform(buffer, TO_METERS, interleaved=False)
    for point in polygon.exterior.coords:
        assert Point(*point).distance(center) == pytest.approx(400, abs=0.01)
    assert polygon.area == pytest.approx(math.pi * 400**2, rel=0.001)


def test_published_threshold_conflict_is_visible(datasets):
    conflicts = [r for r in read(datasets, "stores.json") if r["nems_threshold_conflict"]]
    assert len(conflicts) == 1
    assert conflicts[0]["store_id"] == 23282
    assert conflicts[0]["nems_score"] == 36
    assert conflicts[0]["nems_published_class"] == "healthy"
    assert conflicts[0]["nems_documented_rule_class"] == "unhealthy"


def test_measurements_and_denominators_reconcile_by_school(datasets):
    stores = read(datasets, "stores.json")
    schools = read(datasets, "schools.json")
    assert sum(s["assigned_stores_count"] for s in schools) == 3644
    assert sum(s["surveyed_stores_count"] for s in schools) == 306
    assert sum(s["nems_observations_count"] for s in schools) == 153
    assert sum(s["unhealthy_observed_count"] for s in schools) == 146
    assert sum(s["positive_peadc_count"] for s in schools) == 230
    for school in schools:
        selected = [
            s for s in stores
            if s["school_id"] == school["school_id"] and s["surveyed_2022"]
        ]
        mean = sum(s["peadc_score"] for s in selected) / len(selected)
        assert school["mean_peadc_score"] == pytest.approx(mean, abs=0.000001)
        if school["nems_observations_count"] == 0:
            assert school["unhealthy_observed_pct"] is None
            assert school["nearest_unhealthy_observed_route_m"] is None
        assert 0 <= school["obesity_prevalence_pct"] <= 100


def test_price_labels_are_decoded_without_claiming_uniform_units(datasets):
    prices = [
        p for record in read(datasets, "nutrition_observations.json")
        for p in record["prices"]
        if p["source_field"] == "precio_pan_int" and p["raw_numeric_value"] == 13
    ]
    assert prices
    assert all(p["decoded_value"] == 1.6 for p in prices)
    assert all(p["label_decoded"] and p["requires_unit_review"] for p in prices)


def test_nems_component_scores_reconcile(datasets):
    for observation in read(datasets, "nutrition_observations.json"):
        assert observation["nems_score"] == pytest.approx(
            observation["availability_score"] + observation["price_score"], abs=0.00001
        )
        assert 0 <= observation["nems_score"] <= 49
    for observation in read(datasets, "promotion_observations.json"):
        assert 0 <= observation["peadc_score"] <= 40


def test_neighborhood_context_does_not_leak_to_unobserved_neighborhoods(datasets):
    rows = read(datasets, "neighborhood_indicators.json")
    assert {r["neighborhood_id"] for r in rows} == set(range(1, 74))
    assert sum(r["study_assigned_stores_count"] for r in rows) == 3644
    assert sum(r["study_schools_count"] for r in rows) == 22
    for r in rows:
        if not r["has_study_context"]:
            assert r["rfd_index"] is None
            assert r["population_density_per_km2"] is None
            assert r["mean_peadc_score"] is None
        else:
            assert r["population_density_per_km2"] == pytest.approx(
                r["population"] / (r["area_ha"] / 100), rel=0.00001
            )
    stores = read(datasets, "stores.json")
    assert any(s["store_rfd_index"] != s["school_rfd_index"] for s in stores)


def test_excess_weight_reconstruction_records_type_conflicts(datasets):
    rows = read(datasets, "thesis_table9_school_links.json")
    assert len(rows) == 22
    assert len({r["school_id"] for r in rows}) == 22
    for row in rows:
        assert abs(row["mean_peadc_reported"] - row["mean_peadc_reproduced"]) < 0.02
        assert row["link_reconstructed"]
    assert {r["school_id"] for r in rows if r["school_type_conflict"]} == {
        "EG8209314", "EG8217317"
    }
    for school in read(datasets, "schools.json"):
        assert school["excess_weight_prevalence_pct"] >= school["obesity_prevalence_pct"]


def test_ambiguous_table9_match_is_rejected():
    schools = [
        {"school_id": "a", "district_id": 1, "mean_peadc_score": 12.76},
        {"school_id": "b", "district_id": 1, "mean_peadc_score": 12.761},
    ]
    with pytest.raises(ValueError, match="ambiguo"):
        match_table9(schools, [{"district_id": 1, "mean_peadc_reported": 12.76, "table_row": 1}])


def test_bundle_and_sources_are_serializable_and_traceable(datasets):
    content = (datasets[0] / "bundle.js").read_text()
    assert content.startswith("window.CATAMAP = ")
    data = json.loads(content.removeprefix("window.CATAMAP = ").removesuffix(";\n"))
    assert data["meta"]["counts"] == datasets[1]["counts"]
    assert len(data["layers"]["stores"]["features"]) == 3644
    for filename, info in data["meta"]["local_sources"].items():
        assert info["sha256"] == sha256(ROOT / "docs/datasets-raw" / filename)
    assert not {r["school_id"] for r in read(datasets, "schools.json")} & {None, ""}


def test_build_is_deterministic(datasets, tmp_path):
    build(output=tmp_path)
    first = datasets[0]
    assert {p.name for p in first.iterdir()} == {p.name for p in tmp_path.iterdir()}
    for path in first.iterdir():
        assert sha256(path) == sha256(Path(tmp_path) / path.name)
