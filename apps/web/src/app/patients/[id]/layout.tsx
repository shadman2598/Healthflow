export function generateStaticParams() {
  return [{ id: "preview" }];
}

export default function PatientIdLayout({ children }: { children: React.ReactNode }) {
  return children;
}
