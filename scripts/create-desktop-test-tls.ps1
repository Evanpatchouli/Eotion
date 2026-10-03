# Test-only localhost certificate. Does not install certificates or change OS trust.
# Use its exact SPKI only in the acceptance Electron processes.
param([string]$OutputDirectory = (Join-Path ([IO.Path]::GetTempPath()) 'eotion-desktop-test-tls'))
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$taskRsa = [Security.Cryptography.RSA]::Create(2048)
try {
  $taskRequest = [Security.Cryptography.X509Certificates.CertificateRequest]::new(
    'CN=localhost', $taskRsa, [Security.Cryptography.HashAlgorithmName]::SHA256,
    [Security.Cryptography.RSASignaturePadding]::Pkcs1)
  $taskSan = [Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
  $taskSan.AddDnsName('localhost')
  $taskRequest.CertificateExtensions.Add($taskSan.Build())
  $taskCert = $taskRequest.CreateSelfSigned([DateTimeOffset]::UtcNow.AddDays(-1), [DateTimeOffset]::UtcNow.AddDays(3))
  try {
    $env:EOTION_TEST_TLS_PFX = Join-Path ([IO.Path]::GetFullPath($OutputDirectory)) 'localhost.pfx'
    [IO.File]::WriteAllBytes($env:EOTION_TEST_TLS_PFX, $taskCert.Export([Security.Cryptography.X509Certificates.X509ContentType]::Pfx, ''))
    $env:EOTION_TEST_TLS_SPKI = [Convert]::ToBase64String([Security.Cryptography.SHA256]::HashData($taskRsa.ExportSubjectPublicKeyInfo()))
    Write-Output 'Temporary localhost PFX generated; EOTION_TEST_TLS_PFX and EOTION_TEST_TLS_SPKI set for this PowerShell process.'
  } finally { $taskCert.Dispose() }
} finally { $taskRsa.Dispose() }
