#include "../src/ConversationStartPolicy.h"
#include <cassert>
#include <vector>
using namespace ConversationStartPolicy;
int main() {
  static_assert(chunkSamples * chunks * sizeof(int16_t) == 192000);
  std::vector<int16_t> storage(chunkSamples * chunks), input(chunkSamples);
  Queue q; q.pcm = storage.data();
  for (size_t i = 0; i < chunks; ++i) { input[0] = i + 1; assert(q.push(input.data())); }
  input[0] = 99; assert(!q.push(input.data())); // no silent overwrite at 6s
  for (size_t i = 0; i < chunks; ++i) { assert(q.front() && q.front()[0] == int(i + 1)); q.pop(); }
  assert(!q.front());
  assert(q.push(input.data())); q.clear(); assert(!q.front() && q.count == 0);
  assert(!warmExpired(59999, 0)); assert(warmExpired(60000, 0));
  assert(warmExpired(59989, UINT32_MAX - 10)); // millis wrap
}