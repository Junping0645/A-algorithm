from pydantic import BaseModel
from typing import List, Optional
from enum import Enum


class EventType(str, Enum):
    block = "block"
    accident = "accident"
    congestion = "congestion"


class NodeModel(BaseModel):
    id: int
    lat: float
    lng: float


class EdgeModel(BaseModel):
    id: str           # "u_v_key"
    source: int
    target: int
    weight: float
    road_name: str
    blocked: bool
    congestion_level: int  # 0~5


class GraphResponse(BaseModel):
    nodes: List[NodeModel]
    edges: List[EdgeModel]
    graph_version: int


class EventRequest(BaseModel):
    type: EventType
    edge_ids: List[str]
    weight_multiplier: float = 1.0
    blocked: bool = False


class EventResponse(BaseModel):
    event_id: str
    updated_edges: List[EdgeModel]
    graph_version: int
