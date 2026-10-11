#!/usr/bin/env python3
"""Prepara datasets históricos para Leaflet sin red ni modificación de los originales."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import unicodedata
import warnings
from pathlib import Path

import pandas as pd
from pyproj import Transformer
from shapely import make_valid, transform, union_all
from shapely.geometry import Point, mapping, shape
from shapely.validation import explain_validity

ROOT = Path(__file__).resolve().parents[1]
THESIS_BASE = "bbdd_Alimentacion_BCN_Gemma_Catalina_131222.dta"
EARLIER_BASE = "bbdd_Alimentacion_BCN_040521_nems_censo.dta"
SAMPLE = "establiments_muestreo_306.xlsx"
PDF = "Tesis_Doctoral_Catalina_Londoño_Cañola.pdf"
TO_METERS = Transformer.from_crs(4326, 25831, always_xy=True).transform
TO_WGS84 = Transformer.from_crs(25831, 4326, always_xy=True).transform
GEOCODE_SCHOOL_COURSE = "2019/2020"
DATA_SCHEMA_VERSION = "1.0.0"


def clean_text(value):
    """Conserva acentos correctos, corrige mojibake reversible y normaliza espacios."""
    if value is None or pd.isna(value):
        return None
    text = str(value)
    if "Ã" in text or "Â" in text:
        try:
            text = text.encode("latin1").decode("utf8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
    text = unicodedata.normalize("NFC", re.sub(r"\s+", " ", text).strip())
    return text or None


def numeric(value):
    if value is None or pd.isna(value):
        return None
    try:
        number = float(str(value).replace(",", "."))
    except ValueError as exc:
        raise ValueError(f"Valor no numérico: {value!r}") from exc
    if not math.isfinite(number):
        return None
    return int(number) if number.is_integer() else round(number, 6)


def boolean(value):
    number = numeric(value)
    if number is None:
        return None
    if number not in (0, 1):
        raise ValueError(f"Código binario inesperado: {number}")
    return bool(number)


def classification(score):
    """Regla escrita en la tesis; se conserva aparte de la clasificación publicada."""
    return None if score is None else ("unhealthy" if score <= 36 else "healthy")


def ratio(numerator, denominator):
    return None if denominator == 0 else round(100 * numerator / denominator, 6)


def average(values):
    present = [v for v in values if v is not None]
    return None if not present else round(sum(present) / len(present), 6)


def feature(identifier, properties, geometry):
    return {"type": "Feature", "id": identifier, "geometry": geometry, "properties": properties}


def collection(features):
    return {"type": "FeatureCollection", "features": features}


def point_geometry(lon, lat):
    if lon is None or lat is None:
        return None
    if not (2.0 < lon < 2.3 and 41.3 < lat < 41.5):
        raise ValueError(f"Coordenadas fuera de Barcelona: {lon}, {lat}")
    return {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]}


def buffer_geometry(lon, lat):
    point = transform(Point(lon, lat), TO_METERS, interleaved=False)
    polygon = transform(point.buffer(400, quad_segs=48), TO_WGS84, interleaved=False)
    return mapping(polygon)


def repair_neighborhoods(geojson):
    """Repara artefactos topológicos de redondeo sin cambiar la capa original."""
    repairs = []
    for feature in geojson["features"]:
        polygon = shape(feature["geometry"])
        if polygon.is_valid:
            continue
        reason = explain_validity(polygon)
        fixed = make_valid(polygon)
        if fixed.geom_type == "GeometryCollection":
            fixed = union_all([
                part for part in fixed.geoms if part.geom_type in ("Polygon", "MultiPolygon")
            ])
        area_change = abs(fixed.area - polygon.area) / polygon.area
        if not fixed.is_valid or fixed.is_empty or area_change > 0.00001:
            raise ValueError(f"Reparación geométrica altera el barrio: {feature['properties']}")
        feature["geometry"] = mapping(fixed)
        repairs.append({
            "neighborhood_id": int(feature["properties"]["BARRI"]),
            "source_issue": reason,
            "repair_method": "shapely.make_valid; polygon parts retained",
            "relative_area_change": area_change,
        })
    return repairs


def match_table9(schools, table):
    """Enlaza filas anónimas por distrito y PEADC, sin usar la titularidad errónea."""
    matches = []
    used = set()
    for row in table:
        candidates = [
            s for s in schools
            if s["district_id"] == int(row["district_id"])
            and abs(s["mean_peadc_score"] - row["mean_peadc_reported"]) < 0.02
        ]
        if len(candidates) != 1 or candidates[0]["school_id"] in used:
            raise ValueError(f"Enlace de tabla 9 ambiguo o inexistente: fila {row['table_row']}")
        school = candidates[0]
        used.add(school["school_id"])
        conflict = school["school_type"] != row["reported_school_type"]
        school.update({
            "excess_weight_prevalence_pct": numeric(row["excess_weight_prevalence_pct"]),
            "excess_weight_source": "thesis_table9_pdf_page118_printed94",
            "excess_weight_link_method": "unique district + mean PEADC match; tolerance <0.02",
            "excess_weight_link_reconstructed": True,
            "table9_row": int(row["table_row"]),
            "table9_school_type_conflict": conflict,
        })
        if school["excess_weight_prevalence_pct"] < school["obesity_prevalence_pct"]:
            raise ValueError("Exceso de peso inferior a obesidad: enlace de tabla 9 inválido")
        matches.append({
            **row, "school_id": school["school_id"], "school_name": school["name"],
            "school_type_from_stata": school["school_type"],
            "mean_peadc_reproduced": school["mean_peadc_score"],
            "school_type_conflict": conflict,
            "link_reconstructed": True,
        })
    if used != {s["school_id"] for s in schools}:
        raise ValueError("La tabla 9 no cubre las 22 escuelas")
    return matches


def write_json(path, data, pretty=False):
    path.write_text(
        json.dumps(
            data, ensure_ascii=False, allow_nan=False,
            indent=2 if pretty else None,
            separators=None if pretty else (",", ":"),
        ) + "\n",
        encoding="utf8",
    )


def write_table(directory, name, rows):
    write_json(directory / f"{name}.json", rows)
    pd.DataFrame(rows).to_csv(directory / f"{name}.csv", index=False, encoding="utf8")


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_stata(path, **kwargs):
    # La advertencia de encoding se registra en el informe, no se repite en cada lectura.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", pd.errors.DtypeWarning)
        warnings.simplefilter("ignore", UnicodeWarning)
        return pd.read_stata(path, **kwargs)


def build(root=ROOT, output=None):
    root = Path(root)
    output = Path(output) if output else root / "data/clean"
    output.mkdir(parents=True, exist_ok=True)
    raw = root / "data/raw"
    originals = root / "docs/datasets-raw"
    source_manifest = json.loads((raw / "sources.json").read_text())
    for filename, source in source_manifest.items():
        if sha256(raw / filename) != source["snapshot_sha256"]:
            raise ValueError(f"Snapshot modificado sin actualizar procedencia: {filename}")

    df = read_stata(originals / THESIS_BASE, convert_categoricals=False)
    before = read_stata(originals / EARLIER_BASE, convert_categoricals=False)
    labelled = read_stata(originals / THESIS_BASE, convert_categoricals=True)
    sample = pd.read_excel(originals / SAMPLE)
    census = pd.read_csv(raw / "census_2016_thesis_subset.csv", low_memory=False)
    directory = json.loads((raw / "schools_directory_2019_2020.json").read_text())
    crosswalk = json.loads((raw / "school_crosswalk.json").read_text())
    table9 = pd.read_csv(raw / "thesis_table9.csv").to_dict("records")
    neighborhoods_geo = json.loads((raw / "barris.geojson").read_text())
    neighborhood_geometry_repairs = repair_neighborhoods(neighborhoods_geo)
    if not df.id_bcn.is_unique or not sample.id_bcn.is_unique or not census.ID_BCN.is_unique:
        raise ValueError("Identificadores de establecimiento duplicados")
    if not set(sample.id_bcn) <= set(df.id_bcn):
        raise ValueError("El Excel contiene establecimientos fuera de la tesis")
    if set(df.id_bcn) != set(before.id_bcn):
        raise ValueError("Los universos de las dos versiones no coinciden")
    census_by_id = census.set_index("ID_BCN").to_dict("index")
    sample_by_id = sample.set_index("id_bcn").to_dict("index")
    directory_by_id = {r["codi_centre"]: r for r in directory}
    source_labels = pd.io.stata.StataReader(originals / THESIS_BASE).variable_labels()

    # Contexto histórico del barrio del COMERCIO. La escuela tiene su propio barrio.
    contexts = {}
    for code, group in df.groupby("codi_barri"):
        for col in ("RFD", "poblaciã", "superfãcieha", "km2", "Densitat"):
            if group[col].nunique() != 1:
                raise ValueError(f"Contexto de barrio inconsistente: {code}, {col}")
        row = group.iloc[0]
        contexts[int(code)] = {
            "rfd_index": numeric(row.RFD),
            "population": numeric(row["poblaciã"]),
            "area_ha": numeric(row["superfãcieha"]),
            "population_density_per_km2": round(float(row.Densitat) * 1000, 6),
            "context_reference_year": 2016,
        }
    neighborhood_shapes = {
        int(f["properties"]["BARRI"]): shape(f["geometry"])
        for f in neighborhoods_geo["features"]
    }

    schools = []
    school_geometries = {}
    coordinate_neighborhood_mismatches = []
    for school_id, group in df.groupby("id", sort=True):
        if school_id not in crosswalk:
            raise ValueError(f"Escuela sin correspondencia oficial: {school_id}")
        for col in ("escoles_totes", "barri", "districte", "type_escola", "Obesitat"):
            if group[col].nunique() != 1:
                raise ValueError(f"Datos de escuela inconsistentes: {school_id}, {col}")
        row = group.iloc[0]
        official = directory_by_id[crosswalk[school_id]]
        if official["curs"] != GEOCODE_SCHOOL_COURSE:
            raise ValueError("Curso de geolocalización incorrecto")
        lon = numeric(official["coordenades_geo_x"])
        lat = numeric(official["coordenades_geo_y"])
        geometry = point_geometry(lon, lat)
        code = int(row.barri)
        if not neighborhood_shapes[code].buffer(0.0001).covers(Point(lon, lat)):
            coordinate_neighborhood_mismatches.append(school_id)
        school_geometries[school_id] = geometry
        school_context = contexts.get(code, {})
        schools.append({
            "school_id": school_id,
            "official_school_code": crosswalk[school_id],
            "name": clean_text(row.escoles_totes),
            "official_name": clean_text(official["denominaci_completa"]),
            "address": clean_text(row.adreca),
            "official_address": clean_text(official["adre_a"]),
            "school_type": "public" if row.type_escola == 1 else "subsidized",
            "neighborhood_id": code,
            "district_id": int(row.districte),
            "obesity_prevalence_pct": numeric(row.Obesitat),
            "excess_weight_prevalence_pct": None,
            "latitude": lat,
            "longitude": lon,
            "coordinate_source": "gencat_school_directory_2019_2020",
            "coordinate_course": GEOCODE_SCHOOL_COURSE,
            "school_rfd_index": school_context.get("rfd_index"),
            "school_ses_binary": (
                None if not school_context else
                "high" if school_context["rfd_index"] >= 85 else "low"
            ),
            "school_population_density_per_km2": school_context.get(
                "population_density_per_km2"
            ),
        })

    stores, store_features, links, nutrition, promotion = [], [], [], [], []
    threshold_conflicts, missing_geometry = [], []
    distance_buffer_exceptions = []
    school_lookup = {s["school_id"]: s for s in schools}
    instrument_availability = [
        "afruta", "averdura", "apatatas", "aver_conge", "afrutoseco", "afruseco_s",
        "acola_l", "acola", "aalcohol", "azumo100", "azumono100", "apan_int",
        "acereales", "acerealesn", "abollo", "aleche_des", "aleche_semi", "aleche_ent",
        "ayogu_des", "aqueso_f", "aqueso_s", "ahuevos", "aarroz_int", "aarroz_b",
        "alegumbres", "aaceiteo", "aaceiteg", "acarne_v", "acarne_ave", "aembutido",
        "aatun", "apescado", "apescado_c_nop", "apesca_c_p",
    ]
    instrument_availability = [c for c in instrument_availability if c in df]
    price_fields = [c for c in df if c.startswith("precio_")]
    for idx, row in df.sort_values("id_bcn").iterrows():
        store_id = int(row.id_bcn)
        visited = bool(row.Locales_visit)
        x = sample_by_id.get(store_id)
        c = census_by_id.get(store_id)
        lon = lat = None
        coordinate_source = None
        if x:
            lon, lat = numeric(x["longitud"]), numeric(x["latitud"])
            coordinate_source = "thesis_sample_excel"
            if c and (lon != numeric(c["LONGITUD"]) or lat != numeric(c["LATITUD"])):
                raise ValueError(f"Coordenadas incompatibles entre Excel y censo: {store_id}")
        elif c:
            lon, lat = numeric(c["LONGITUD"]), numeric(c["LATITUD"])
            coordinate_source = "municipal_census_2016_pinned_mirror"
        geometry = point_geometry(lon, lat)
        if geometry is None:
            missing_geometry.append(store_id)
        score = numeric(row.nems) if pd.notna(row.nems_cat) else None
        published_class = (
            None if pd.isna(row.nems_cat) else
            "unhealthy" if row.nems_cat == 1 else "healthy"
        )
        rule_class = classification(score)
        conflict = published_class is not None and published_class != rule_class
        if conflict:
            threshold_conflicts.append(store_id)
        peadc = numeric(row.peadc_v2) if visited else None
        straight_rebuilt = None
        if geometry:
            school_point = school_geometries[row.id]["coordinates"]
            straight_rebuilt = round(
                transform(Point(lon, lat), TO_METERS, interleaved=False).distance(
                    transform(Point(*school_point), TO_METERS, interleaved=False)
                ), 3,
            )
            if straight_rebuilt > 400:
                distance_buffer_exceptions.append(store_id)
        district = int(row.Codi_Districte)
        store = {
            "store_id": store_id,
            "school_id": row.id,
            "name": clean_text(row.N_LOCAL),
            "address": clean_text(f"{row.N_CARRER} {row.NUM_POLICI}"),
            "activity_code": int(row.ID_ACT),
            "activity_name": clean_text(row.N_ACT),
            "sector": "food_service" if str(row.ID_ACT) == "14000" else "food_retail",
            "retail_type": clean_text(labelled.loc[idx, "type_store"]),
            "food_service_type": clean_text(labelled.loc[idx, "sub_cat_14"])
                if str(row.ID_ACT) == "14000" and visited else None,
            "neighborhood_id": int(row.codi_barri),
            "district_id": district,
            "neighborhood_name": clean_text(row.Nom_Barri),
            "district_name": clean_text(row.N_DISTRI),
            "school_neighborhood_id": school_lookup[row.id]["neighborhood_id"],
            "store_rfd_index": numeric(row.RFD),
            "school_rfd_index": school_lookup[row.id]["school_rfd_index"],
            "route_distance_m": numeric(row.distancia_escola_m),
            "walk_time_minutes": numeric(row.minutos_escola),
            "straight_distance_source_m": numeric(row.distancia_recto_m) if visited else None,
            "straight_distance_rebuilt_m": straight_rebuilt,
            "surveyed_2022": visited,
            "sample_excel_2021": store_id in sample_by_id,
            "latitude": lat,
            "longitude": lon,
            "coordinate_source": coordinate_source,
            "has_geometry": geometry is not None,
            "nems_score": score,
            "nems_published_class": published_class,
            "nems_documented_rule_class": rule_class,
            "nems_threshold_conflict": conflict,
            "peadc_score": peadc,
            "promotes_high_calorie_foods": None if peadc is None else peadc > 0,
        }
        stores.append(store)
        store_features.append(feature(store_id, store, geometry))
        links.append({k: store[k] for k in (
            "store_id", "school_id", "route_distance_m", "walk_time_minutes",
            "straight_distance_source_m", "straight_distance_rebuilt_m",
        )})
        if score is not None:
            prices = []
            for col in price_fields:
                if pd.notna(row[col]):
                    decoded = numeric(labelled.loc[idx, col])
                    prices.append({
                        "source_field": col,
                        "raw_numeric_value": numeric(row[col]),
                        "decoded_value": decoded,
                        "source_unit": "EUR/kg as stored" if col.endswith("_kg") else
                            "as recorded; consult questionnaire and format field",
                        "requires_unit_review": True,
                        "label_decoded": numeric(row[col]) != decoded,
                    })
            nutrition.append({
                "store_id": store_id, "school_id": row.id,
                "nems_score": score,
                "availability_score": numeric(row.nems_disponib),
                "price_score": numeric(row.nems_precio),
                "published_class": published_class,
                "documented_rule_class": rule_class,
                "threshold_conflict": conflict,
                "availability": {col: boolean(row[col]) for col in instrument_availability},
                "prices": prices,
                "price_formats": {
                    col: numeric(row[col]) for col in df
                    if col.startswith(("formato_", "gr_")) and pd.notna(row[col])
                },
            })
        if visited:
            promotion.append({
                "store_id": store_id, "school_id": row.id,
                "peadc_score": peadc,
                "promotes_high_calorie_foods": peadc > 0,
                "promotional_furniture": boolean(row.promo1),
                "external_food_display": boolean(row.promo2F),
                "internal_food_display": boolean(row.promo3F),
                "brand_signage": boolean(row.promo11_cat),
                "discount_advertising": boolean(row.promo13_cat),
                "other_brand_elements": boolean(row.promo14_cat),
            })

    for school in schools:
        group = [s for s in stores if s["school_id"] == school["school_id"]]
        surveyed = [s for s in group if s["surveyed_2022"]]
        measured = [s for s in group if s["nems_score"] is not None]
        unhealthy = [s for s in measured if s["nems_published_class"] == "unhealthy"]
        positive = [s for s in surveyed if s["peadc_score"] > 0]
        school.update({
            "assigned_stores_count": len(group),
            "assigned_retail_count": sum(s["sector"] == "food_retail" for s in group),
            "geolocated_stores_count": sum(s["has_geometry"] for s in group),
            "surveyed_stores_count": len(surveyed),
            "nems_observations_count": len(measured),
            "unhealthy_observed_count": len(unhealthy),
            "unhealthy_observed_pct": ratio(len(unhealthy), len(measured)),
            "mean_nems_score": average([s["nems_score"] for s in measured]),
            "nearest_unhealthy_observed_route_m": min(
                (s["route_distance_m"] for s in unhealthy), default=None
            ),
            "promotion_observations_count": len(surveyed),
            "positive_peadc_count": len(positive),
            "positive_peadc_pct": ratio(len(positive), len(surveyed)),
            "mean_peadc_score": average([s["peadc_score"] for s in surveyed]),
            "mean_positive_peadc_score": average([s["peadc_score"] for s in positive]),
            "assigned_stores_per_nominal_buffer_km2": round(len(group) / (math.pi * 0.4**2), 6),
        })
    table9_matches = match_table9(schools, table9)
    school_features = [
        feature(s["school_id"], s, school_geometries[s["school_id"]]) for s in schools
    ]
    buffers = collection([
        feature(s["school_id"], {
            "school_id": s["school_id"], "name": s["name"], "radius_m": 400,
            "method": "EPSG:25831 buffer of official 2019/2020 school point",
            "is_original_thesis_buffer": False,
        }, buffer_geometry(s["longitude"], s["latitude"])) for s in schools
    ])
    neighborhoods = []
    enriched_neighborhoods = []
    for f in neighborhoods_geo["features"]:
        code = int(f["properties"]["BARRI"])
        group = [s for s in stores if s["neighborhood_id"] == code]
        measured = [s for s in group if s["nems_score"] is not None]
        surveyed = [s for s in group if s["surveyed_2022"]]
        props = {
            "neighborhood_id": code, "name": clean_text(f["properties"]["NOM"]),
            "geometry_area_m2": f["properties"]["AREA"],
            "rfd_index": None, "population": None, "area_ha": None,
            "population_density_per_km2": None, "context_reference_year": None,
            **contexts.get(code, {}),
            "has_study_context": code in contexts,
            "study_assigned_stores_count": len(group),
            "study_schools_count": sum(s["neighborhood_id"] == code for s in schools),
            "nems_observations_count": len(measured),
            "mean_nems_score": average([s["nems_score"] for s in measured]),
            "unhealthy_observed_pct": ratio(
                sum(s["nems_published_class"] == "unhealthy" for s in measured), len(measured)
            ),
            "promotion_observations_count": len(surveyed),
            "mean_peadc_score": average([s["peadc_score"] for s in surveyed]),
            "positive_peadc_pct": ratio(
                sum(s["peadc_score"] > 0 for s in surveyed), len(surveyed)
            ),
        }
        neighborhoods.append(props)
        enriched_neighborhoods.append(feature(code, props, f["geometry"]))

    old = before.set_index("id_bcn").sort_index()
    current = df.set_index("id_bcn").sort_index()
    changed = {}
    for col in old.columns.intersection(current.columns):
        equal = (old[col] == current[col]) | (old[col].isna() & current[col].isna())
        if not equal.all():
            changed[col] = int((~equal).sum())
    visited_ids = {s["store_id"] for s in stores if s["surveyed_2022"]}
    report = {
        "schema_version": DATA_SCHEMA_VERSION,
        "counts": {
            "schools": len(schools), "stores": len(stores),
            "geolocated_stores": len(stores) - len(missing_geometry),
            "unlocated_stores": len(missing_geometry), "surveyed_stores": len(promotion),
            "nutrition_observations": len(nutrition),
            "published_unhealthy": sum(s["published_class"] == "unhealthy" for s in nutrition),
            "documented_rule_unhealthy": sum(
                s["documented_rule_class"] == "unhealthy" for s in nutrition
            ),
            "positive_peadc": sum(s["peadc_score"] > 0 for s in promotion),
            "zero_peadc": sum(s["peadc_score"] == 0 for s in promotion),
            "neighborhoods_geometry": len(neighborhoods),
            "neighborhoods_with_historical_context": len(contexts),
        },
        "unlocated_store_ids": missing_geometry,
        "nems_threshold_conflict_ids": threshold_conflicts,
        "sample_only_excel_ids": sorted(set(sample_by_id) - visited_ids),
        "sample_only_2022_ids": sorted(visited_ids - set(sample_by_id)),
        "common_fields_modified_between_versions": changed,
        "school_neighborhood_coordinate_mismatch_ids": coordinate_neighborhood_mismatches,
        "neighborhood_geometry_repairs": neighborhood_geometry_repairs,
        "stores_outside_rebuilt_400m_buffer_ids": distance_buffer_exceptions,
        "nems_scores_outside_classified_sample_ids": [
            int(r.id_bcn) for _, r in df[df.nems.notna() & df.nems_cat.isna()].iterrows()
        ],
        "promotion_category_records_outside_survey_count": int(
            ((df.Locales_visit == 0) & df.promo11_cat.notna()).sum()
        ),
        "table9_reconstructed_school_links": len(table9_matches),
        "table9_school_type_conflicts": [
            r for r in table9_matches if r["school_type_conflict"]
        ],
        "decisions": [
            "2022 is authoritative for measurements; "
            "Excel and 2016 census enrich coordinates only.",
            "Published NEMS class preserved; documented <=36 rule and conflict exposed separately.",
            "PEADC uses peadc_v2, preserves zero and restricts observations to surveyed_2022.",
            "School context is looked up by school neighborhood; store context stays separate.",
            "Densitat is converted from thousands of inhabitants/km2 to inhabitants/km2.",
            "Null means unavailable; no missing measurements replaced by zero.",
            "Only classified 153 NEMS records emitted; 5 extra raw scores remain audit evidence.",
            "Prices decoded via Stata labels; units and source outliers still require review.",
            "Invalid rounded neighborhood polygons repaired with make_valid; "
            "source snapshot and original area properties preserved.",
            "Rebuilt buffers are display geometry; "
            "original assignments and route distances retained.",
            "Obesity is a school-level historical percentage, not an individual child outcome.",
            "Excess weight recovered from table 9 by unique district + mean PEADC matching; "
            "two reported school types conflict with Stata and the official school directory.",
        ],
    }
    if report["counts"]["schools"] != 22 or report["counts"]["stores"] != 3644:
        raise ValueError("Recuentos del universo distintos de los documentados")
    if len(promotion) != 306 or len(nutrition) != 153:
        raise ValueError("Recuentos de las muestras distintos de los documentados")

    layers = {
        "schools": collection(school_features),
        "stores": collection(store_features),
        "buffers": buffers,
        "neighborhoods": collection(enriched_neighborhoods),
    }
    for name in ("schools", "stores", "buffers", "neighborhoods"):
        write_json(output / f"{name}.geojson", layers[name])
    for name, rows in (
        ("schools", schools), ("stores", stores), ("school_store_links", links),
        ("neighborhood_indicators", neighborhoods),
    ):
        write_table(output, name, rows)
    write_json(output / "nutrition_observations.json", nutrition)
    write_json(output / "promotion_observations.json", promotion)
    write_table(output, "thesis_table9_school_links", table9_matches)
    write_json(output / "quality_report.json", report, pretty=True)
    meta = {
        "schema_version": DATA_SCHEMA_VERSION,
        "study_period": "2019–2020", "demographic_reference_year": 2016,
        "measurement_version": "2022-12-13", "crs": "EPSG:4326",
        "coordinate_order": "longitude, latitude",
        "default_nems_classification": "published",
        "counts": report["counts"],
        "sources": source_manifest,
        "local_sources": {
            f: {"path": f"docs/datasets-raw/{f}", "sha256": sha256(originals / f)}
            for f in (THESIS_BASE, EARLIER_BASE, SAMPLE, PDF)
        },
        "crosswalk_sha256": sha256(raw / "school_crosswalk.json"),
        "table9_transcription_sha256": sha256(raw / "thesis_table9.csv"),
        "limitations": report["decisions"],
    }
    write_json(output / "metadata.json", meta, pretty=True)
    dictionary = {
        "schema_version": DATA_SCHEMA_VERSION,
        "units": {
            "*_pct": "percentage points, 0–100; not a 0–1 fraction",
            "*_distance_m": "meters",
            "walk_time_minutes": "minutes",
            "*_rfd_index": "historical relative income index; Barcelona=100; not euros",
            "population_density_per_km2": "inhabitants/km2",
            "nems_score": "0–49; higher means more healthy availability/affordability",
            "peadc_score": "0–40; higher means more high-calorie food promotion",
        },
        "join_keys": {
            "stores": "store_id (unique integer)",
            "schools": "school_id (municipal EG code; unique string)",
            "school_store_links": "store_id -> school_id, study assignment, one link per store",
            "neighborhoods": "neighborhood_id (integer 1–73)",
            "nutrition_observations": "store_id, classified NEMS sample only",
            "promotion_observations": "store_id, 2022 surveyed sample only",
        },
        "rules": {
            "null": "Unavailable or not applicable; never replace with zero.",
            "nems_published_class": "Default class reproduces 146 unhealthy/153.",
            "nems_documented_rule_class": "Literal thesis <=36 rule; 147 unhealthy/153.",
            "retail_type": "Partial source coverage; null does not mean non-retail.",
            "straight_distance_rebuilt_m": "Recalculated from external official school point.",
            "straight_distance_source_m": "Original source euclidean distance, surveyed sample.",
            "assigned_stores_per_nominal_buffer_km2":
                "Assigned count / (pi * 0.4^2); not a full spatial intersection count.",
            "mean_peadc_score": "All surveyed observations including zero.",
            "mean_positive_peadc_score": "Only observations with PEADC >0; distinct denominator.",
            "obesity_prevalence_pct":
                "School-level obesity, not obesity+overweight or child records.",
            "excess_weight_prevalence_pct":
                "Published table 9 values; anonymous rows linked by district and mean PEADC.",
            "excess_weight_link_reconstructed":
                "True: association with named school reconstructed; expose provenance in the UI.",
            "table9_school_type_conflict":
                "Reported table-9 type differs from Stata and official 2019/2020 directory.",
            "context_reference_year": "2016 demographic inputs per thesis methodology.",
        },
        "instrument_availability_labels": {
            c: clean_text(source_labels.get(c)) for c in instrument_availability
        },
        "tables": {
            "stores": list(stores[0]), "schools": list(schools[0]),
            "neighborhood_indicators": list(neighborhoods[0]),
            "nutrition_observations": list(nutrition[0]),
            "promotion_observations": list(promotion[0]),
            "school_store_links": list(links[0]),
        },
    }
    write_json(output / "data_dictionary.json", dictionary, pretty=True)
    bundle = {
        "geo": layers["neighborhoods"], "indicators": neighborhoods,
        "layers": layers, "nutrition": nutrition, "promotion": promotion,
        "meta": meta,
    }
    (output / "bundle.js").write_text(
        "window.CATAMAP = " + json.dumps(
            bundle, ensure_ascii=False, allow_nan=False, separators=(",", ":")
        ) + ";\n", encoding="utf8",
    )
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="Carpeta de salida alternativa")
    args = parser.parse_args()
    report = build(output=args.output)
    print(json.dumps(report["counts"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
