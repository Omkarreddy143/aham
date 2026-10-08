param([string]$Python = 'python', [string]$Cpp = 'g++')
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Push-Location $projectRoot
try {
    & $Python -m unittest discover -s tests -p 'test_*.py' -v
    if ($LASTEXITCODE -ne 0) { throw 'Python checks failed.' }
    New-Item -ItemType Directory -Path .build -Force | Out-Null
    if (Get-Command $Cpp -ErrorAction SilentlyContinue) {
        & $Cpp -std=c++11 -Wall -Wextra -Werror -Ifirmware/include tests/native_tests.cpp -o .build/native-tests.exe
        if ($LASTEXITCODE -ne 0) { throw 'Native compilation failed.' }
        & '.\.build\native-tests.exe' tests/fixtures/wire.txt
        if ($LASTEXITCODE -ne 0) { throw 'Native checks failed.' }
        & $Cpp -std=c++11 -Wall -Wextra -Werror -Ifirmware/include tests/wifi_monitor_tests.cpp -o .build/wifi-monitor-tests.exe
        if ($LASTEXITCODE -ne 0) { throw 'Wi-Fi native compilation failed.' }
        & '.\.build\wifi-monitor-tests.exe' tests/fixtures/wifi-monitor.txt
        if ($LASTEXITCODE -ne 0) { throw 'Wi-Fi firmware interoperability checks failed.' }
        & $Cpp -std=c++11 -Wall -Wextra -Werror -Ifirmware/include tests/wifi_bench_tests.cpp -o .build/wifi-bench-tests.exe
        if ($LASTEXITCODE -ne 0) { throw 'Index bench native compilation failed.' }
        & '.\.build\wifi-bench-tests.exe' tests/fixtures/wifi-bench.txt
        if ($LASTEXITCODE -ne 0) { throw 'Index bench checks failed.' }
        & $Cpp -std=c++11 -Wall -Wextra -Werror -Ifirmware/include tests/wifi_glove_tests.cpp -o .build/wifi-glove-tests.exe
        if ($LASTEXITCODE -ne 0) { throw 'Five-finger native compilation failed.' }
        & '.\.build\wifi-glove-tests.exe' tests/fixtures/wifi-glove.txt
        if ($LASTEXITCODE -ne 0) { throw 'Five-finger checks failed.' }
    } else { Write-Warning 'C++ compiler unavailable; native checks not run.' }
    $csharpCompiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
    if (Test-Path -LiteralPath $csharpCompiler) {
        & $csharpCompiler /nologo /out:.build\ProtocolChecks.exe (Join-Path $projectRoot 'unity\Assets\AHAM\Scripts\AhamProtocol.cs') (Join-Path $projectRoot 'unity\Assets\AHAM\Scripts\ImuTilt.cs') (Join-Path $projectRoot 'tests\ProtocolChecks.cs')
        if ($LASTEXITCODE -ne 0) { throw 'C# codec compilation failed.' }
        & '.\.build\ProtocolChecks.exe' tests/fixtures/wire.txt
        if ($LASTEXITCODE -ne 0) { throw 'C# codec checks failed.' }
    } else { Write-Warning 'C# compiler unavailable; standalone codec checks not run.' }
} finally { Pop-Location }
