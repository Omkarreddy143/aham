using System;

namespace Aham
{
    // Gravity-derived roll/pitch for slow tilt. No position, yaw or gyro fusion.
    public static class ImuTilt
    {
        public static bool TryAngles(ImuTelemetry imu, out float roll, out float pitch)
        {
            roll = pitch = 0;
            if (imu == null || !imu.Valid) return false;
            double x = imu.Accel[0] / 16384.0, y = imu.Accel[1] / 16384.0, z = imu.Accel[2] / 16384.0;
            double g = Math.Sqrt(x*x + y*y + z*z);
            if (g < .75 || g > 1.25) return false;
            roll = (float)(Math.Atan2(y, z) * 180 / Math.PI);
            pitch = (float)(Math.Atan2(-x, Math.Sqrt(y*y + z*z)) * 180 / Math.PI);
            return true;
        }
    }
}
