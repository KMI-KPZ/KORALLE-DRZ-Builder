# KORALLE DRZ Builder

- `frontend/`: DRZ-Baukasten (React, TypeScript, Vite)
- `backend/`: KORALLE-Backend (Django) with the simulation engine in `koralle/apps/simulations/engine`

```bash
docker compose up --build        # http://localhost:8080
```

Without Docker: `cd backend/koralle && python -m apps.simulations.engine.devserver --port 8000`,
then `cd frontend && npm install && npm run dev`.
