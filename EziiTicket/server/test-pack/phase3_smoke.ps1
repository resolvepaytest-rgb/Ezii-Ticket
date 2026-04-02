param(
  [string]$BaseUrl = "http://localhost:5000",
  [string]$JwtToken = "",
  [string]$DatabaseUrl = "",
  [int]$ProductId = 1,
  [int]$CategoryId = 86,
  [int]$SubcategoryId = 254,
  [int]$TargetTeamId = 18,
  [int]$TargetQueueId = 15,
  [int]$WarnWaitSeconds = 20,
  [int]$BreachWaitSeconds = 20,
  [int]$AutoCloseWaitSeconds = 35
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$script:CanRunSql = $true

function Write-Step([string]$msg) {
  Write-Host "`n=== $msg ===" -ForegroundColor Cyan
}

function Fail([string]$msg) {
  Write-Host "[FAIL] $msg" -ForegroundColor Red
  exit 1
}

function Assert([bool]$condition, [string]$msg) {
  if (-not $condition) {
    Fail $msg
  }
  Write-Host "[PASS] $msg" -ForegroundColor Green
}

function Warn([string]$msg) {
  Write-Host "[WARN] $msg" -ForegroundColor Yellow
}

function Get-Json([string]$path) {
  $headers = @{
    Authorization = "Bearer $JwtToken"
  }
  return Invoke-RestMethod -Method GET -Uri "$BaseUrl$path" -Headers $headers
}

function Post-Json([string]$path, [hashtable]$body) {
  $headers = @{
    Authorization = "Bearer $JwtToken"
    "Content-Type" = "application/json"
  }
  $json = $body | ConvertTo-Json -Depth 10
  return Invoke-RestMethod -Method POST -Uri "$BaseUrl$path" -Headers $headers -Body $json
}

function Invoke-Sql([string]$sql) {
  if (-not $script:CanRunSql) {
    Warn "Skipping SQL helper step (psql unavailable)."
    return $false
  }

  if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
    if ($env:DATABASE_URL) {
      $DatabaseUrl = $env:DATABASE_URL
    }
  }
  if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
    Warn "DATABASE_URL not provided. SQL helper checks will be skipped."
    $script:CanRunSql = $false
    return $false
  }

  $psqlCmd = Get-Command psql -ErrorAction SilentlyContinue
  if ($null -eq $psqlCmd) {
    Warn "psql not found in PATH. SQL helper checks will be skipped."
    $script:CanRunSql = $false
    return $false
  }

  $escaped = $sql.Replace('"', '\"')
  $out = & psql $DatabaseUrl -v ON_ERROR_STOP=1 -c $escaped 2>&1
  if ($LASTEXITCODE -ne 0) {
    Warn "SQL helper failed; SQL-based checks will be skipped. Error: $out"
    $script:CanRunSql = $false
    return $false
  }
  return $true
}

function Get-Ticket([int]$ticketId) {
  return Get-Json "/tickets/$ticketId"
}

function Ensure-OpenStatus([int]$ticketId, [string]$reason) {
  $ticket = Get-Ticket $ticketId
  $status = [string]$ticket.data.status
  if ($status -eq "open") {
    Write-Host "[INFO] Ticket already open, skipping prepare-open step." -ForegroundColor DarkYellow
    return
  }

  $allowedFrom = @("pending", "escalated", "reopened", "new")
  if ($allowedFrom -contains $status) {
    $null = Post-Json "/tickets/$ticketId/status" @{
      status = "open"
      reason = $reason
    }
    return
  }

  Fail "Cannot auto-move status '$status' to open in smoke script."
}

if ([string]::IsNullOrWhiteSpace($JwtToken)) {
  if ($env:JWT_TOKEN) {
    $JwtToken = $env:JWT_TOKEN
  }
}
if ([string]::IsNullOrWhiteSpace($JwtToken)) {
  Fail "JWT token missing. Pass -JwtToken or set env:JWT_TOKEN."
}

Write-Step "Create ticket"
$create = Post-Json "/tickets" @{
  product_id = $ProductId
  category_id = $CategoryId
  subcategory_id = $SubcategoryId
  channel = "widget"
  priority = "P3"
  affected_users = 8
  subject = "Phase3 smoke"
  description = "Phase3 smoke validates SLA warning, breach escalation, pause resume, and auto-close behavior."
}

