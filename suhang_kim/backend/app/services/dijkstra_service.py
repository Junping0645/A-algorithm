"""
Dijkstra 알고리즘 구현.
A*와 동일한 반환 구조를 사용해 직접 비교 가능.
휴리스틱 없이 모든 방향을 균등하게 탐색 → A*보다 탐색 노드가 많음.
"""
import heapq
import time
from typing import List, Optional, Tuple

import networkx as nx


def dijkstra(G: nx.MultiDiGraph, start: int, goal: int) -> dict:
    """
    NetworkX 그래프 위에서 Dijkstra 실행.

    반환:
      path            : 노드 ID 리스트
      path_coords     : [(lat, lng), ...]
      explored_coords : 탐색 순서대로 방문한 좌표 목록
      total_distance  : 총 거리 (m)
      computation_time_ms
      nodes_explored  : 탐색(확정)한 노드 수
    """
    if start not in G or goal not in G:
        raise ValueError(f"노드 {start} 또는 {goal} 이(가) 그래프에 없습니다.")

    t0 = time.perf_counter()

    # (dist, node, parent)
    heap: List[Tuple[float, int, Optional[int]]] = [(0.0, start, None)]
    dist:       dict = {start: 0.0}
    came_from:  dict = {}
    visited:    set  = set()
    explored:   List[int] = []

    while heap:
        d, node, parent = heapq.heappop(heap)

        if node in visited:
            continue
        visited.add(node)
        explored.append(node)
        if parent is not None:
            came_from[node] = parent

        if node == goal:
            break

        for _, neighbor, _, edge_data in G.edges(node, data=True, keys=True):
            if edge_data.get('blocked', False):
                continue
            w = float(edge_data.get('current_weight', edge_data.get('length', 100)))
            if w == float('inf'):
                continue
            new_d = d + w
            if new_d < dist.get(neighbor, float('inf')):
                dist[neighbor] = new_d
                heapq.heappush(heap, (new_d, neighbor, node))

    if goal not in visited:
        raise ValueError("경로를 찾을 수 없습니다.")

    # 경로 역추적
    path: List[int] = []
    cur = goal
    while cur != start:
        path.append(cur)
        cur = came_from[cur]
    path.append(start)
    path.reverse()

    def coord(n: int) -> Tuple[float, float]:
        return (float(G.nodes[n]['y']), float(G.nodes[n]['x']))

    return {
        "path":              path,
        "path_coords":       [coord(n) for n in path],
        "explored_coords":   [coord(n) for n in explored],
        "total_distance":    dist[goal],
        "computation_time_ms": round((time.perf_counter() - t0) * 1000, 2),
        "nodes_explored":    len(explored),
    }
