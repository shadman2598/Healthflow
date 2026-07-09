"use client";

type AvatarProps = {
  name: string;
  size?: "sm" | "md" | "lg";
};

const sizeMap = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base"
};

const colorMap = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-purple-100 text-purple-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700"
];

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

export function Avatar({ name, size = "md" }: AvatarProps) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const color = colorMap[hashCode(name) % colorMap.length];

  return (
    <div className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${sizeMap[size]} ${color}`}>
      {initials}
    </div>
  );
}
