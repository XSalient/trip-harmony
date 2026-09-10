import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";

const Toaster = ({ ...props }: ToasterProps) => {
  // Previously pulled from next-themes, which has no provider mounted here, so
  // toasts silently followed the OS while the app was locked to light.
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme}
      // Bottom-right lands on top of the fixed tab bar on mobile (MASTER §10).
      position="top-center"
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
