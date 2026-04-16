// ── 그래프 ────────────────────────────────────────────────
export interface GNode {
  id: number
  lat: number
  lng: number
}

export interface GEdge {
  id: string
  source: number
  target: number
  weight: number
  road_name: string
  blocked: boolean
  congestion_level: number
}

export interface GraphData {
  nodes: GNode[]
  edges: GEdge[]
  graph_version: number
}

// ── 이벤트 ────────────────────────────────────────────────
export type EventType = 'block' | 'accident' | 'congestion'

// ── 경로 탐색 결과 ─────────────────────────────────────────
export interface PathResult {
  path:                number[]
  path_coords:         [number, number][]
  explored_coords:     [number, number][]
  total_distance:      number
  computation_time_ms: number
  nodes_explored:      number
}

export interface CompareResult {
  astar:    PathResult
  dijkstra: PathResult
}

// ── UI 상태 ───────────────────────────────────────────────
export type ToolMode = 'select' | 'block' | 'accident' | 'congestion'

export interface AppState {
  startNode:    number | null
  goalNode:     number | null
  toolMode:     ToolMode
  graphVersion: number
}

export interface Hospital {
  lat:  number
  lng:  number
  name: string
}

export interface CompareRecord {
  timestamp:  string        // ISO 문자열
  region:     string
  startNode:  number
  goalNode:   number
  astar:      PathResult
  dijkstra:   PathResult
  sentToSheet: boolean
}
