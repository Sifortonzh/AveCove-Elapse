import Image from "next/image";

// Slots are stored on accounts. Never reorder or replace an existing slot.
const avatarAssets = ["1f411", "1f43a", "1f98a", "1f43c", "1f428", "1f431", "1f436", "1f430",
  "1f43b", "1f981", "1f42f", "1f439", "1f42d", "1f427", "1f989", "1f438"] as const;

export default function AccountAvatar({ slot, nickname }: { slot?: number; nickname: string }) {
  const asset = slot !== undefined && Number.isInteger(slot) && slot >= 0 ? avatarAssets[slot] : undefined;
  if (!asset) return <span aria-hidden="true">{Array.from(nickname.trim())[0]?.toUpperCase() || "红"}</span>;
  return <Image className="account-avatar-art" src={`/avatars/${asset}.svg`} alt="" width={36} height={36} unoptimized />;
}
