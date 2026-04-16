import { useRef, useEffect, useCallback } from 'react'
import L from 'leaflet'
import { useTmapMap } from '../hooks/useTmapMap'
import type { AppState, CompareResult, GraphData, GEdge, Hospital } from '../types'
import { API } from '../lib/api'
import toast from 'react-hot-toast'
import styles from './MapView.module.css'

// 병원 마커 아이콘 (Leaflet DivIcon)
const hospitalIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:28px;height:28px;border-radius:50%;
    background:#e53e3e;border:2px solid #fff;
    display:flex;align-items:center;justify-content:center;
    color:#fff;font-weight:800;font-size:13px;
    box-shadow:0 2px 6px rgba(0,0,0,0.4);">H</div>`,
  iconSize:   [28, 28],
  iconAnchor: [14, 14],
})

const ULSAN_CENTER: [number, number] = [35.5384, 129.3114]

interface Props {
  graph: GraphData | null
  state: AppState
  compareResult: CompareResult | null
  hospitals: Hospital[]
  onStartSelected: (nodeId: number) => void
  onGoalSelected:  (nodeId: number) => void
  onGraphVersionChange: (v: number) => void
  onCompareResult: (r: CompareResult) => void
}

export default function MapView({
  graph, state, compareResult, hospitals,
  onStartSelected, onGoalSelected,
  onGraphVersionChange, onCompareResult,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null!)
  const canvasRef    = useRef<HTMLCanvasElement>(null!)
  const animFrameRef = useRef<number>(0)

  // Latest values in refs to avoid stale closures in one-time-registered listeners
  const stateRef  = useRef(state)
  const graphRef  = useRef(graph)
  useEffect(() => { stateRef.current  = state  }, [state])
  useEffect(() => { graphRef.current  = graph  }, [graph])

  const {
    map,
    coordToOffset,
    drawPolyline, clearPolylines,
    addMarker, removeMarker,
    onMapClick, onMapRightClick,
  } = useTmapMap(containerRef, { center: ULSAN_CENTER, zoom: 14 })

  // ── 캔버스 크기 동기화 (ResizeObserver) ──────────────────
  useEffect(() => {
    const resize = () => {
      const el = containerRef.current
      if (!el || !canvasRef.current) return
      canvasRef.current.width  = el.clientWidth
      canvasRef.current.height = el.clientHeight
    }
    resize()
    const ro = new ResizeObserver(resize)
    if (containerRef.current) ro.observe(containerRef.current)
    window.addEventListener('resize', resize)
    return () => { ro.disconnect(); window.removeEventListener('resize', resize) }
  }, [])

  // ── edge 모드에서 캔버스가 휠 이벤트를 막으므로 Leaflet에 전달 ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      const m = (map as any).current as any
      if (!m) return
      e.preventDefault()
      const rect  = canvas.getBoundingClientRect()
      const pt    = m.containerPointToLatLng([e.clientX - rect.left, e.clientY - rect.top])
      m.setZoomAround(pt, m.getZoom() + (e.deltaY < 0 ? 1 : -1), { animate: true })
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [map])

  // ── 출발지 / 목적지 마커 ref ─────────────────────────────
  const startMarkerRef = useRef<any>(null)
  const goalMarkerRef  = useRef<any>(null)

  // ── TMAP 지도 클릭으로 출발지/목적지 등록 (1회) ──────────
  const onStartSelectedRef = useRef(onStartSelected)
  const onGoalSelectedRef  = useRef(onGoalSelected)
  useEffect(() => { onStartSelectedRef.current = onStartSelected }, [onStartSelected])
  useEffect(() => { onGoalSelectedRef.current  = onGoalSelected  }, [onGoalSelected])

  useEffect(() => {
    // left click → 출발지
    onMapClick((lat, lng) => {
      if (stateRef.current.toolMode !== 'select') return
      if (!graphRef.current) {
        toast('도로 데이터를 먼저 로드하세요', { icon: '⚠️' })
        return
      }
      const id = findNearestNodeLatLng(graphRef.current, lat, lng)
      if (id === null) return
      // 마커 갱신
      if (startMarkerRef.current) removeMarker(startMarkerRef.current)
      startMarkerRef.current = addMarker(lat, lng, undefined, '출발')
      onStartSelectedRef.current(id)
      toast.success('출발지 설정됨', { duration: 1000 })
    })

    // right click → 목적지
    onMapRightClick((lat, lng) => {
      if (stateRef.current.toolMode !== 'select') return
      if (!graphRef.current) return
      const id = findNearestNodeLatLng(graphRef.current, lat, lng)
      if (id === null) return
      if (goalMarkerRef.current) removeMarker(goalMarkerRef.current)
      goalMarkerRef.current = addMarker(lat, lng, undefined, '도착')
      onGoalSelectedRef.current(id)
      toast.success('목적지 설정됨', { duration: 1000 })
    })
  }, []) // eslint-disable-line

  // ── 경로 폴리라인 그리기 + 자동 fitBounds ────────────────
  useEffect(() => {
    clearPolylines()
    if (!compareResult) return

    const allCoords: [number, number][] = []

    if (compareResult.dijkstra.path_coords.length) {
      drawPolyline(compareResult.dijkstra.path_coords, '#f0883e', 6, 0.95)
      allCoords.push(...compareResult.dijkstra.path_coords)
    }
    if (compareResult.astar.path_coords.length) {
      drawPolyline(compareResult.astar.path_coords, '#58a6ff', 6, 0.95)
      allCoords.push(...compareResult.astar.path_coords)
    }

    // 경로 전체가 보이도록 지도 줌 자동 조정
    if (allCoords.length > 0) {
      const m = map.current as any
      if (m?.fitBounds) {
        m.fitBounds(allCoords, { padding: [40, 40], maxZoom: 16 })
      }
    }
  }, [compareResult, drawPolyline, clearPolylines, map])

  // ── 병원 마커 ─────────────────────────────────────────────
  const hospitalMarkersRef = useRef<L.Marker[]>([])
  useEffect(() => {
    // 이전 병원 마커 제거
    hospitalMarkersRef.current.forEach(m => m.remove())
    hospitalMarkersRef.current = []

    const m = map.current
    if (!m || hospitals.length === 0) return

    hospitals.forEach(h => {
      const marker = L.marker([h.lat, h.lng], { icon: hospitalIcon, zIndexOffset: 500 })
        .addTo(m)
        .bindTooltip(h.name, { direction: 'top', offset: [0, -14], opacity: 0.9 })
      hospitalMarkersRef.current.push(marker)
    })
  }, [hospitals, map])

  // ── edge 모드: 도로 클릭 → 이벤트 적용 후 재탐색 ─────────
  const applyEdgeEvent = useCallback(async (edge: GEdge) => {
    const type = stateRef.current.toolMode as 'block' | 'accident' | 'congestion'
    const body = {
      type,
      edge_ids: [edge.id],
      weight_multiplier: type === 'congestion' ? 4.0 : 1.0,
      blocked: type !== 'congestion',
    }
    const res  = await fetch(`${API}/api/graph/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    onGraphVersionChange(data.graph_version)

    const { startNode, goalNode } = stateRef.current
    if (startNode !== null && goalNode !== null) {
      const r = await fetch(`${API}/api/pathfinding/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_node: startNode, goal_node: goalNode, graph_version: data.graph_version }),
      })
      if (r.ok) onCompareResult(await r.json())
      else toast.error('경로 없음 — 차단으로 고립됨')
    }
  }, [onGraphVersionChange, onCompareResult])

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const isEdgeMode = ['block', 'accident', 'congestion'].includes(stateRef.current.toolMode)
    if (!isEdgeMode || !graphRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    const nodeMap = new Map(graphRef.current.nodes.map(n => [n.id, n]))

    let best = Infinity, bestEdge: GEdge | null = null
    for (const edge of graphRef.current.edges) {
      const s = nodeMap.get(edge.source), t = nodeMap.get(edge.target)
      if (!s || !t) continue
      const sp = coordToOffset(s.lat, s.lng), tp = coordToOffset(t.lat, t.lng)
      if (!sp || !tp) continue
      const d = ptSegDist(mx, my, sp.x, sp.y, tp.x, tp.y)
      if (d < best) { best = d; bestEdge = edge }
    }
    if (bestEdge && best < 20) applyEdgeEvent(bestEdge)
    else toast('도로 선 위를 클릭하세요', { icon: '🖱️', duration: 1200 })
  }, [coordToOffset, applyEdgeEvent])

  // ── 캔버스 렌더 루프 (도로망 + 탐색 점 + 마커 핀) ────────
  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current
      if (!canvas) { animFrameRef.current = requestAnimationFrame(draw); return }
      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      if (graph) {
        const nodeMap = new Map(graph.nodes.map(n => [n.id, n]))

        // Layer 1: 도로 네트워크
        for (const edge of graph.edges) {
          const s = nodeMap.get(edge.source), t = nodeMap.get(edge.target)
          if (!s || !t) continue
          const sp = coordToOffset(s.lat, s.lng), tp = coordToOffset(t.lat, t.lng)
          if (!sp || !tp) continue
          if (edge.blocked) {
            ctx.strokeStyle = 'rgba(248,81,73,0.9)'; ctx.lineWidth = 3
          } else if (edge.congestion_level > 0) {
            const r = Math.min(255, 80 + edge.congestion_level * 35)
            ctx.strokeStyle = `rgba(${r},140,20,0.9)`; ctx.lineWidth = 2.5
          } else {
            ctx.strokeStyle = 'rgba(110,130,150,0.45)'; ctx.lineWidth = 1.5
          }
          ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(tp.x, tp.y); ctx.stroke()
        }

        // Layer 2a: Dijkstra 탐색 범위 (연한 주황 점)
        if (compareResult?.dijkstra.explored_coords?.length) {
          ctx.fillStyle = 'rgba(240,136,62,0.15)'
          for (const [lat, lng] of compareResult.dijkstra.explored_coords) {
            const p = coordToOffset(lat, lng)
            if (!p) continue
            ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill()
          }
        }

        // Layer 2b: A* 탐색 범위 (연한 파랑 점)
        if (compareResult?.astar.explored_coords?.length) {
          ctx.fillStyle = 'rgba(88,166,255,0.18)'
          for (const [lat, lng] of compareResult.astar.explored_coords) {
            const p = coordToOffset(lat, lng)
            if (!p) continue
            ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill()
          }
        }

        // Layer 3: 출발지 / 목적지 핀 (canvas fallback)
        const sNode = state.startNode !== null ? nodeMap.get(state.startNode) : null
        const gNode = state.goalNode  !== null ? nodeMap.get(state.goalNode)  : null
        if (sNode) drawPin(ctx, coordToOffset(sNode.lat, sNode.lng), '#3fb950', '#fff', '출발')
        if (gNode) drawPin(ctx, coordToOffset(gNode.lat, gNode.lng), '#f85149', '#fff', '도착')
      }

      animFrameRef.current = requestAnimationFrame(draw)
    }

    animFrameRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [graph, compareResult, state.startNode, state.goalNode, coordToOffset])

  const isEdgeMode = ['block', 'accident', 'congestion'].includes(state.toolMode)
  const cursorMap: Record<string, string> = {
    select: 'default', block: 'cell', accident: 'cell', congestion: 'cell',
  }

  return (
    <div className={styles.wrapper}>
      <div ref={containerRef} className={styles.mapContainer} />
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={{
          cursor: cursorMap[state.toolMode] ?? 'default',
          pointerEvents: isEdgeMode ? 'all' : 'none',
        }}
        onClick={handleCanvasClick}
      />
    </div>
  )
}

