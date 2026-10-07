# AHAM

**A bidirectional haptic interface for a virtual hand.**

AHAM maps physical finger movement to a Unity virtual hand and returns synchronized contact cues through fingertip actuators. The project also explores participants' reported ownership of the virtual hand.

## Current status

Planning stage: this repository currently contains the project architecture and the team's 40-hour execution plan. Firmware, the Unity project and validated hardware results will be added during implementation.

## Planned prototype

- One glove with five flex-sensor finger-curl channels.
- VR controller/tracker input for hand-root position and orientation.
- Five independently controlled fingertip vibration motors.
- One index-fingertip pressure channel, subject to mechanism and release validation.
- A Unity scene with material-associated cues and an exploratory body-ownership demonstration.

Tendon resistance and GSR logging are stretch features. Vibration, local pressure and movement resistance are distinct feedback channels; the demonstration will identify the channels actually delivered.

## Architecture and schedule

Read the [full architecture and 40-hour build plan](AHAM-40-hour-plan.md) for hardware, software modules, communication, team assignments, validation and fallback decisions.

The plan assumes a four-person team and includes the approximately three-hour wait for components within the total forty-hour budget.

## First implementation milestone

By hour 13, demonstrate the complete loop:

**Real finger movement → virtual hand → virtual contact → matching fingertip vibration.**

Local actuator limits, command expiry and a direct mechanical release are required before adding worn mechanical feedback.
