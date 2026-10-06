param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\backups")
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($env:SUPABASE_DB_URL)) {
  throw "SUPABASE_DB_URL 환경변수가 필요합니다. 연결 문자열을 파일이나 명령행 인수로 남기지 마세요."
}
if ([string]::IsNullOrWhiteSpace($env:BACKUP_ENCRYPTION_PASSPHRASE) -or $env:BACKUP_ENCRYPTION_PASSPHRASE.Length -lt 24) {
  throw "BACKUP_ENCRYPTION_PASSPHRASE는 24자 이상이어야 합니다."
}
if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) { throw "pg_dump가 설치되어 있지 않습니다." }
if (-not (Get-Command pg_restore -ErrorAction SilentlyContinue)) { throw "pg_restore가 설치되어 있지 않습니다." }
if (-not (Get-Command openssl -ErrorAction SilentlyContinue)) { throw "openssl이 설치되어 있지 않습니다." }

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$plain = Join-Path $OutputDirectory "payroll-$stamp.dump"
$encrypted = "$plain.enc"

try {
  & pg_dump $env:SUPABASE_DB_URL --format=custom --no-owner --no-privileges --file=$plain
  if ($LASTEXITCODE -ne 0) { throw "pg_dump가 실패했습니다." }
  & pg_restore --list $plain | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "생성된 백업을 읽을 수 없습니다." }
  $env:BACKUP_PASSPHRASE_INTERNAL = $env:BACKUP_ENCRYPTION_PASSPHRASE
  & openssl enc -aes-256-cbc -pbkdf2 -salt -in $plain -out $encrypted -pass env:BACKUP_PASSPHRASE_INTERNAL
  if ($LASTEXITCODE -ne 0) { throw "백업 암호화가 실패했습니다." }
  Get-FileHash -Algorithm SHA256 -Path $encrypted | Select-Object Hash, Path
  Write-Output "암호화 백업 생성 및 목록 검증 완료: $encrypted"
} finally {
  Remove-Item -LiteralPath $plain -Force -ErrorAction SilentlyContinue
  Remove-Item Env:BACKUP_PASSPHRASE_INTERNAL -ErrorAction SilentlyContinue
}
