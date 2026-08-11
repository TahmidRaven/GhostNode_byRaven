// Vercel serverless health check. Reached at https://<domain>/health.
export default function handler(_req, res) {
    res.status(200).json({ ok: true });
}
