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

  if (!usableEnvironment) {
    return "/onboarding";
  }

  return normalizeReturnTo(requestedReturnTo);
}
