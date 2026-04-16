from fastapi import APIRouter, HTTPException, Query
from app.models.graph_models import GraphResponse, EventRequest, EventResponse
from app.services import graph_service

router = APIRouter()


@router.get("/load", response_model=GraphResponse)
def load_graph(
    region: str = Query("울산 남구", description="지역명 (쉼표로 여러 구 입력 가능)"),
    radius: int = Query(2000, ge=500, le=20000, description="행정구역 실패 시 폴백 반경(m)"),
):
    """OSM에서 도로 네트워크 로드 (캐시 우선). 쉼표로 여러 구 동시 로드 가능."""
    try:
        G, version = graph_service.load_road_network(region, radius)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    nodes, edges = graph_service.graph_to_response()
    return GraphResponse(nodes=nodes, edges=edges, graph_version=version)


@router.get("/hospitals")
def get_hospitals(
    region: str = Query("울산 남구", description="지역명 (쉼표로 여러 구 가능)"),
):
    """OSM에서 해당 지역 병원 위치 반환."""
    try:
        hospitals = graph_service.get_hospitals(region)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"hospitals": hospitals}


@router.post("/event", response_model=EventResponse)
def apply_event(body: EventRequest):
    """도로 이벤트 적용 (차단/사고/혼잡)."""
    if graph_service.get_graph() is None:
        raise HTTPException(status_code=400, detail="그래프를 먼저 로드하세요.")
    try:
        event_id, updated, version = graph_service.apply_event(
            body.edge_ids, body.type, body.weight_multiplier, body.blocked
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return EventResponse(event_id=event_id, updated_edges=updated, graph_version=version)


@router.delete("/event/{event_id}")
def remove_event(event_id: str):
    """이벤트 해제 (도로 복구)."""
    if graph_service.get_graph() is None:
        raise HTTPException(status_code=400, detail="그래프를 먼저 로드하세요.")
    restored, version = graph_service.remove_event(event_id)
    return {"restored_edges": len(restored), "graph_version": version}
