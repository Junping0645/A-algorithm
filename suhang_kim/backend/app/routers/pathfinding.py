import asyncio
from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services import graph_service, astar_service, dijkstra_service

router  = APIRouter()
_pool   = ThreadPoolExecutor(max_workers=4)


class PathRequest(BaseModel):
    start_node:    int
    goal_node:     int
    graph_version: int = 0


# ── 단일 알고리즘 ─────────────────────────────────────────
@router.post("/astar")
def run_astar(body: PathRequest):
    G = _get_graph()
    try:
        return astar_service.astar(G, body.start_node, body.goal_node)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/dijkstra")
def run_dijkstra(body: PathRequest):
    G = _get_graph()
    try:
        return dijkstra_service.dijkstra(G, body.start_node, body.goal_node)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ── 비교 (두 알고리즘 병렬 실행) ──────────────────────────
@router.post("/compare")
async def compare(body: PathRequest):
    """
    Dijkstra 와 A* 를 동시에 실행해 결과를 비교 반환.
    두 알고리즘을 ThreadPoolExecutor 로 병렬 처리.
    """
    G = _get_graph()
    loop = asyncio.get_event_loop()

    try:
        astar_fut     = loop.run_in_executor(_pool, astar_service.astar,     G, body.start_node, body.goal_node)
        dijkstra_fut  = loop.run_in_executor(_pool, dijkstra_service.dijkstra, G, body.start_node, body.goal_node)
        astar_res, dijkstra_res = await asyncio.gather(astar_fut, dijkstra_fut)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return {
        "astar":    astar_res,
        "dijkstra": dijkstra_res,
    }


def _get_graph():
    G = graph_service.get_graph()
    if G is None:
        raise HTTPException(status_code=400, detail="그래프를 먼저 로드하세요.")
    return G
