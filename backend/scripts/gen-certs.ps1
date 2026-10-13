# Genera un CA local y un certificado de servidor para servir la PWA por HTTPS en la LAN.
# Uso:  powershell -ExecutionPolicy Bypass -File scripts/gen-certs.ps1 [-ExtraIP 192.168.1.200]
# Salida: backend/certs/{ca.crt,ca.key,server.crt,server.key}
# Instala backend/certs/ca.crt como CA de confianza en el celular/tablet para que el PWA sea instalable.

param(
  [string[]]$ExtraIP = @()
)

$ErrorActionPreference = 'Stop'

$ossl = $null
$candidates = @(
  'C:\Program Files\Git\usr\bin\openssl.exe',
  'C:\Program Files\Git\mingw64\bin\openssl.exe'
)
foreach ($c in $candidates) { if (Test-Path $c) { $ossl = $c; break } }
if (-not $ossl) {
  $cmd = Get-Command openssl -ErrorAction SilentlyContinue
  if ($cmd) { $ossl = $cmd.Source }
}
if (-not $ossl) { throw 'No se encontro openssl. Instala Git for Windows o mkcert.' }

$gitCnf = 'C:\Program Files\Git\usr\ssl\openssl.cnf'
if (Test-Path $gitCnf) { $env:OPENSSL_CONF = $gitCnf }

$certsDir = Join-Path (Split-Path -Parent $PSScriptRoot) 'certs'
New-Item -ItemType Directory -Force -Path $certsDir | Out-Null

$ips = @('127.0.0.1')
$ips += Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike '169.254.*' -and $_.IPAddress -ne '127.0.0.1' } |
  Select-Object -ExpandProperty IPAddress
$ips += $ExtraIP
$ips = $ips | Sort-Object -Unique

$dns = @('localhost', 'nallely.local', $env:COMPUTERNAME) | Where-Object { $_ } | Sort-Object -Unique

$altNames = ''
$i = 1; foreach ($d in $dns) { $altNames += "DNS.$i = $d`n"; $i++ }
$j = 1; foreach ($ip in $ips) { $altNames += "IP.$j = $ip`n"; $j++ }

$sanCnf = @"
[req]
distinguished_name = req_distinguished_name
[v3_req]
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names
[alt_names]
$altNames
"@
Set-Content -Path (Join-Path $certsDir 'san.cnf') -Value $sanCnf -Encoding ASCII

Push-Location $certsDir
try {
  & $ossl genrsa -out ca.key 2048 2>$null
  & $ossl req -x509 -new -nodes -key ca.key -sha256 -days 3650 -subj '/CN=Super Nallely Local CA/O=Super Nallely Dev' -addext 'basicConstraints=critical,CA:TRUE' -addext 'keyUsage=critical,keyCertSign,cRLSign' -out ca.crt 2>$null
  & $ossl genrsa -out server.key 2048 2>$null
  & $ossl req -new -key server.key -out server.csr -subj '/CN=Super Nallely/O=Super Nallely Dev' 2>$null
  & $ossl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out server.crt -days 3650 -sha256 -extfile san.cnf -extensions v3_req 2>$null
} finally {
  Pop-Location
}

Write-Host "Certificados generados en $certsDir"
Write-Host "IPs incluidas: $($ips -join ', ')"
Write-Host "CA para instalar en el celular: $certsDir\ca.crt"