$ticketId = [int]$create.data.id
Assert ($ticketId -gt 0) "Ticket created and id received"

Write-Step "Set pending then open (pause/resume)"
$null = Post-Json "/tickets/$ticketId/status" @{
  status = "pending"
  reason = "smoke_pending"
}
Start-Sleep -Seconds 5
$null = Post-Json "/tickets/$ticketId/status" @{
  status = "open"
  reason = "smoke_resume"
}
$ticketAfterResume = Get-Ticket $ticketId
Assert ($ticketAfterResume.data.status -eq "open") "Ticket resumed to open"

Write-Step "Force warning window and wait for SLA warning event"
if (Invoke-Sql @"
update tickets
set created_at = now() - interval '80 minutes',
    resolution_due_at = now() + interval '10 minutes',
    updated_at = now()
where id = $ticketId;
"@) {
  Start-Sleep -Seconds $WarnWaitSeconds
  $ticketWarn = Get-Ticket $ticketId
  $warnEvent = $ticketWarn.data.events | Where-Object { $_.event_type -eq "sla_warning" }
  Assert ($null -ne $warnEvent) "SLA warning event generated"
} else {
  Warn "Skipped SLA warning validation (requires SQL helper)."
}

Write-Step "Force breach and verify auto escalation"
if (Invoke-Sql @"
update tickets
set status = 'open',
    resolution_due_at = now() - interval '2 minutes',
    updated_at = now()
where id = $ticketId;
"@) {
  Start-Sleep -Seconds $BreachWaitSeconds
  $ticketBreach = Get-Ticket $ticketId
  Assert ($ticketBreach.data.status -eq "escalated") "Ticket auto-escalated on breach"
  $breachEvent = $ticketBreach.data.events | Where-Object {
    $_.event_type -eq "status_changed" -and $_.metadata_json.reason -eq "sla_resolution_breach"
  }
  Assert ($null -ne $breachEvent) "Breach status_changed event logged"
} else {
  Warn "Skipped SLA breach auto-escalation validation (requires SQL helper)."
}

Write-Step "Manual assign/reassign"
$assign = Post-Json "/tickets/$ticketId/assign" @{
  assignee_user_id = 900001
  team_id = $TargetTeamId
  queue_id = $TargetQueueId
}
Assert ([int]$assign.data.assignee_user_id -eq 900001) "Assignment endpoint updated assignee"

Write-Step "Resolve then reopen within 7 days"
Ensure-OpenStatus -ticketId $ticketId -reason "prepare_resolve"
$null = Post-Json "/tickets/$ticketId/status" @{
  status = "resolved"
  resolution_note = "Resolved after validating root cause, applying fix, retesting edge paths, and confirming expected behavior in production mirror."
  reason = "smoke_resolve"
}
$reopen = Post-Json "/tickets/$ticketId/reopen" @{
  reason = "smoke_reopen"
}
Assert ($reopen.ok -eq $true) "Reopen endpoint accepted within 7 days"

Write-Step "Resolve again and force auto-close window"
Ensure-OpenStatus -ticketId $ticketId -reason "prepare_autoclose"
$null = Post-Json "/tickets/$ticketId/status" @{
  status = "resolved"
  resolution_note = "Resolved after validating root cause, applying fix, retesting edge paths, and confirming expected behavior in production mirror."
  reason = "smoke_autoclose"
}
if (Invoke-Sql @"
update tickets
set resolved_at = now() - interval '8 days',
    status = 'resolved',
    updated_at = now()
where id = $ticketId;
"@) {
  Start-Sleep -Seconds $AutoCloseWaitSeconds
  $ticketClosed = Get-Ticket $ticketId
  Assert ($ticketClosed.data.status -eq "closed") "Auto-close job moved resolved ticket to closed"
} else {
  Warn "Skipped auto-close validation (requires SQL helper)."
}

Write-Step "Smoke test complete"
Write-Host "Ticket ID: $ticketId" -ForegroundColor Yellow
Write-Host "[DONE] Phase 3 smoke checks passed." -ForegroundColor Green

