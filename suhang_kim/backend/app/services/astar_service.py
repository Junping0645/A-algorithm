"""
A* 알고리즘 구현.
NetworkX MultiDiGraph 위에서 동작.
휴리스틱: 하버사인(실제 직선거리).
"""
import heapq
import time
from math import radians, sin, cos, sqrt, atan2
from typing import List, Optional, Tuple

import networkx as nx


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """두 좌표 간 직선거리 (m) — A* 휴리스틱"""
    R = 6_371_000.0
    φ1, φ2 = radians(lat1), radians(lat2)
    Δφ = radians(lat2 - lat1)
    Δλ = radians(lng2 - lng1)
    a = sin(Δφ / 2) ** 2 + cos(φ1) * cos(φ2) * sin(Δλ / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


def astar(
    G: nx.MultiDiGraph,
    start: int,
    goal: int,
) -> dict:
    """
    NetworkX 그래프 위에서 A* 실행.

    반환:
      path: 노드 ID 리스트
      path_coords: [(lat, lng), ...]
      explored_coords: [(lat, lng), ...]  ← 탐색 과정
      total_distance: 총 거리 (m)
      computation_time_ms: 계산 시간
      nodes_explored: 탐색 노드 수
    """
    if start not in G or goal not in G:
        raise ValueError(f"노드 {start} 또는 {goal} 이(가) 그래프에 없습니다.")

    t0 = time.perf_counter()

    goal_lat = float(G.nodes[goal]['y'])
    goal_lng = float(G.nodes[goal]['x'])

    def h(node: int) -> float:
        lat = float(G.nodes[node]['y'])
        lng = float(G.nodes[node]['x'])
        return haversine(lat, lng, goal_lat, goal_lng)

    # (f_score, g_score, node, parent)
    open_heap: List[Tuple[float, float, int, Optional[int]]] = []
    heapq.heappush(open_heap, (h(start), 0.0, start, None))

    came_from: dict = {}
    g_score: dict = {start: 0.0}
    explored: List[int] = []
    visited: set = set()

    while open_heap:
        f, g, current, parent = heapq.heappop(open_heap)

        if current in visited:
            continue
        visited.add(current)
        explored.append(current)

        if parent is not None:
            came_from[current] = parent

        if current == goal:
            break

        for _, neighbor, key, edge_data in G.edges(current, data=True, keys=True):
            if edge_data.get('blocked', False):
                continue

            weight = float(edge_data.get('current_weight', edge_data.get('length', 100)))
            if weight == float('inf'):
                continue

            new_g = g + weight
            if new_g < g_score.get(neighbor, float('inf')):
                g_score[neighbor] = new_g
                f_new = new_g + h(neighbor)
                heapq.heappush(open_heap, (f_new, new_g, neighbor, current))

    # 경로 역추적
    if goal not in visited:
        raise ValueError("경로를 찾을 수 없습니다 (차단된 도로로 고립된 상태).")

    path: List[int] = []
    cur = goal
    while cur != start:
        path.append(cur)
        cur = came_from[cur]
    path.append(start)
    path.reverse()

    # 좌표 변환
    def node_coord(n: int) -> Tuple[float, float]:
        return (float(G.nodes[n]['y']), float(G.nodes[n]['x']))

    path_coords = [node_coord(n) for n in path]
    explored_coords = [node_coord(n) for n in explored]
    total_distance = g_score[goal]
    elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)

    return {
        "path": path,
        "path_coords": path_coords,
        "explored_coords": explored_coords,
        "total_distance": total_distance,
        "computation_time_ms": elapsed_ms,
        "nodes_explored": len(explored),
    }
