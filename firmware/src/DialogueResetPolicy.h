#pragma once
// Explicit v64 reset of active raw dialogue only: keep the original as an archive.
// If marking fails after rename, retry marking, never archive new conversations.
namespace DialogueResetPolicy {
template <typename Store> bool archiveOnce(Store& store) {
  if (store.marked()) return true;
  if (!store.archived() && store.hasDialogue() && !store.archive()) return false;
  return store.mark();
}
}