# Backend Structure

The backend uses a simple MVC-style Flask layout:

```text
src/backend/
  app.py                 Flask app bootstrap, blueprint registration, database init
  controllers/           HTTP routes grouped by feature
  core/                  App config, auth decorators, database connection, shared utilities
  services/              Business logic that routes can reuse
  schema.sql             Database schema
```

## Where Code Should Go

- `controllers/`: request/response code, route definitions, validation that is specific to an endpoint.
- `services/`: business rules such as stock reservation, invoice calculations, email sending, and payment helpers.
- `core/`: app-wide infrastructure such as environment config, auth decorators, database connections, and generic utilities.
- `app.py`: app creation, CORS, blueprint registration, database initialization. Keep new feature routes out of this file.

## Feature Pattern

Each feature should have a controller blueprint. If the feature has business rules that are reused or grow beyond simple request handling, put that logic in a service.

Example:

```text
controllers/products_controller.py
services/stock_service.py
core/database.py
```
