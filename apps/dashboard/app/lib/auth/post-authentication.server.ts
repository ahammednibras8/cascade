import { prisma } from "@cascade/database";
import { getSafeDashboardReturnTo } from "./return-to.server";

export async function resolvePostAuthenticationRedirect(
  userId: string,
  requestedReturnTo: string | null | undefined,
) {
  if (!(await hasUsableDashboardWorkspace(userId))) {
    return "/login";
  }

  return getSafeDashboardReturnTo(requestedReturnTo);
}

async function hasUsableDashboardWorkspace(userId: string) {
  const usableEnvironment = await prisma.environment.findFirst({
    where: {
      project: {
        organization: {
          members: {
            some: {
              userId,
            },
          },
        },
      },
    },
    select: {
      id: true,
    },
  });

  return usableEnvironment !== null;
}
