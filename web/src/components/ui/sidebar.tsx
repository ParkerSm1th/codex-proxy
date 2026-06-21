import * as React from "react";
import { cn } from "@/lib/utils";

const SIDEBAR_WIDTH = "16rem";

type SidebarContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export function SidebarProvider({
  children,
  defaultOpen = true
}: {
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <SidebarContext.Provider value={{ open, setOpen }}>
      <div
        className="flex min-h-screen w-full"
        style={{ "--sidebar-width": SIDEBAR_WIDTH } as React.CSSProperties}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within SidebarProvider");
  }
  return context;
}

export function Sidebar({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  const { open } = useSidebar();
  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-width)] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform md:flex",
        !open && "-translate-x-full",
        className
      )}
      {...props}
    >
      {children}
    </aside>
  );
}

export function SidebarHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-2 p-2", className)} {...props} />;
}

export function SidebarContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-2", className)} {...props} />;
}

export function SidebarFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-2 p-2", className)} {...props} />;
}

export function SidebarGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("relative flex w-full min-w-0 flex-col p-2", className)} {...props} />;
}

export function SidebarGroupLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70", className)}
      {...props}
    />
  );
}

export function SidebarGroupContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("w-full text-sm", className)} {...props} />;
}

export function SidebarMenu({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn("flex w-full min-w-0 flex-col gap-1", className)} {...props} />;
}

export function SidebarMenuItem({ className, ...props }: React.HTMLAttributes<HTMLLIElement>) {
  return <li className={cn("group/menu-item relative", className)} {...props} />;
}

export function SidebarMenuButton({
  className,
  isActive,
  asChild,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { isActive?: boolean; asChild?: boolean }) {
  const classes = cn(
    "flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring",
    isActive && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
    className
  );

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ className?: string }>, {
      className: cn(classes, (children as React.ReactElement<{ className?: string }>).props.className)
    });
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}

export function SidebarInset({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { open } = useSidebar();
  return (
    <div
      className={cn(
        "relative flex min-h-screen flex-1 flex-col bg-background transition-[padding] duration-200 ease-linear md:pl-0",
        open && "md:pl-[var(--sidebar-width)]",
        className
      )}
      {...props}
    />
  );
}

export function SidebarTrigger({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { open, setOpen } = useSidebar();
  return (
    <button
      type="button"
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        className
      )}
      onClick={() => setOpen(!open)}
      {...props}
    >
      <span className="sr-only">Toggle sidebar</span>
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
  );
}
