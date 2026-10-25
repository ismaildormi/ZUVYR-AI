# ZUVYR Studio — target-machine inventory (Phase 2 gate)
# Collects every hardware/software fact the full-mode plan depends on.
# Run on the REAL target machine (Windows PowerShell 5.1+ or pwsh 7):
#   powershell -ExecutionPolicy Bypass -File scripts\inventory_windows.ps1
# Paste/email the output back; nothing is installed or modified.

$ErrorActionPreference = "SilentlyContinue"
function Section($t) { Write-Host "`n===== $t =====" }

Section "OS"
Get-CimInstance Win32_OperatingSystem | `
    Select-Object Caption, Version, BuildNumber, OSArchitecture | Format-List

Section "CPU"
Get-CimInstance Win32_Processor | `
    Select-Object Name, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed | Format-List

Section "RAM"
$os = Get-CimInstance Win32_OperatingSystem
"Installed : {0:N1} GB" -f ($os.TotalVisibleMemorySize / 1MB)
"Available : {0:N1} GB" -f ($os.FreePhysicalMemory / 1MB)

Section "GPU (NVIDIA + others)"
Get-CimInstance Win32_VideoController | `
    Select-Object Name, AdapterRAM, DriverVersion | Format-List
nvidia-smi --query-gpu=name,memory.total,driver_version,compute_cap --format=csv
if (-not $?) { "nvidia-smi: NOT FOUND (no NVIDIA driver on PATH)" }

Section "CUDA runtime probe (torch, if installed)"
python -c "import torch; print('torch', torch.__version__, '| cuda available:', torch.cuda.is_available(), '| device:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'none')" 2>$null
if (-not $?) { "torch: not installed in this python (fine - ZUVYR venv is separate)" }

Section "Disk (all fixed volumes, free space)"
Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | `
    Select-Object DeviceID, `
    @{n="SizeGB";e={[math]::Round($_.Size/1GB,1)}}, `
    @{n="FreeGB";e={[math]::Round($_.FreeSpace/1GB,1)}} | Format-Table

Section "Toolchain"
foreach ($tool in @("python", "python3", "py", "node", "npm", "git", "ffmpeg", "ollama")) {
    $v = & $tool --version 2>$null | Select-Object -First 1
    if ($v) { "{0,-10} {1}" -f $tool, $v } else { "{0,-10} NOT FOUND" -f $tool }
}
$comfy = Get-ChildItem -Path "$PWD\video-studio\external\ComfyUI" -ErrorAction SilentlyContinue
"ComfyUI    : " + $(if ($comfy) { "present at video-studio\external\ComfyUI" } else { "not installed" })

Section "Network reachability"
foreach ($url in @("https://github.com", "https://pypi.org", "https://huggingface.co")) {
    try {
        $r = Invoke-WebRequest -Uri $url -Method Head -TimeoutSec 8 -UseBasicParsing
        "{0,-28} HTTP {1}" -f $url, $r.StatusCode
    } catch {
        "{0,-28} FAILED: {1}" -f $url, $_.Exception.Message
    }
}

Section "ZUVYR doctor (if the venv exists)"
if (Test-Path "$PWD\video-studio\.venv\Scripts\python.exe") {
    & "$PWD\video-studio\.venv\Scripts\python.exe" "$PWD\video-studio\bin\zuvyr" doctor
} else {
    "venv not created yet - run scripts/bootstrap.sh (or the README quick start) first"
}

Write-Host "`n===== END INVENTORY ====="
