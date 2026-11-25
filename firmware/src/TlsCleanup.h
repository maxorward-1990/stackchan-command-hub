#pragma once
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
// Closes HTTP + TLS socket on every exit path so a failed handshake never
// leaves an fd behind that stalls the next Gemini/Tavily/Tuya connection.
struct TlsCleanup {
  HTTPClient* http; WiFiClientSecure& client;
  ~TlsCleanup() { if (http) http->end(); client.stop(); }
};
