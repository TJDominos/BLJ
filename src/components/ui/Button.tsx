import * as React from "react";
import { cn } from "@/lib/utils";
import { motion, HTMLMotionProps } from "motion/react";

interface ButtonProps extends HTMLMotionProps<"button"> {
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    const variants = {
      primary: "bg-cyan-600 text-white hover:bg-cyan-500 border border-transparent shadow-[0_0_20px_rgba(8,145,178,0.4)]",
      secondary: "bg-white/5 border border-white/10 text-white hover:bg-white/10",
      outline: "bg-transparent text-white border border-white/10 hover:bg-white/5",
      ghost: "bg-transparent text-slate-400 hover:text-white hover:bg-white/5",
    };

    const sizes = {
      sm: "px-4 py-2 text-[10px] font-bold uppercase tracking-widest",
      md: "px-6 py-2.5 text-xs font-bold uppercase tracking-widest",
      lg: "px-8 py-3 text-sm font-bold uppercase tracking-widest",
    };

    return (
      <motion.button
        ref={ref}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className={cn(
          "inline-flex items-center justify-center rounded-xl transition-all focus:outline-none disabled:opacity-50 disabled:pointer-events-none",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
