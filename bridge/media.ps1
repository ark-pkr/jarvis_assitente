# Windows media keys and the master volume. One request as JSON on stdin, one
# JSON result on stdout. The action names are fixed here as well as in
# daily.mjs, so nothing the model says can reach this script as code.
$ErrorActionPreference = 'Stop'
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int _0(); int _1(); int _2(); int _3();
  int SetMasterVolumeLevelScalar(float level, ref Guid context);
  int _5();
  int GetMasterVolumeLevelScalar(out float level);
  int _7(); int _8(); int _9(); int _10();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid context);
  int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  int Activate(ref Guid id, int context, IntPtr parameters, [MarshalAs(UnmanagedType.IUnknown)] out object endpoint);
}
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  int _0();
  int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice device);
}
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class DeviceEnumerator {}

public static class JarvisMedia {
  [DllImport("user32.dll")]
  static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);

  public static void Press(byte key) {
    keybd_event(key, 0, 1, UIntPtr.Zero);
    keybd_event(key, 0, 3, UIntPtr.Zero);
  }

  static IAudioEndpointVolume Endpoint() {
    var enumerator = (IMMDeviceEnumerator)new DeviceEnumerator();
    IMMDevice device; object endpoint;
    Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out device));
    var id = typeof(IAudioEndpointVolume).GUID;
    Marshal.ThrowExceptionForHR(device.Activate(ref id, 23, IntPtr.Zero, out endpoint));
    return (IAudioEndpointVolume)endpoint;
  }

  public static int Volume() {
    float level;
    Marshal.ThrowExceptionForHR(Endpoint().GetMasterVolumeLevelScalar(out level));
    return (int)Math.Round(level * 100);
  }

  public static bool Muted() {
    bool muted;
    Marshal.ThrowExceptionForHR(Endpoint().GetMute(out muted));
    return muted;
  }

  public static void SetVolume(int percent) {
    var context = Guid.Empty;
    Marshal.ThrowExceptionForHR(Endpoint().SetMasterVolumeLevelScalar(percent / 100f, ref context));
  }

  public static void SetMuted(bool muted) {
    var context = Guid.Empty;
    Marshal.ThrowExceptionForHR(Endpoint().SetMute(muted, ref context));
  }
}
'@

$keys = @{ play_pause = 0xB3; next = 0xB0; previous = 0xB1; stop = 0xB2 }
$action = [string]$request.action
if ($keys.ContainsKey($action)) {
  [JarvisMedia]::Press([byte]$keys[$action])
} elseif ($action -eq 'set_volume') {
  [JarvisMedia]::SetVolume([Math]::Max(0, [Math]::Min(100, [int]$request.percent)))
} elseif ($action -eq 'mute') {
  [JarvisMedia]::SetMuted($true)
} elseif ($action -eq 'unmute') {
  [JarvisMedia]::SetMuted($false)
} elseif ($action -ne 'get_volume') {
  throw 'Acao de midia desconhecida.'
}
@{ volume = [JarvisMedia]::Volume(); muted = [JarvisMedia]::Muted() } | ConvertTo-Json -Compress
