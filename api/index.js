import app from '../app.js';

// Vercel serverless entry. vercel.json rewrites every request here, and the
// Express app (from app.js) handles routing, the API, and the static front-end.
export default app;
