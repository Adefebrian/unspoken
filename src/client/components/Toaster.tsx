import { useEffect, useState } from "react";
import { subscribeToast } from "../lib/toast.ts";

interface Item {
  id: number;
  message: string;
  leaving: boolean;
}

let seq = 0;

export function Toaster() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    return subscribeToast((message) => {
      const id = ++seq;
      setItems((prev) => [...prev, { id, message, leaving: false }]);
      // start leave animation, then remove
      setTimeout(() => {
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, leaving: true } : i)));
      }, 3000);
      setTimeout(() => {
        setItems((prev) => prev.filter((i) => i.id !== id));
      }, 3300);
    });
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-[70] flex flex-col items-center gap-2 px-4">
      {items.map((item) => (
        <div
          key={item.id}
          className="pointer-events-auto rounded-full border border-ink/10 bg-ink px-5 py-2.5 text-sm text-paper shadow-xl"
          style={{
            animation: item.leaving
              ? "fadeOut 0.3s ease both"
              : "toastIn 0.32s cubic-bezier(0.22,1,0.36,1) both",
          }}
        >
          {item.message}
        </div>
      ))}
    </div>
  );
}
