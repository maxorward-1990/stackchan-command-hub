#pragma once
#include "LiveSetupMemory.h"
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/idf_additions.h>

namespace WebResearchMemory {
inline constexpr size_t stackBytes = 24576;
inline constexpr size_t responseBytes = 48 * 1024;
inline constexpr size_t resultBytes = 12 * 1024;
// SDK-supported external stack; this worker must never write flash/NVS.
// No internal fallback: preserve Live's scarce TLS/AES heap on failure.
inline BaseType_t createWorker(TaskFunction_t fn, TaskHandle_t* handle) {
#if CONFIG_FREERTOS_TASK_CREATE_ALLOW_EXT_MEM
  return xTaskCreateWithCaps(fn, "web-research", stackBytes, nullptr, 1,
                             handle, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
#else
  return pdFAIL;
#endif
}
}