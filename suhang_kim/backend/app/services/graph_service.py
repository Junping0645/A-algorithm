"""
도로 그래프 서비스.
osmnx로 OSM 데이터를 로드하고 NetworkX 그래프로 관리.
이벤트(차단/사고/혼잡) 적용/해제 담당.
"""
import os
import uuid
from pathlib import Path
from typing import Dict, List, Tuple, Optional

import networkx as nx
import osmnx as ox

from app.models.graph_models import EdgeModel, NodeModel, EventType

# ── 전역 상태 ──────────────────────────────────────────────
_graph: Optional[nx.MultiDiGraph] = None
_graph_version: int = 0
_events: Dict[str, dict] = {}          # event_id → event info
DATA_DIR = Path(__file__).parent.parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)

# 주요 도시 중심 좌표
REGION_COORDS: Dict[str, Tuple[float, float]] = {
    "울산": (35.5384, 129.3114),
    "서울": (37.5665, 126.9780),
    "부산": (35.1796, 129.0756),
    "대구": (35.8714, 128.6014),
    "광주": (35.1595, 126.8526),
    "인천": (37.4563, 126.7052),
    "대전": (36.3504, 127.3845),
}


def get_graph() -> Optional[nx.MultiDiGraph]:
    return _graph


def get_version() -> int:
    return _graph_version


def load_road_network(region: str, radius_m: int = 2000) -> Tuple[nx.MultiDiGraph, int]:
    """
    OSM에서 도로 네트워크를 다운로드.
    - region: 쉼표로 여러 행정구역 입력 가능 ("울산 남구, 울산 중구")
    - 행정구역명이 유효하면 graph_from_place 사용 (정확한 경계)
    - 실패 시 중심점+반경 폴백
    - GraphML 캐시로 반복 요청 방지
    """
    global _graph, _graph_version, _events

    places = [p.strip() for p in region.split(",") if p.strip()]
    safe_key = "_".join(p.replace(" ", "") for p in places)

    place_cache = DATA_DIR / f"{safe_key}_place.graphml"

    if place_cache.exists():
        G = ox.load_graphml(place_cache)
    else:
        try:
            query = places if len(places) > 1 else places[0]
            G = ox.graph_from_place(query, network_type="drive", simplify=True)
            ox.save_graphml(G, place_cache)
        except Exception:
            # 행정구역 조회 실패 → 첫 번째 지역명 기준 중심점+반경 폴백
            first = places[0]
            center = REGION_COORDS.get(first)
            if center is None:
                try:
                    gdf = ox.geocode_to_gdf(first)
                    center = (gdf.geometry.centroid.y.iloc[0], gdf.geometry.centroid.x.iloc[0])
                except Exception:
                    center = REGION_COORDS["울산"]

            radius_cache = DATA_DIR / f"{safe_key}_{radius_m}.graphml"
            if radius_cache.exists():
                G = ox.load_graphml(radius_cache)
            else:
                G = ox.graph_from_point(
                    center, dist=radius_m, network_type="drive", simplify=True
                )
                ox.save_graphml(G, radius_cache)

    for u, v, k, data in G.edges(data=True, keys=True):
        data["base_weight"]     = float(data.get("length", 100))
        data["current_weight"]  = data["base_weight"]
        data["blocked"]         = False
        data["congestion_level"] = 0
        data["event_id"]        = None

    _graph = G
    _graph_version += 1
    _events = {}
    return G, _graph_version


def get_hospitals(region: str) -> List[dict]:
    """
    OSM에서 해당 지역의 병원(amenity=hospital) 위치를 반환.
    캐시 파일로 반복 요청 방지.
    """
    places = [p.strip() for p in region.split(",") if p.strip()]
    safe_key = "_".join(p.replace(" ", "") for p in places)
    cache_path = DATA_DIR / f"{safe_key}_hospitals.json"

    if cache_path.exists():
        import json
        return json.loads(cache_path.read_text(encoding="utf-8"))

    hospitals = []
    try:
        import json
        query = places if len(places) > 1 else places[0]
        gdf = ox.features_from_place(query, tags={"amenity": "hospital"})
        for _, row in gdf.iterrows():
            geom = row.geometry
            # 폴리곤이면 중심점 사용
            if geom.geom_type == "Point":
                lat, lng = geom.y, geom.x
            else:
                lat, lng = geom.centroid.y, geom.centroid.x
            name = row.get("name", "병원")
            if isinstance(name, float):
                name = "병원"
            hospitals.append({"lat": lat, "lng": lng, "name": str(name)})
        cache_path.write_text(json.dumps(hospitals, ensure_ascii=False), encoding="utf-8")
    except Exception as e:
        print(f"[hospital] 병원 데이터 조회 실패: {e}")

    return hospitals


