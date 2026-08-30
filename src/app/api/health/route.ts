export const runtime = "nodejs";
export const maxDuration = 5;

export function GET() {
  const publicCommit = process.env.VERCEL_GIT_COMMIT_SHA?.trim().toLocaleLowerCase("en-US");
  return Response.json(
    {
      status: "ok",
      ...(/^[0-9a-f]{40}$/u.test(publicCommit ?? "") ? { commit: publicCommit } : {}),
    },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
