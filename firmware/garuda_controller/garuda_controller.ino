// Garuda controller: ESP32-S3 + MPU6050 -> USB serial "roll,pitch,button,spin\n" @ 100 Hz
//   roll/pitch : tilt angles in degrees
//   button     : 1 while pressed
//   spin       : twist speed around the vertical axis in deg/s (spin the controller -> Garuda spins)
// Wiring: MPU6050 VCC->3V3, GND->GND, SDA->GPIO8, SCL->GPIO9. Button: GPIO4 to GND.
// Arduino IDE: Board "ESP32S3 Dev Module". Watch the Serial Monitor at 115200 for diagnostics.
//
// If the sensor is not found on GPIO8/9 the sketch searches every other pin pair
// and tells you where it found it, so you can see exactly how it is wired.
#include <Wire.h>

int SDA_PIN = 8;
int SCL_PIN = 9;
#define BTN_PIN 4
// Flip these if tilting the wrong way (the game also has R / I / Y keys to invert).
#define ROLL_SIGN  1.0f
#define PITCH_SIGN 1.0f
#define SPIN_SIGN  1.0f

uint8_t MPU = 0x68;
bool mpuOk = false;
bool searched = false;
float roll = 0, pitch = 0, gxBias = 0, gyBias = 0, gzBias = 0;
unsigned long lastUs, lastPrintMs, lastWarnMs;

void writeReg(uint8_t r, uint8_t v) { Wire.beginTransmission(MPU); Wire.write(r); Wire.write(v); Wire.endTransmission(); }

bool present(uint8_t addr) { Wire.beginTransmission(addr); return Wire.endTransmission() == 0; }

bool readRaw(int16_t *ax, int16_t *ay, int16_t *az, int16_t *gx, int16_t *gy, int16_t *gz) {
  Wire.beginTransmission(MPU); Wire.write(0x3B); Wire.endTransmission(false);
  if (Wire.requestFrom(MPU, (uint8_t)14) != 14) return false;
  *ax = Wire.read() << 8 | Wire.read();
  *ay = Wire.read() << 8 | Wire.read();
  *az = Wire.read() << 8 | Wire.read();
  Wire.read(); Wire.read();                 // temperature
  *gx = Wire.read() << 8 | Wire.read();
  *gy = Wire.read() << 8 | Wire.read();
  *gz = Wire.read() << 8 | Wire.read();
  return true;
}

// Tries every pair of usable GPIOs as SDA/SCL until a device answers at 0x68 or 0x69.
bool findPins() {
  const int pins[] = {1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 21, 38, 39, 40, 41, 42, 47, 48};
  const int n = sizeof(pins) / sizeof(pins[0]);
  Serial.println("Searching all pin pairs for the sensor (about 10 seconds)...");
  for (int i = 0; i < n; i++) {
    for (int j = 0; j < n; j++) {
      if (i == j || pins[i] == BTN_PIN || pins[j] == BTN_PIN) continue;
      Wire.end();
      Wire.begin(pins[i], pins[j]);
      Wire.setTimeOut(5);
      Wire.setClock(100000);
      if (present(0x68) || present(0x69)) {
        SDA_PIN = pins[i]; SCL_PIN = pins[j];
        Serial.printf("FOUND the sensor with SDA=GPIO%d and SCL=GPIO%d\n", SDA_PIN, SCL_PIN);
        Serial.println("Move your wires to GPIO8 (SDA) and GPIO9 (SCL), or change SDA_PIN / SCL_PIN at the top of the sketch.");
        Wire.end();
        Wire.begin(SDA_PIN, SCL_PIN);
        Wire.setClock(400000);
        return true;
      }
    }
  }
  Serial.println("No pin pair answered. The sensor's data wires (SDA/SCL) are not connected to any usable pin.");
  Serial.println("  - Make sure you use the SDA and SCL pads, NOT XDA / XCL.");
  Serial.println("  - Check the header pins are soldered and the wires are pushed in fully.");
  Wire.end();
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(400000);
  return false;
}

