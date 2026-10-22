Add-Type @"
using System;
using System.Runtime.InteropServices;
public class W2 {
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
$proc = Get-Process -Name 'qemu-system-x86_64' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if ($proc) {
    $rect = New-Object W2+RECT
    [W2]::GetWindowRect($proc.MainWindowHandle, [ref]$rect) | Out-Null
    Write-Host "L=$($rect.Left) T=$($rect.Top) R=$($rect.Right) B=$($rect.Bottom) Width=$($rect.Right-$rect.Left) Height=$($rect.Bottom-$rect.Top)"
} else {
    Write-Host "Window not found"
}
