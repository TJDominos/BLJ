import * as React from "react";
import { cn } from "@/lib/utils";

const Badge = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { variant?: "default" | "gold" | "outline" }>(
  ({ className, variant = "default", ...props }, ref) => {
    const variants = {
      default: "bg-white/10 text-white",
      gold: "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50",
      outline: "border border-white/10 text-slate-400",
    };
    
    return (
      <div
        ref={ref}
        className={cn(
          "inline-flex items-center rounded px-3 py-1 text-[10px] font-bold uppercase tracking-widest max-w-fit",
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);
Badge.displayName = "Badge";

export { Badge };
