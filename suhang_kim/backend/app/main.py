from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import graph, pathfinding

app = FastAPI(title="구급차 최단경로 비교 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(graph.router,       prefix="/api/graph",       tags=["graph"])
app.include_router(pathfinding.router, prefix="/api/pathfinding", tags=["pathfinding"])


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
