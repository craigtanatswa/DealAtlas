/**
 * On-demand public preview purge for the leak harness. The app under test is
 * started by start-app.sh with this local-only fixture (not a real secret).
 */
export const LEAK_REVALIDATE_SECRET =
  "leak-ci-revalidate-secret-not-real-0123456789";

export async function purgePublicPreviewCache(
  appOrigin: string,
  slugs: string[] = [],
): Promise<void> {
  const response = await fetch(
    `${appOrigin.replace(/\/+$/, "")}/api/internal/revalidate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LEAK_REVALIDATE_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ slugs }),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(
      `public preview cache purge failed with ${response.status}`,
    );
  }
}
