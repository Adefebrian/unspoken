import { Link, NavLink } from "react-router-dom";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/60 bg-paper/80 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3 sm:px-6 sm:py-3.5">
        <Link to="/" className="group inline-flex items-baseline" aria-label="unspoken home">
          <span className="text-[1.3rem] font-extrabold sm:text-[1.5rem] lowercase leading-none tracking-[-0.03em] text-ink">
            unspoken
          </span>
          <span className="text-[1.3rem] font-extrabold sm:text-[1.5rem] leading-none text-sage transition-transform group-hover:translate-y-0.5">
            .
          </span>
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          <HeaderLink to="/" label="the wall" end />
          <HeaderLink to="/all" label="everything" />
        </nav>
      </div>
    </header>
  );
}

function HeaderLink({ to, label, end }: { to: string; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `rounded-full px-3 py-2 transition-colors sm:px-3.5 ${
          isActive ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-2 hover:text-ink"
        }`
      }
    >
      {label}
    </NavLink>
  );
}
