"use client";

import { useState } from "react";
import { IconSend } from "../../../components/ui/Icons";

const mockMessages = [
  { id: "1", from: "clinic", text: "Hi Jane! Your appointment with Dr. Chen is confirmed for March 15 at 2:30 PM.", time: "10:30 AM" },
  { id: "2", from: "patient", text: "Thank you! Do I need to bring any documents?", time: "10:45 AM" },
  { id: "3", from: "clinic", text: "Please bring your insurance card and a photo ID. If you have any recent lab results, those would be helpful too.", time: "11:02 AM" },
  { id: "4", from: "patient", text: "Got it, thanks!", time: "11:05 AM" }
];

export default function PatientMessagesPage() {
  const [input, setInput] = useState("");

  return (
    <div className="flex h-[calc(100vh-10rem)] flex-col">
      {/* Chat header */}
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-slate-900">Messages</h1>
        <p className="text-sm text-slate-500">Chat with Technovate Main Clinic</p>
      </div>

      {/* Messages */}
      <div className="card flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {mockMessages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.from === "patient" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                msg.from === "patient"
                  ? "rounded-br-md bg-brand-600 text-white"
                  : "rounded-bl-md bg-slate-100 text-slate-800"
              }`}>
                <p className="text-sm">{msg.text}</p>
                <p className={`mt-1 text-right text-[10px] ${
                  msg.from === "patient" ? "text-blue-200" : "text-slate-400"
                }`}>
                  {msg.time}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          className="flex-1"
        />
        <button className="btn-primary px-4">
          <IconSend className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
