param(
  [string]$Root = "sermons"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $Root)) {
  Write-Error "Path not found: $Root"
  exit 1
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$files = Get-ChildItem -LiteralPath $Root -Filter *.html -File -Recurse

if (-not $files) {
  Write-Host "No .html files found under $Root"
  exit 0
}

$rules = @(
  @{ Name = "before_punctuation"; Pattern = "\s+([,.:;!?])"; Replacement = '$1' },
  @{ Name = "after_open_quote"; Pattern = "([\u2018\u201C])\s+"; Replacement = '$1' },
  @{ Name = "before_close_quote"; Pattern = "\s+([\u2019\u201D])"; Replacement = '$1' }
)

$totalChanged = 0
$totalReplacements = 0

foreach ($file in $files) {
  $path = $file.FullName
  $original = [System.IO.File]::ReadAllText($path)
  $text = $original
  $fileReplacements = 0

  foreach ($rule in $rules) {
    $count = [System.Text.RegularExpressions.Regex]::Matches($text, $rule.Pattern).Count
    if ($count -gt 0) {
      $text = [System.Text.RegularExpressions.Regex]::Replace(
        $text,
        $rule.Pattern,
        $rule.Replacement
      )
      $fileReplacements += $count
    }
  }

  if ($text -ne $original) {
    [System.IO.File]::WriteAllText($path, $text, $utf8NoBom)
    $totalChanged++
    $totalReplacements += $fileReplacements
    Write-Host ("Updated {0} ({1} replacements)" -f $path, $fileReplacements)
  }
}

if ($totalChanged -eq 0) {
  Write-Host "No punctuation spacing fixes needed."
} else {
  Write-Host ("Done. Updated {0} file(s), {1} total replacements." -f $totalChanged, $totalReplacements)
}
