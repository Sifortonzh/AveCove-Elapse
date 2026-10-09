type BankRevision = { id: string; updatedAt?: string };
export function bankRevisions(banks: BankRevision[]) {
  return Object.fromEntries(banks.map((bank) => [bank.id, bank.updatedAt ?? ""]));
}
export function banksNeedingTransfer<T extends BankRevision>(banks: T[], known: Record<string, string>): T[] {
  return banks.filter((bank) => !(bank.id in known) || (bank.updatedAt ?? "") > known[bank.id]);
}
