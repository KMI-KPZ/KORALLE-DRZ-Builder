# Agent Guidelines & Repository Rules: KORALLE-Backend

## 1. Repository Scope & Working Boundary

- **Workspace Boundary**: Never create, edit, or delete files outside the root of this repository. Always resolve paths relative to the project root.
- **Temporary Files**: Scratch scripts, temporary tests, and intermediate files must be kept inside `scratch/` and never checked into version control.
- **Virtual Environment**: Always use the project virtual environment:
  - `./venv/bin/python` for executing Python scripts, migrations, and checks.
  - `./venv/bin/pip` for managing dependencies.
  - Never invoke unversioned or global system Python directly.

---

## 2. Multi-Tenancy & Data Isolation

- **Mandatory Tenant Scoping**: Every tenant-bound model MUST include a foreign key to `apps.organizations.models.Organization`.
- **Query Protection**: All queries in serializers, ViewSets, and service functions must filter by the authenticated user's organization (`organization=request.user.organization`).
- **No Global Leakage**: Never write queries that fetch unbounded data across multiple organizations unless explicitly writing system-level administrative scripts.

---

## 3. Architecture & Separation of Concerns

Follow the **Service Layer Pattern** for all Django applications:
- **`models.py`**: Clean database schemas, constraints, indexes, and custom model managers. Avoid placing large blocks of procedural business logic inside model methods.
- **`services.py`**: Encapsulate all complex domain logic, formula evaluations, graph traversals, and mathematical calculations here. Views should remain thin.
- **`serializers.py`**: Handle input validation, deserialization, and representation. Use explicit field declarations and `drf-spectacular` schema decorators.
- **`views.py`**: Handle HTTP request dispatching, authentication/permission checks, and delegate directly to services.
- **`consumers.py`**: Dedicated ASGI/WebSocket consumers for real-time telemetry streaming and alerts.

```
koralle/apps/<app_name>/
├── __init__.py
├── admin.py
├── apps.py
├── models.py         # Relational schema & indexes
├── services.py       # Domain & business logic
├── serializers.py    # DRF serialization & validation
├── views.py          # ViewSets & API views
├── urls.py           # App routing
├── consumers.py      # (Optional) WebSocket handlers
└── tests/            # Unit & integration tests
```

---

## 4. PostgreSQL Graph & Semantics Standards

- **Semantic Storage**: Custom ontologies are stored natively in PostgreSQL. Use relational `OntologyNode` and `OntologyEdge` models with `django.db.models.JSONField` (`jsonb` on PostgreSQL) for flexible attributes.
- **JSON-LD Compatibility**: Ensure semantic models provide a `.to_jsonld()` method exporting valid W3C JSON-LD syntax with `@context` and `@graph`.
- **BPMN Synchronization**: When saving BPMN models, persist both the raw XML string and the parsed graph structure (nodes, flows, layout bounds) so the frontend can render without re-parsing XML on every query.

---

## 5. Async & Real-Time Performance Guidelines

- **Non-Blocking Handlers**: Never run heavy CPU-bound tasks (e.g. 1D-CNN inference, large graph simulations) inside synchronous HTTP views or WebSocket consumer loops.
- **Background Tasks**: Offload long-running analytical simulations and early detection loops to Celery tasks (`apps/runtime`).
- **Telemetry Streaming**: Limit WebSocket event broadcasts to essential state changes and KPI aggregates to avoid overwhelming client canvas renderers.

---

## 6. Code Style & Standards

- **Language**: Always communicate, write comments, docstrings, and commit messages in English.
- **Type Annotations**: Provide explicit type hints for all function signatures and return types.
- **Error Handling**: Use structured JSON error responses with meaningful HTTP status codes.
- **No Hardcoded Magic Constants**: Move operational thresholds, error codes, and configuration defaults into dedicated `constants.py` modules.
- **Verification Protocol**: Before marking any task complete, verify that:
  1. `python -m py_compile <modified_files>` passes.
  2. `./venv/bin/python koralle/manage.py check` passes with zero errors.

---

## 7. Navigation & Links

- Always provide clickable `file://` markdown links to files, functions, and models when interacting with users or creating reports so that files can be opened immediately from the UI.
