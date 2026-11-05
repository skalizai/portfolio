import { db } from "@/lib/db";

export async function getBoard() {
  const applications = await db().application.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      status: true,
      notes: true,
      submittedAt: true,
      sendAt: true,
      coverLetter: true,
      job: {
        select: {
          title: true,
          company: true,
          location: true,
          url: true,
          applyEmail: true,
          scores: { orderBy: { createdAt: "desc" }, take: 1, select: { score: true } },
        },
      },
    },
  });

  return applications.map(({ job: { scores, ...job }, coverLetter, ...application }) => ({
    ...application,
    hasLetter: Boolean(coverLetter?.trim()),
    job,
    score: scores[0]?.score ?? null,
  }));
}

export type BoardCard = Awaited<ReturnType<typeof getBoard>>[number];
