import { Pool } from "pg";

// Single shared pool for the API service. Never construct queries with
// string interpolation of user input — always use parameterized queries
// ($1, $2, ...) so this pool is safe against SQL injection by default.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
