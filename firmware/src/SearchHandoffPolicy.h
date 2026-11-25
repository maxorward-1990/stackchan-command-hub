#pragma once
#include <cstddef>
// A fresh Live turn carries the result; old tool IDs never cross connections.
namespace SearchHandoffPolicy {
constexpr size_t queryBytes = 600;
constexpr size_t resultBytes = 12288;
constexpr size_t packetBytes = 16384;
enum class Stage { Idle, Queued, Searching, Reconnecting, Answering };
class Gate {
 public:
  Stage stage = Stage::Idle;
  bool active() const { return stage != Stage::Idle; }
  bool waiting() const { return active() && stage != Stage::Answering; }
  bool queue(size_t bytes, bool available, bool busy) {
    if (active() || !available || busy || !bytes || bytes > queryBytes) return false;
    stage = Stage::Queued; return true;
  }
  void searching() { stage = Stage::Searching; }
  bool result(size_t bytes) {
    if (stage != Stage::Searching || !bytes || bytes > resultBytes) return false;
    stage = Stage::Reconnecting; return true;
  }
  bool ready() {
    if (stage != Stage::Reconnecting) return false;
    stage = Stage::Answering; return true;
  }
  void cancel() { stage = Stage::Idle; }
};
}