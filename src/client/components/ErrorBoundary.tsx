import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportError } from "../lib/telemetry.ts";

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError("react.render", error.message, { stack: error.stack?.slice(0, 400), component: info.componentStack?.slice(0, 300) });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-6 text-center">
        <p className="font-hand text-3xl text-ink">something slipped.</p>
        <p className="mt-2 text-sm text-ink-soft">
          the page hit a snag. your words are safe. try refreshing.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 rounded-full bg-ink px-6 py-2.5 text-sm font-medium text-paper"
        >
          refresh
        </button>
      </div>
    );
  }
}
