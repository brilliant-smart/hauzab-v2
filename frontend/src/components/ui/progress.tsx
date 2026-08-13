import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/lib/utils";

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn(
      "relative h-4 w-full overflow-hidden rounded-full",
      // Beautiful gradient background for pending section
      "bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 dark:from-gray-700 dark:via-gray-600 dark:to-gray-700",
      // Subtle shadow for depth
      "shadow-inner",
      className
    )}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className={cn(
        "h-full w-full flex-1 transition-all duration-500 ease-out",
        // Beautiful 3D dark-green gradient matching the theme
        "bg-gradient-to-r from-emerald-600 via-green-600 to-teal-700 dark:from-emerald-500 dark:via-green-500 dark:to-teal-600",
        // Add shine effect
        "relative overflow-hidden",
        // Add depth with shadow
        "shadow-lg"
      )}
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    >
      {/* White separator line at the edge */}
      <div
        className="absolute right-0 top-0 bottom-0 w-[3px] bg-white dark:bg-white/90 shadow-[0_0_8px_rgba(255,255,255,0.8)]"
        style={{
          boxShadow: '0 0 8px rgba(255,255,255,0.8), -2px 0 6px rgba(0,0,0,0.3)'
        }}
      />
      {/* Animated shine overlay */}
      <div 
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white dark:via-white/30 to-transparent opacity-20"
        style={{
          animation: 'shine 2s ease-in-out infinite',
        }}
      />
    </ProgressPrimitive.Indicator>
  </ProgressPrimitive.Root>
));
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
