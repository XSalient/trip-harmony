import { ReactNode } from "react";
import { useLocation, Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import MobileNav from "./MobileNav";

interface AppShellProps {
  children: ReactNode;
  title?: string;
  showBack?: boolean;
  backHref?: string;
  headerRight?: ReactNode;
  hideNav?: boolean;
}

export default function AppShell({ children, title, showBack, backHref, headerRight, hideNav }: AppShellProps) {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {title && (
        <header className="sticky top-0 z-40 bg-card/95 backdrop-blur-lg border-b border-border">
          <div className="mx-auto flex h-14 max-w-2xl items-center px-4 sm:px-5">
            {showBack && (
              <Button
                variant="ghost"
                size="icon"
                className="mr-2 -ml-2 h-9 w-9"
                onClick={() => backHref ? navigate(backHref) : window.history.back()}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <h1 className="text-lg font-semibold truncate flex-1">{title}</h1>
            {headerRight && <div className="ml-2">{headerRight}</div>}
          </div>
        </header>
      )}
      <main className="mx-auto w-full max-w-2xl flex-1 pb-24">
        {children}
      </main>
      {!hideNav && <MobileNav />}
    </div>
  );
}
