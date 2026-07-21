import { Button, cn } from "@tarodan/ui";
import { ChevronDownIcon } from "@heroicons/react/24/outline";

export function ExpandButton({
  isOpen,
  onToggle,
  openTitle,
  closeTitle,
}: {
  isOpen: boolean;
  onToggle: () => void;
  openTitle: string;
  closeTitle: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onToggle}
      title={isOpen ? closeTitle : openTitle}
    >
      <ChevronDownIcon
        className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")}
      />
    </Button>
  );
}
