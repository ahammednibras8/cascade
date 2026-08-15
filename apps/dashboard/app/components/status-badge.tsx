import { Badge, type BadgeProps } from "~/components/ui";

type BadgeColor = Exclude<BadgeProps["color"], undefined>;

function getStatusColor(status: string): BadgeColor {
  switch (status) {
    case "COMPLETED":
      return "grass";
    case "EXECUTING":
      return "amber";
    case "FAILED":
      return "tomato";
    case "PENDING":
      return "bronze";
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
