import { redirect } from "next/navigation";

/** Legacy mock chat — production messaging lives at /messages. */
export default function PatientMessagesRedirectPage() {
  redirect("/messages");
}
