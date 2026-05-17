import * as React from "react";
import { cn } from "@/lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("bg-[#0a0c10] border border-white/10 rounded-xl p-6 shadow-xl", className)}
      {...props}
    />
  )
);
Card.displayName = "Card";

export { Card };
