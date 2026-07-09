export function sanitizeText(input: string, maxLength = 5000): string {
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

export function maskHealthcareNumber(hcn: string): string {
  if (hcn.length <= 4) return "****";
  return `${"*".repeat(Math.max(0, hcn.length - 4))}${hcn.slice(-4)}`;
}
