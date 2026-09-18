"use client";

import { useActionState, useEffect } from "react";
import { SubmitButton } from "@/components/ui";
import {
  employeeClockInStateAction,
  employeeClockOutStateAction,
  type EmployeeClockState,
} from "@/lib/actions/attendance";

const initialState: EmployeeClockState = {
  status: "idle",
  message: "",
  redirectTo: null,
};

export function EmployeeClockForm({ mode }: { mode: "in" | "out" }) {
  const clockAction = mode === "in" ? employeeClockInStateAction : employeeClockOutStateAction;
  const [state, action, pending] = useActionState(clockAction, initialState);

  useEffect(() => {
    if (!state.redirectTo) return;
    window.location.replace(state.redirectTo);
  }, [state.redirectTo]);

  const inputId = mode === "in" ? "timeInRemarks" : "timeOutRemarks";
  const inputName = inputId;
  const label = mode === "in" ? "Time In remarks" : "Time Out remarks";
  const placeholder = mode === "in" ? "Example: On-site duty" : "Example: Completed assigned work";

  return (
    <form action={action}>
      <label className="label" htmlFor={inputId}>
        {label} <span className="font-normal text-slate-400">(optional)</span>
      </label>
      <input
        className="field"
        id={inputId}
        name={inputName}
        maxLength={500}
        placeholder={placeholder}
        disabled={pending || Boolean(state.redirectTo)}
      />

      {state.status === "error" && (
        <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
          {state.message}
        </p>
      )}
      {state.status === "success" && (
        <p role="status" aria-live="polite" className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
          {state.message}
        </p>
      )}

      <SubmitButton
        className={mode === "in" ? "mt-4 w-full min-h-14 text-base" : "btn-secondary mt-4 w-full min-h-14 text-base"}
        disabled={pending || Boolean(state.redirectTo)}
        pendingLabel={mode === "in" ? "Recording Time In" : "Recording Time Out"}
        confirmedProcessing={state.status === "success"}
      >
        {mode === "in" ? "Time In now" : "Time Out now"}
      </SubmitButton>
      <p className="mt-2 text-center text-xs text-slate-500">
        {mode === "in"
          ? "HOAHub uses server-authoritative Asia/Manila time."
          : "Your total hours are recalculated automatically."}
      </p>
    </form>
  );
}
