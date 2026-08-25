import { Badge, type BadgeProps } from "~/components/ui";

type BadgeColor = Exclude<BadgeProps["color"], undefined>;

function getStatusColor(status: string): BadgeColor {
  switch (status) {
    case "COMPLETED":
    case "ACTIVE":
    case "RUNNING":
      return "grass";

    case "EXECUTING":
    case "STARTING":
    case "DRAINING":
      return "amber";

    case "FAILED":
      return "tomato";

    case "PENDING":
      return "bronze";

    case "CANCELED":
    case "INACTIVE":
    case "STOPPED":
      return "gray";

    default:
      return "gray";
  }
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge color={getStatusColor(status)} variant="surface">
      {status}
    </Badge>
  );
}
