export function generateStaticParams() {
  return [{ id: "preview" }];
}

export default function AppointmentIdLayout({ children }: { children: React.ReactNode }) {
  return children;
}