// ── 헬퍼 ─────────────────────────────────────────────────
function findNearestNodeLatLng(
  graph: { nodes: { id: number; lat: number; lng: number }[] },
  lat: number, lng: number,
): number | null {
  let best = Infinity, bestId = -1
  for (const node of graph.nodes) {
    const d = (node.lat - lat) ** 2 + (node.lng - lng) ** 2
    if (d < best) { best = d; bestId = node.id }
  }
  return bestId === -1 ? null : bestId
}

function drawPin(
  ctx: CanvasRenderingContext2D,
  pos: { x: number; y: number } | null,
  bgColor: string, textColor: string, label: string,
) {
  if (!pos) return
  const r = 14, { x, y } = pos

  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3

  ctx.fillStyle = bgColor
  ctx.beginPath(); ctx.arc(x, y - r, r, 0, Math.PI * 2); ctx.fill()

  ctx.beginPath(); ctx.moveTo(x - 6, y - r + 4); ctx.lineTo(x + 6, y - r + 4)
  ctx.lineTo(x, y + 2); ctx.closePath(); ctx.fill()
  ctx.restore()

  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.arc(x, y - r, r, 0, Math.PI * 2); ctx.stroke()

  ctx.fillStyle = textColor
  ctx.font = 'bold 10px Inter, sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(label, x, y - r)
}

function ptSegDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}
