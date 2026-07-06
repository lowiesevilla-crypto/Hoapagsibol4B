"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";

type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

export function PasswordInput({ className = "field", id, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const inputId = id || generatedId;

  return (
    <div className="relative">
      <input
        {...props}
        id={inputId}
        key={visible ? "password-visible" : "password-hidden"}
        type={visible ? "text" : "password"}
        className={`${className} pr-12`}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />

      <button
        type="button"
        className="absolute inset-y-1 right-1 z-10 grid w-10 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-pine-700"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setVisible((value) => !value)}
        aria-controls={inputId}
        aria-pressed={visible}
        aria-label={visible ? "Hide password" : "Show password"}
        title={visible ? "Hide password" : "Show password"}
      >
        {visible ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
    </div>
  );
}