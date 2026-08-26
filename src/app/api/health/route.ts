export const runtime = "nodejs";
export const maxDuration = 5;

export function GET() {
  return Response.json(
    { status: "ok" },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