def apply_event(
    edge_ids: List[str],
    event_type: EventType,
    weight_multiplier: float = 1.0,
    blocked: bool = False,
) -> Tuple[str, List[EdgeModel], int]:
    """
    이벤트 적용:
    - block/accident → blocked=True, current_weight=inf
    - congestion → current_weight = base_weight * multiplier
    반환: (event_id, updated_edges, new_version)
    """
    global _graph_version

    if _graph is None:
        raise ValueError("그래프가 로드되지 않았습니다.")

    event_id = str(uuid.uuid4())[:8]
    updated: List[EdgeModel] = []

    for eid in edge_ids:
        parts = eid.split("_")
        if len(parts) < 2:
            continue
        u, v = int(parts[0]), int(parts[1])
        key = int(parts[2]) if len(parts) > 2 else 0

        if not _graph.has_edge(u, v, key):
            continue

        data = _graph[u][v][key]
        data['event_id'] = event_id

        if event_type in (EventType.block, EventType.accident):
            data['blocked'] = True
            data['current_weight'] = float('inf')
            data['congestion_level'] = 5 if event_type == EventType.accident else 5
        elif event_type == EventType.congestion:
            data['blocked'] = False
            data['current_weight'] = data['base_weight'] * weight_multiplier
            data['congestion_level'] = min(5, max(1, int(weight_multiplier)))

        updated.append(_edge_to_model(u, v, key, data))

    _events[event_id] = {"type": event_type, "edge_ids": edge_ids}
    _graph_version += 1
    return event_id, updated, _graph_version


def remove_event(event_id: str) -> Tuple[List[EdgeModel], int]:
    """이벤트 해제: 해당 엣지를 원래 상태로 복원."""
    global _graph_version

    if _graph is None or event_id not in _events:
        return [], _graph_version

    event = _events.pop(event_id)
    restored: List[EdgeModel] = []

    for eid in event["edge_ids"]:
        parts = eid.split("_")
        if len(parts) < 2:
            continue
        u, v = int(parts[0]), int(parts[1])
        key = int(parts[2]) if len(parts) > 2 else 0
        if not _graph.has_edge(u, v, key):
            continue
        data = _graph[u][v][key]
        data['blocked'] = False
        data['current_weight'] = data['base_weight']
        data['congestion_level'] = 0
        data['event_id'] = None
        restored.append(_edge_to_model(u, v, key, data))

    _graph_version += 1
    return restored, _graph_version


def graph_to_response() -> Tuple[List[NodeModel], List[EdgeModel]]:
    """그래프를 API 응답 형태로 직렬화."""
    if _graph is None:
        return [], []

    nodes = [
        NodeModel(
            id=int(n),
            lat=float(_graph.nodes[n]['y']),
            lng=float(_graph.nodes[n]['x']),
        )
        for n in _graph.nodes
    ]

    edges = []
    seen: set = set()
    for u, v, k, data in _graph.edges(data=True, keys=True):
        eid = f"{u}_{v}_{k}"
        if eid in seen:
            continue
        seen.add(eid)
        edges.append(_edge_to_model(u, v, k, data))

    return nodes, edges


def _edge_to_model(u: int, v: int, k: int, data: dict) -> EdgeModel:
    name_raw = data.get('name', '')
    if isinstance(name_raw, list):
        name_raw = name_raw[0] if name_raw else ''
    return EdgeModel(
        id=f"{u}_{v}_{k}",
        source=int(u),
        target=int(v),
        weight=float(data.get('current_weight', data.get('length', 100))),
        road_name=str(name_raw),
        blocked=bool(data.get('blocked', False)),
        congestion_level=int(data.get('congestion_level', 0)),
    )
