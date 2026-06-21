import { cn } from "@/lib/utils";

interface BrandMarkProps {
  className?: string;
}

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={cn("size-full shrink-0", className)}
    >
      <rect x="1" y="1" width="30" height="30" rx="7" fill="#1C1C1F" stroke="#3A3A42" strokeWidth="1" />
      <circle cx="13" cy="19" r="1.6" fill="#FFFFFF" />
      <path
        d="M8.5 22.5C11.5 18.5 12.8 17.2 13 19C13.2 20.8 18 10.5 23.5 9.5"
        stroke="#2DD4BF"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21 8.5L24 9.5L23 12.5"
        stroke="#2DD4BF"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
