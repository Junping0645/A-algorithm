import { useState, useRef, KeyboardEvent } from 'react'
import toast from 'react-hot-toast'
import type { AppState, GraphData, CompareResult, Hospital, ToolMode } from '../types'
import { API } from '../lib/api'
import styles from './ControlPanel.module.css'

interface Props {
  state: AppState
  graph: GraphData | null
  onGraphLoaded:    (g: GraphData, region: string) => void
  onCompareResult:  (r: CompareResult) => void
  onHospitalsLoaded:(h: Hospital[]) => void
  setToolMode:      (m: ToolMode) => void
}

export default function ControlPanel({
  state, graph, onGraphLoaded, onCompareResult, onHospitalsLoaded,
}: Props) {
  const [regions, setRegions]         = useState<string[]>(['울산 남구'])
  const [regionInput, setRegionInput] = useState('')
  const [loadingGraph, setLoadingGraph]     = useState(false)
  const [loadingCompare, setLoadingCompare] = useState(false)
  const [loadingHospitals, setLoadingHospitals] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── 태그 추가/제거 ──────────────────────────────────────
  const addRegion = () => {
    const v = regionInput.trim()
    if (v && !regions.includes(v)) setRegions(r => [...r, v])
    setRegionInput('')
    inputRef.current?.focus()
  }

  const removeRegion = (r: string) => setRegions(prev => prev.filter(x => x !== r))

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addRegion() }
    if (e.key === 'Backspace' && !regionInput && regions.length > 0)
      setRegions(r => r.slice(0, -1))
  }

  const regionQuery = regions.join(',')

  // ── 도로 그래프 로드 ─────────────────────────────────────
  const loadGraph = async () => {
    if (regions.length === 0) { toast.error('지역을 입력하세요'); return }
    setLoadingGraph(true)
    try {
      const res = await fetch(`${API}/api/graph/load?region=${encodeURIComponent(regionQuery)}`)
      if (!res.ok) throw new Error(await res.text())
      const data: GraphData = await res.json()
      onGraphLoaded(data, regionQuery)
      toast.success(`로드 완료: 노드 ${data.nodes.length}개, 엣지 ${data.edges.length}개`)
    } catch (e) {
      toast.error(`로드 실패: ${e}`)
    } finally {
      setLoadingGraph(false)
    }
  }

  // ── 병원 데이터 로드 ─────────────────────────────────────
  const loadHospitals = async () => {
    if (regions.length === 0) { toast.error('지역을 먼저 설정하세요'); return }
    setLoadingHospitals(true)
    try {
      const res = await fetch(`${API}/api/graph/hospitals?region=${encodeURIComponent(regionQuery)}`)
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      onHospitalsLoaded(data.hospitals)
      toast.success(`병원 ${data.hospitals.length}개 로드됨`)
    } catch (e) {
      toast.error(`병원 로드 실패: ${e}`)
    } finally {
      setLoadingHospitals(false)
    }
  }

  // ── 비교 실행 ─────────────────────────────────────────────
  const runCompare = async () => {
    if (state.startNode === null || state.goalNode === null) {
      toast.error('출발지/목적지를 먼저 설정하세요 (좌클릭/우클릭)')
      return
    }
    setLoadingCompare(true)
    try {
      const res = await fetch(`${API}/api/pathfinding/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_node: state.startNode,
          goal_node: state.goalNode,
          graph_version: state.graphVersion,
        }),
      })
      if (!res.ok) throw new Error('경로 없음')
      const result: CompareResult = await res.json()
      onCompareResult(result)
      toast.success(
        `비교 완료 — A*: ${result.astar.total_distance.toFixed(0)}m / Dijkstra: ${result.dijkstra.total_distance.toFixed(0)}m`,
      )
    } catch {
      toast.error('경로를 찾을 수 없습니다.')
    } finally {
      setLoadingCompare(false)
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.logo}>
        <span className={styles.logoA}>A*</span>
        <span className={styles.logoVs}>vs</span>
        <span className={styles.logoRL}>Dijkstra</span>
        <span className={styles.logoSub}>구급차 최단경로</span>
      </div>

      {/* ── 도로 네트워크 ── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>🗺 도로 네트워크</h3>
        <label className={styles.label}>지역 (Enter 또는 , 로 여러 구 추가)</label>

        {/* 태그 입력 박스 */}
        <div className={styles.tagBox} onClick={() => inputRef.current?.focus()}>
          {regions.map(r => (
            <span key={r} className={styles.tag}>
              {r}
              <button className={styles.tagRemove} onClick={e => { e.stopPropagation(); removeRegion(r) }}>×</button>
            </span>
          ))}
          <input
            ref={inputRef}
            className={styles.tagInput}
            value={regionInput}
            onChange={e => setRegionInput(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={addRegion}
            placeholder={regions.length === 0 ? '예: 울산 남구' : ''}
          />
        </div>

        <div className={styles.btnRow}>
          <button className={styles.primaryBtn} onClick={loadGraph} disabled={loadingGraph} style={{ flex: 1 }}>
            {loadingGraph ? '로딩 중...' : '도로 로드'}
          </button>
          <button className={styles.hospitalBtn} onClick={loadHospitals} disabled={loadingHospitals || regions.length === 0} title="병원 위치 표시">
            {loadingHospitals ? '…' : '🏥'}
          </button>
        </div>

        {graph && (
          <div className={styles.info}>
            노드 {graph.nodes.length} · 엣지 {graph.edges.length}
          </div>
        )}
      </section>

      {/* ── 출발지 / 목적지 ── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>📍 출발지 / 목적지</h3>
        <div className={styles.nodeRow}>
          <span className={styles.nodeLabel} style={{ color: 'var(--accent-green)' }}>출발</span>
          <span className={styles.nodeVal}>{state.startNode ?? '미설정'}</span>
        </div>
        <div className={styles.nodeRow}>
          <span className={styles.nodeLabel} style={{ color: 'var(--accent-red)' }}>목적지</span>
          <span className={styles.nodeVal}>{state.goalNode ?? '미설정'}</span>
        </div>
        <p className={styles.hint}>좌클릭: 출발지 &nbsp;·&nbsp; 우클릭: 목적지</p>
      </section>

      {/* ── 비교 실행 ── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>🚑 경로 비교</h3>
        <button
          className={`${styles.primaryBtn} ${styles.compareBtn}`}
          onClick={runCompare}
          disabled={loadingCompare || !graph}
        >
          {loadingCompare ? '계산 중...' : '▶ Dijkstra vs A* 비교'}
        </button>
        <div className={styles.legend}>
          <span className={styles.legendDot} style={{ background: '#f0883e' }} /> Dijkstra
          <span className={styles.legendDot} style={{ background: '#58a6ff', marginLeft: 10 }} /> A*
        </div>
      </section>
    </div>
  )
}
