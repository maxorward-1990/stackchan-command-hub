#include "../src/DialogueResetPolicy.h"
#include <cassert>
#include <string>
struct Store {
  bool marker = false, hasBackup = false, renameFails = false, markFails = false;
  std::string dialogue = "unverified transcript", backup, facts = "owner facts", settings = "owner settings";
  int renames = 0;
  bool marked() { return marker; }
  bool archived() { return hasBackup; }
  bool hasDialogue() { return !dialogue.empty(); }
  bool archive() {
    if (renameFails) return false;
    ++renames; backup = dialogue; dialogue.clear(); hasBackup = true; return true;
  }
  bool mark() { if (markFails) return false; marker = true; return true; }
};
int main() {
  Store s;
  assert(DialogueResetPolicy::archiveOnce(s));
  assert(s.dialogue.empty() && s.backup == "unverified transcript");
  assert(s.facts == "owner facts" && s.settings == "owner settings");
  s.dialogue = "new conversation";
  assert(DialogueResetPolicy::archiveOnce(s) && s.renames == 1 && s.dialogue == "new conversation");
  Store renameFailure; renameFailure.renameFails = true;
  assert(!DialogueResetPolicy::archiveOnce(renameFailure));
  assert(renameFailure.dialogue == "unverified transcript" && !renameFailure.marker);
  Store interrupted; interrupted.markFails = true;
  assert(!DialogueResetPolicy::archiveOnce(interrupted) && interrupted.renames == 1);
  interrupted.dialogue = "new conversation"; interrupted.markFails = false;
  assert(DialogueResetPolicy::archiveOnce(interrupted));
  assert(interrupted.renames == 1 && interrupted.dialogue == "new conversation" && interrupted.backup == "unverified transcript");
  Store empty; empty.dialogue.clear();
  assert(DialogueResetPolicy::archiveOnce(empty) && empty.renames == 0);
}