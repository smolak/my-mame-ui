# Lists visible top-level windows as JSON: pid, process name, window class, title.
# Used by app-modes.ts to see whether spawning mame.exe shows a console window, and whether windowsHide hides the game window.
Add-Type @"
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class Win {
  delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr p);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  public static List<string[]> Visible() {
    var r = new List<string[]>();
    EnumWindows((h, p) => {
      if (!IsWindowVisible(h)) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      var t = new StringBuilder(256); GetWindowText(h, t, 256);
      var c = new StringBuilder(256); GetClassName(h, c, 256);
      r.Add(new[] { pid.ToString(), c.ToString(), t.ToString() });
      return true;
    }, IntPtr.Zero);
    return r;
  }
}
"@
$rows = foreach ($w in [Win]::Visible()) {
  $p = Get-Process -Id ([int]$w[0]) -ErrorAction SilentlyContinue
  [pscustomobject]@{ pid = [int]$w[0]; process = $p.ProcessName; class = $w[1]; title = $w[2] }
}
@($rows) | ConvertTo-Json -Compress
