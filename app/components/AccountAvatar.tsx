// Slot assignments stay fixed. Render Unicode via the OS emoji font, not Apple image files.
export const accountEmojis = ["🐏", "🐺", "🦊", "🐼", "🐨", "🐱", "🐶", "🐰",
  "🧑‍⚕️", "👩‍🔬", "👨‍🎓", "🧑‍💻", "👩‍🎨", "👨‍🚀", "🦉", "🐸"] as const;

export default function AccountAvatar({ slot }: { slot?: number }) {
  const emoji = slot !== undefined && Number.isInteger(slot) && slot >= 0 ? accountEmojis[slot] : undefined;
  return <span className="account-avatar-emoji" aria-hidden="true">{emoji ?? "👤"}</span>;
}
