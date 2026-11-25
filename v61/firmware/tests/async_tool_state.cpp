#include "../src/AsyncToolState.h"
#include <cassert>

int main() {
  AsyncToolState state;
  uint32_t first = 0, second = 0;
  assert(state.start(first));
  assert(state.busy());
  assert(!state.start(second)); // Only one worker can own the candidate cache.
  state.cancel();
  assert(state.busy()); // Cancellation does not release a still-running TLS worker.
  assert(!state.complete(first));
  assert(!state.take()); // A disconnected conversation never receives stale data.
  assert(state.start(second));
  assert(second != first);
  assert(state.complete(second));
  assert(state.take());
  assert(!state.take()); // Each result is delivered once.
  assert(state.start(first));
  state.dispatchFailed();
  assert(!state.busy());
  assert(!state.take());
  assert(state.start(second));
  assert(state.complete(second));
  state.cancel();
  assert(!state.take()); // Cancellation also removes an already-completed result.
}