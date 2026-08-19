"use client";

import { useMemo, useState } from "react";
import { HELPER_DISCLAIMER, HELPER_NAME, replyForHelperQuestion } from "@technovate/shared";
import { cn } from "../../lib/utils";

function speak(text: string): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 0.9;
  window.speechSynthesis.speak(utter);
}

export function ClinicHelper({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(!compact);
  const [question, setQuestion] = useState("");
  const [talking, setTalking] = useState(false);
  const [last, setLast] = useState(replyForHelperQuestion(""));

  const answer = useMemo(() => last, [last]);

  const ask = (q: string): void => {
    const reply = replyForHelperQuestion(q);
    setLast(reply);
    setTalking(true);
    speak(reply.say);
    window.setTimeout(() => setTalking(false), 2500);
  };

  if (compact && !open) {
    return (
      <button
        type="button"
        className="fixed bottom-4 right-4 z-40 flex min-h-14 min-w-14 items-center gap-2 rounded-full bg-teal-700 px-4 text-sm font-semibold text-white"
        onClick={() => setOpen(true)}
        aria-label="Open clinic helper"
      >
        {HELPER_NAME}
      </button>
    );
  }

  return (
    <section
      className={cn(
        "rounded-2xl border border-teal-200 bg-teal-50 p-4",
        compact && "fixed bottom-4 right-4 z-40 w-[min(100%-2rem,22rem)] shadow-none"
      )}
      aria-label={`${HELPER_NAME} clinic helper`}
    >
      <div className="flex items-start gap-3">
        <div className="relative h-16 w-16 shrink-0" aria-hidden>
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-600 text-3xl text-white">
            <span className={cn("inline-block h-2 w-8 rounded-full bg-white", talking && "helper-mouth")} />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900">{HELPER_NAME}</h2>
            {compact ? (
              <button type="button" className="text-sm text-slate-600" onClick={() => setOpen(false)}>
                Close
              </button>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-slate-700">{answer.say}</p>
          <p className="mt-2 text-xs text-slate-600">{HELPER_DISCLAIMER}</p>
        </div>
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
          setQuestion("");
        }}
      >
        <label className="sr-only" htmlFor="helper-q">
          Ask Helper
        </label>
        <input
          id="helper-q"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask: how do I book?"
          className="min-h-11 flex-1 rounded-xl border border-slate-300 px-3 text-base"
        />
        <button type="submit" className="btn-primary">
          Ask
        </button>
      </form>
    </section>
  );
}
