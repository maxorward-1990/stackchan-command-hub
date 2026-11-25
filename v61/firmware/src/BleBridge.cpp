#include "BleBridge.h"
#include <NimBLEDevice.h>
#include <esp_random.h>

namespace {
const char* kSvc = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const char* kRx  = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";  // phone -> robot (write)
const char* kTx  = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";  // robot -> phone (notify)
constexpr size_t kMaxLine = 6144, kMaxQueued = 4;

bool g_enabled = false;
volatile bool g_connected = false;
volatile bool g_stopping = false;     // set while deinit runs: no re-advertising
volatile bool g_readvertise = false;  // restart advertising from loop, not the NimBLE host task
uint32_t g_pin = 0;
NimBLECharacteristic* g_tx = nullptr;
portMUX_TYPE g_mux = portMUX_INITIALIZER_UNLOCKED;
String g_partial;
String g_queue[kMaxQueued];
size_t g_head = 0, g_count = 0;
uint16_t g_mtu = 23;

class ServerCb : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer*, ble_gap_conn_desc* d) override {
    g_connected = true; Serial.println("BLE: connected");
    NimBLEDevice::startSecurity(d->conn_handle);
  }
  void onDisconnect(NimBLEServer*) override {
    g_connected = false; g_mtu = 23; Serial.println("BLE: disconnected");
    // Restarting advertising inside the callback raced deinit and crashed (heap_caps_free assert).
    if (!g_stopping) g_readvertise = true;
  }
  void onMTUChange(uint16_t mtu, ble_gap_conn_desc*) override { g_mtu = mtu; }
  uint32_t onPassKeyRequest() override { return g_pin; }
  void onAuthenticationComplete(ble_gap_conn_desc* d) override {
    Serial.printf("BLE: pairing %s\n", d->sec_state.encrypted ? "ok" : "failed");
  }
};
class RxCb : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* c) override {
    std::string v = c->getValue();
    portENTER_CRITICAL(&g_mux);
    for (char ch : v) {
      if (ch == '\n' || ch == '\r') {
        if (g_partial.length() && g_count < kMaxQueued) {
          g_queue[(g_head + g_count) % kMaxQueued] = g_partial; ++g_count;
        }
        g_partial = "";
      } else if (g_partial.length() < kMaxLine) g_partial += ch;
    }
    portEXIT_CRITICAL(&g_mux);
  }
};
ServerCb g_serverCb; RxCb g_rxCb;
}  // namespace

namespace BleBridge {
bool begin(const String& name) {
  if (g_enabled) return true;
  g_stopping = false; g_readvertise = false;
  g_pin = 100000 + (esp_random() % 900000);
  NimBLEDevice::init(name.c_str());
  NimBLEDevice::setMTU(247);
  NimBLEDevice::setPower(ESP_PWR_LVL_P6);
  NimBLEDevice::setSecurityAuth(true, true, true);           // bond + MITM + secure connections
  NimBLEDevice::setSecurityPasskey(g_pin);
  NimBLEDevice::setSecurityIOCap(BLE_HS_IO_DISPLAY_ONLY);    // PIN is shown on the LCD
  NimBLEServer* s = NimBLEDevice::createServer();
  s->setCallbacks(&g_serverCb);
  NimBLEService* svc = s->createService(kSvc);
  g_tx = svc->createCharacteristic(kTx, NIMBLE_PROPERTY::NOTIFY | NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::READ_ENC | NIMBLE_PROPERTY::READ_AUTHEN);
  NimBLECharacteristic* rx = svc->createCharacteristic(kRx, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR | NIMBLE_PROPERTY::WRITE_ENC | NIMBLE_PROPERTY::WRITE_AUTHEN);
  rx->setCallbacks(&g_rxCb);
  svc->start();
  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  adv->addServiceUUID(kSvc);
  adv->setScanResponse(true);
  bool ok = adv->start();
  g_enabled = ok;
  Serial.printf("BLE: %s name=%s pin=%06u\n", ok ? "advertising" : "start failed", name.c_str(), (unsigned)g_pin);
  return ok;
}
void end() {
  if (!g_enabled) return;
  g_stopping = true; g_readvertise = false;
  g_enabled = false; g_tx = nullptr;
  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  if (adv && adv->isAdvertising()) adv->stop();
  NimBLEDevice::deinit(true);
  g_connected = false;
  portENTER_CRITICAL(&g_mux); g_count = 0; g_partial = ""; portEXIT_CRITICAL(&g_mux);
  Serial.println("BLE: off");
}
bool enabled() { return g_enabled; }
bool connected() { return g_enabled && g_connected; }
uint32_t pin() { return g_pin; }
bool takeLine(String& out) {
  if (g_readvertise && g_enabled && !g_stopping && !g_connected) {
    g_readvertise = false;
    NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
    if (adv && !adv->isAdvertising()) adv->start();
  }
  bool got = false;
  portENTER_CRITICAL(&g_mux);
  if (g_count) { out = g_queue[g_head]; g_queue[g_head] = ""; g_head = (g_head + 1) % kMaxQueued; --g_count; got = true; }
  portEXIT_CRITICAL(&g_mux);
  return got;
}
void sendLine(const String& line) {
  if (!connected() || !g_tx) return;
  String all = line + "\n";
  size_t chunk = g_mtu > 23 ? g_mtu - 3 : 20;
  if (chunk > 244) chunk = 244;
  for (size_t i = 0; i < all.length(); i += chunk) {
    String part = all.substring(i, i + chunk);
    g_tx->setValue(reinterpret_cast<const uint8_t*>(part.c_str()), part.length());
    g_tx->notify();
    delay(4);
  }
}
}  // namespace BleBridge
