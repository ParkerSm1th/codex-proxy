import { cn } from "@/lib/utils";

interface BrandMarkProps {
  className?: string;
}

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <img
      src="/icon.png"
      alt="UseMySub"
      className={cn("size-full object-contain", className)}
      draggable={false}
    />
  );
}
