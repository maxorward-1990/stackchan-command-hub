#pragma once
// Live MJPEG stream on its own small HTTP server (port 81) so a long-lived
// viewer never blocks the main web server, touch or servo handling.
#include <Arduino.h>
#include <functional>
class CameraCapture;

namespace CameraStream {
using AuthCheck = std::function<bool(const String& authorizationHeader)>;
bool begin(CameraCapture& camera, AuthCheck auth);
bool active();            // a viewer is connected right now
void setVoiceBusy(bool busy);  // main loop: refuse new viewers during a voice turn
void requestStop();       // touch tap / API: end the current stream
uint32_t framesSent();
}  // namespace CameraStream
