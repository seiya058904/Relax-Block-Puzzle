param(
  [string]$ApkPath = "we xin xiao cheng xu-android-apk/app/build/outputs/apk/debug/app-debug.apk"
)

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$apk = Join-Path $root $ApkPath
$assetsRoot = Join-Path $root 'we xin xiao cheng xu-android-apk/app/src/main/assets'
$nestedAssets = Join-Path $assetsRoot 'js/js'

if (Test-Path -LiteralPath $nestedAssets) {
  throw "forbidden nested asset directory exists: $nestedAssets"
}

if (-not (Test-Path -LiteralPath $apk)) {
  throw "APK not found: $apk"
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path $apk))
try {
  $entries = @($zip.Entries | Where-Object { $_.FullName -like 'assets/js/js/*' })
  if ($entries.Count -gt 0) {
    $uncompressed = ($entries | Measure-Object -Property Length -Sum).Sum
    $compressed = ($entries | ForEach-Object { $_.CompressedLength } | Measure-Object -Sum).Sum
    throw "forbidden nested APK assets: files=$($entries.Count), uncompressed=$uncompressed, compressed=$compressed"
  }
} finally {
  $zip.Dispose()
}

Write-Output "APK asset boundary verified: $ApkPath"
