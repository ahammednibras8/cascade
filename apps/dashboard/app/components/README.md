# Dashboard UI stack

Use this small stack first:

1. `@radix-ui/themes` for components.
2. Tailwind CSS utilities for layout and spacing.
3. `lucide-react` for icons.

Do not add Ariakit, Headless UI, Heroicons, or Tabler Icons by default. They overlap with the current stack. Add one only when Radix Themes or Lucide cannot cover a specific component or icon.

Import through the local entry points:

```tsx
import { Card, Flex, Text } from "~/components/ui";
import { ArrowRight } from "~/components/icons";
```
