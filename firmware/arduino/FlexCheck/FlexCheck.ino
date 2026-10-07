// First check: one flex sensor, USB power, no motor connection.
#include <Arduino.h>
#include <ESP8266WiFi.h>
#if !defined(ESP8266)
#error "Select NodeMCU 1.0 (ESP-12E Module)."
#endif

void setup() {
  digitalWrite(D5, LOW);
  pinMode(D5, OUTPUT);
  // Keep optional PCA9685 output-enable HIGH; no servo connection is needed.
  digitalWrite(D7, HIGH);
  pinMode(D7, OUTPUT);
  WiFi.persistent(false);
  WiFi.mode(WIFI_OFF);
  Serial.begin(115200);
  Serial.println("AHAM: bend only the index flex sensor; motor disconnected.");
}

void loop() {
  Serial.println(analogRead(A0));  // ESP8266 count: 0..1023, not a finger angle.
  delay(50);
}
