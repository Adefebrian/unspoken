import type { ReactNode } from "react";

export function Footer() {
  return (
    <footer className="mx-auto max-w-4xl px-5 pb-16 pt-6 text-center sm:px-6">
      <p className="text-2xl font-extrabold tracking-[-0.02em] text-ink sm:text-[1.9rem]">
        say the unspoken. carry a little less.
      </p>
      <p className="mt-2.5 text-xs text-ink-faint">
        your quiet corner for everything you never got to say. be gentle with each other.
      </p>

      <div className="mt-6 flex items-center justify-center gap-3">
        <SocialLink href="https://instagram.com/brianeedsleep" label="Instagram">
          <InstagramIcon />
        </SocialLink>
        <SocialLink href="https://x.com/brianeedsleep" label="X">
          <XIcon />
        </SocialLink>
        <SocialLink href="https://t.me/adefebrianft" label="Telegram">
          <TelegramIcon />
        </SocialLink>
      </div>
    </footer>
  );
}

function SocialLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className="grid h-10 w-10 place-items-center rounded-full border border-line bg-card text-ink-soft transition-all hover:-translate-y-0.5 hover:text-ink"
    >
      {children}
    </a>
  );
}

function InstagramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="3.6" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17" cy="7" r="1.1" fill="currentColor" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 3l6.5 8.5L4.3 21H7l4.8-6.3L16.5 21H21l-6.9-9L20.4 3H17.7l-4.4 5.8L8.8 3H4Z"
        fill="currentColor"
      />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 4.5 2.8 11.3c-.9.4-.9 1 .1 1.3l4.6 1.4 1.8 5.4c.2.6.5.7 1 .3l2.6-2.3 4.6 3.4c.7.4 1.2.2 1.4-.7L21.9 5.4c.2-1-.4-1.4-1-1Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8 14.5 16.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
