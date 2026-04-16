import { useState, useCallback, useRef } from 'react'
import { Toaster } from 'react-hot-toast'
import MapView from './components/MapView'
import ControlPanel from './components/ControlPanel'
import EventToolbar from './components/EventToolbar'
import StatsPanel from './components/StatsPanel'
import type { AppState, CompareResult, CompareRecord, ToolMode, GraphData, Hospital } from './types'
import styles from './App.module.css'

const initialState: AppState = {
  startNode: null,
  goalNode: null,
  toolMode: 'select',
  graphVersion: 0,
}

export default function App() {
  const [state, setState]           = useState<AppState>(initialState)
  const [graph, setGraph]           = useState<GraphData | null>(null)
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null)
  const [hospitals, setHospitals]   = useState<Hospital[]>([])
  const [history, setHistory]       = useState<CompareRecord[]>([])

  // 현재 로드된 지역명 (ControlPanel → 여기서 관리)
  const currentRegionRef = useRef<string>('울산 남구')

  const setToolMode = useCallback((mode: ToolMode) => {
    setState(s => ({ ...s, toolMode: mode }))
  }, [])

  const onGraphLoaded = useCallback((g: GraphData, region: string) => {
    setGraph(g)
    setState(s => ({ ...s, graphVersion: g.graph_version }))
    currentRegionRef.current = region
  }, [])

  const onCompareResult = useCallback((r: CompareResult) => {
    setCompareResult(r)
    // 히스토리에 기록 추가
    setHistory(prev => [...prev, {
      timestamp:   new Date().toISOString(),
      region:      currentRegionRef.current,
      startNode:   0,   // MapView에서 받아오기 어려우므로 노드ID 대신 좌표 사용 가능
      goalNode:    0,
      astar:       r.astar,
      dijkstra:    r.dijkstra,
      sentToSheet: false,
    }])
  }, [])

  const onHospitalsLoaded = useCallback((h: Hospital[]) => {
    setHospitals(h)
  }, [])

  const onStartSelected = useCallback((nodeId: number) => {
    setState(s => ({ ...s, startNode: nodeId }))
  }, [])

  const onGoalSelected = useCallback((nodeId: number) => {
    setState(s => ({ ...s, goalNode: nodeId }))
  }, [])

  const onGraphVersionChange = useCallback((v: number) => {
    setState(s => ({ ...s, graphVersion: v }))
  }, [])

  const onRecordSent = useCallback((idx: number) => {
    setHistory(prev => prev.map((r, i) => i === idx ? { ...r, sentToSheet: true } : r))
  }, [])

  return (
    <div className={styles.layout}>
      <Toaster
        position="top-center"
        toastOptions={{ style: { background: '#21262d', color: '#e6edf3', border: '1px solid #30363d' } }}
      />

      <aside className={styles.sidebar}>
        <ControlPanel
          state={state}
          graph={graph}
          onGraphLoaded={onGraphLoaded}
          onCompareResult={onCompareResult}
          onHospitalsLoaded={onHospitalsLoaded}
          setToolMode={setToolMode}
        />
      </aside>

      <main className={styles.mapArea}>
        <EventToolbar toolMode={state.toolMode} setToolMode={setToolMode} />
        <MapView
          graph={graph}
          state={state}
          compareResult={compareResult}
          hospitals={hospitals}
          onStartSelected={onStartSelected}
          onGoalSelected={onGoalSelected}
          onGraphVersionChange={onGraphVersionChange}
          onCompareResult={onCompareResult}
        />
      </main>

      <aside className={styles.stats}>
        <StatsPanel
          compareResult={compareResult}
          history={history}
          onRecordSent={onRecordSent}
        />
      </aside>
    </div>
  )
}
