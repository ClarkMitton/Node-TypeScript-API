import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { ShieldAlert, LayoutDashboard, FileText, MessageSquare } from "lucide-react";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/chat", label: "AI Chat", icon: MessageSquare },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex min-h-screen bg-[#0a0c10] text-[#c9d1d9]">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-[#21262d] flex flex-col">
        <div className="px-5 py-5 border-b border-[#21262d]">
          <Link href="/" className="flex items-center gap-2.5 group">
            <ShieldAlert className="h-5 w-5 text-[#58a6ff] shrink-0" />
            <span className="text-sm font-semibold text-[#e6edf3] tracking-tight">
              GDPR Scanner
            </span>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/"
                ? location === "/"
                : location.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-[#161b22] text-[#58a6ff]"
                    : "text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#161b22]",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="px-5 py-4 border-t border-[#21262d]">
          <p className="text-[10px] text-[#484f58] uppercase tracking-widest font-medium">
            Privacy Intelligence
          </p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 overflow-auto">{children}</main>
    </div>
  );
}
