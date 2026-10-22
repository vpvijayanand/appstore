Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hWnd);
    public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

$proc = Get-Process -Name 'qemu-system-x86_64' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $proc) {
    Write-Host "Emulator window not found."
    exit 1
}
$hwnd = $proc.MainWindowHandle
$rect = New-Object Win32+RECT
[Win32]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
Write-Host "Before: Left=$($rect.Left) Top=$($rect.Top) Right=$($rect.Right) Bottom=$($rect.Bottom) Zoomed=$([Win32]::IsZoomed($hwnd))"

# Restore if maximized/minimized (SW_RESTORE = 9), then reposition to visible top-left area
[Win32]::ShowWindow($hwnd, 9) | Out-Null
$SWP_NOZORDER = 0x4
$SWP_SHOWWINDOW = 0x40
[Win32]::SetWindowPos($hwnd, [IntPtr]::Zero, 50, 50, 420, 900, $SWP_NOZORDER -bor $SWP_SHOWWINDOW) | Out-Null

[Win32]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
Write-Host "After:  Left=$($rect.Left) Top=$($rect.Top) Right=$($rect.Right) Bottom=$($rect.Bottom)"
