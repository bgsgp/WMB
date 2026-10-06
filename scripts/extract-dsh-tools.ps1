# extract-dsh-tools.ps1 - One-shot pipeline:
#   extract DSH tool schemas -> (optional) send digest to DeepSeek API -> (optional) git push via SSH.
#
# Usage:
#   .\extract-dsh-tools.ps1            # extract only, write docs\dsh-tools\*
#   .\extract-dsh-tools.ps1 -SendToDeepSeek -Push   # extract + send digest to DeepSeek + commit & push
#
# DeepSeek send is SKIPPED unless $env:DEEPSEEK_API_KEY is set (credentials stay in env, never in logs).
# The tool schemas belong to the DSH runtime only; they are stored under docs/dsh-tools/ as reference,
# never wired into WMB runtime code.

param(
  [switch]$SendToDeepSeek,
  [switch]$Push
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Asar = "D:\Program Files\DeepSeek Harness\resources\app.asar"
$OutDir = Join-Path $Root "docs\dsh-tools"

Write-Host "[1/3] extracting DSH tool schemas from $Asar"
node (Join-Path $PSScriptRoot "extract-dsh-tools.mjs") $Asar $OutDir
if ($LASTEXITCODE -ne 0) { throw "extract failed (exit $LASTEXITCODE)" }

# --- optional: send a digest to DeepSeek -------------------------------------
if ($SendToDeepSeek) {
  if (-not $env:DEEPSEEK_API_KEY) {
    Write-Host "[2/3] DEEPSEEK_API_KEY not set - skipping DeepSeek send (set it in env to enable)"
  } else {
    Write-Host "[2/3] sending tool list digest to DeepSeek ..."
    $digest = node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(j.map(t=>t.name).join(', '))" (Join-Path $OutDir "DSH工具提示-完整版.json")
    $body = @{
      model = "deepseek-chat"
      messages = @(
        @{ role = "system"; content = "You are a strict tool-schema auditor. Given the extracted DSH tool list, report: any schema that looks incomplete or truncated, and any duplicate names. Reply in Chinese, concise, bullet list only." },
        @{ role = "user"; content = "DSH extracted tool list: $digest" }
      )
      max_tokens = 500
    } | ConvertTo-Json -Depth 6
    try {
      $resp = Invoke-RestMethod -Uri "https://api.deepseek.com/chat/completions" -Method Post `
        -Headers @{ Authorization = "Bearer $env:DEEPSEEK_API_KEY" } `
        -ContentType "application/json; charset=utf-8" -Body $body -TimeoutSec 60
      Write-Host "  DeepSeek audit:"
      Write-Host "  " $resp.choices[0].message.content
    } catch {
      Write-Warning "DeepSeek send failed: $($_.Exception.Message) - continuing without it"
    }
  }
} else {
  Write-Host "[2/3] skipping DeepSeek send (use -SendToDeepSeek to enable)"
}

# --- optional: commit & push via SSH -----------------------------------------
if ($Push) {
  Write-Host "[3/3] committing and pushing via SSH ..."
  Set-Location $Root
  git add -A
  git commit -m "docs: sync DSH tool schema extraction (extract-dsh-tools)"
  git push origin main
  if ($LASTEXITCODE -ne 0) { throw "git push failed (exit $LASTEXITCODE)" }
  Write-Host "pushed to git@github.com:bgsgp/WMB.git (main)"
} else {
  Write-Host "[3/3] skipping push (use -Push to commit & push)"
}

Write-Host "done."
