import { prisma } from "@cascade/database";

function normalizeReturnTo(value: string | null | undefined) {
  if (value?.startsWith("/") && !value.startsWith("//")) {
    return value;
  }

  return "/dashboard";
}

export async function resolvePostAuthenticationRedirect(
  userId: string,
  requestedReturnTo: string | null | undefined,
) {
  if (!(await hasUsableDashboardWorkspace(userId))) {
    return "/login";
  }

  return normalizeReturnTo(requestedReturnTo);
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
