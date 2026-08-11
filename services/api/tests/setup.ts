// Runs once before the test suite. Requires Postgres + Redis to already be
// reachable — start them first with `docker compose up -d postgres redis`
// (from the repo root), then run `npm test` here, either on the host
// (docker-compose publishes both to localhost) or inside the api
// container via `docker compose exec api npm test`.

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://tingle_app:change_me_locally@localhost:5432/tingle";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "test-only-secret-do-not-use-in-production";
process.env.JWT_EXPIRES_IN ??= "15m";
process.env.APP_URL ??= "http://localhost:5173";
process.env.ADMIN_URL ??= "http://localhost:5175";