// Looks for the sensor, wakes it up and measures the gyro offsets. Returns true on success.
bool initMPU() {
  Serial.printf("I2C on SDA=GPIO%d SCL=GPIO%d. Scanning...\n", SDA_PIN, SCL_PIN);
  int found = 0;
  for (uint8_t a = 1; a < 127; a++) if (present(a)) { Serial.printf("  device at 0x%02X\n", a); found++; }
  if (!found) {
    Serial.println("  nothing found on these pins");
    if (!searched) { searched = true; if (findPins()) return initMPU(); }
    return false;
  }

  if (present(0x68)) MPU = 0x68; else if (present(0x69)) MPU = 0x69;
  else { Serial.println("  no MPU6050 at 0x68 or 0x69"); return false; }

  Wire.beginTransmission(MPU); Wire.write(0x75); Wire.endTransmission(false);
  Wire.requestFrom(MPU, (uint8_t)1);
  uint8_t who = Wire.available() ? Wire.read() : 0;
  Serial.printf("  MPU at 0x%02X, WHO_AM_I = 0x%02X\n", MPU, who);

  writeReg(0x6B, 0x00);   // wake
  writeReg(0x1A, 0x03);   // low-pass filter ~44 Hz
  writeReg(0x1B, 0x08);   // gyro +-500 dps
  writeReg(0x1C, 0x00);   // accel +-2 g
  delay(100);

  Serial.println("Calibrating gyro - keep the controller still for 1 second...");
  long sx = 0, sy = 0, sz = 0; int n = 0;
  for (int i = 0; i < 300; i++) {
    int16_t ax, ay, az, gx, gy, gz;
    if (readRaw(&ax, &ay, &az, &gx, &gy, &gz)) { sx += gx; sy += gy; sz += gz; n++; }
    delay(3);
  }
  if (!n) { Serial.println("  could not read the sensor"); return false; }
  gxBias = (float)sx / n; gyBias = (float)sy / n; gzBias = (float)sz / n;
  Serial.println("Ready. Streaming: roll,pitch,button,spin");
  return true;
}

void setup() {
  Serial.begin(115200);
  delay(1500);                                   // give the USB serial port time to appear
  Serial.println("\n=== Garuda controller ===");
  pinMode(BTN_PIN, INPUT_PULLUP);
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(400000);
  mpuOk = initMPU();
  lastUs = micros();
}

void loop() {
  if (!mpuOk) {
    // keep trying and keep telling the user what is wrong
    if (millis() - lastWarnMs > 3000) {
      lastWarnMs = millis();
      Serial.println("MPU6050 NOT FOUND - check wiring (SDA/SCL pins, 3V3, GND). Retrying...");
      mpuOk = initMPU();
      lastUs = micros();
    }
    return;
  }

  int16_t ax, ay, az, gx, gy, gz;
  if (!readRaw(&ax, &ay, &az, &gx, &gy, &gz)) {
    if (millis() - lastWarnMs > 2000) { lastWarnMs = millis(); Serial.println("lost contact with the MPU6050"); }
    return;
  }
  unsigned long now = micros();
  float dt = (now - lastUs) * 1e-6f;
  lastUs = now;

  float accRoll  = atan2f((float)ay, (float)az) * RAD_TO_DEG;
  float accPitch = atan2f(-(float)ax, sqrtf((float)ay * ay + (float)az * az)) * RAD_TO_DEG;
  float gRoll  = (gx - gxBias) / 65.5f;
  float gPitch = (gy - gyBias) / 65.5f;
  float spin   = (gz - gzBias) / 65.5f;     // deg/s around the vertical axis

  // complementary filter
  roll  = 0.98f * (roll  + gRoll  * dt) + 0.02f * accRoll;
  pitch = 0.98f * (pitch + gPitch * dt) + 0.02f * accPitch;

  if (millis() - lastPrintMs >= 10) {
    lastPrintMs = millis();
    Serial.printf("%.2f,%.2f,%d,%.1f\n", roll * ROLL_SIGN, pitch * PITCH_SIGN, digitalRead(BTN_PIN) == LOW ? 1 : 0, spin * SPIN_SIGN);
  }
}
