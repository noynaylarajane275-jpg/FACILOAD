$ErrorActionPreference = 'Stop'
$root = $args[0]

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = 'cmd.exe'
$psi.Arguments = "/c cd /d `"$root`" && npm run dev --workspace apps/api"
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.UseShellExecute = $false
$proc = New-Object System.Diagnostics.Process
$proc.StartInfo = $psi
$proc.Start() | Out-Null

$finished = $proc.WaitForExit(15000)
if (-not $finished) {
    $proc.Kill()
    Write-Host 'DEV_SERVER_TIMED_OUT'
    exit 0
}
Write-Host 'DEV_SERVER_EXIT_CODE="' + $proc.ExitCode + '"'


