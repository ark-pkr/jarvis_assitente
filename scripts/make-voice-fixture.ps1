# Writes a test "microphone" from the Windows pt-BR voice: spoken lines with silence between them.
# Usage: make-voice-fixture.ps1 -Out file.wav -PartsFile parts.json
# parts.json is UTF-8, a list of strings: a number is seconds of silence, anything else is spoken.
param([Parameter(Mandatory)][string]$Out, [Parameter(Mandatory)][string]$PartsFile, [int]$Rate = 0)
$Parts = [System.IO.File]::ReadAllText($PartsFile, [Text.Encoding]::UTF8) | ConvertFrom-Json
Add-Type -AssemblyName System.Speech
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(48000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$voice = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voice.SelectVoice('Microsoft Maria Desktop')
$voice.Rate = $Rate
$pcm = New-Object System.IO.MemoryStream
foreach ($part in $Parts) {
  $seconds = 0.0
  if ([double]::TryParse($part, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$seconds)) {
    # A trace of room tone: the speech gate learns the floor from it, and pure zero is no room.
    $random = New-Object Random 7
    $count = [int](48000 * $seconds)
    $bytes = New-Object byte[] ($count * 2)
    for ($i = 0; $i -lt $count; $i++) {
      $sample = [int16]$random.Next(-24, 25)
      $bytes[2 * $i] = $sample -band 255
      $bytes[2 * $i + 1] = ($sample -shr 8) -band 255
    }
    $pcm.Write($bytes, 0, $bytes.Length)
    continue
  }
  $line = New-Object System.IO.MemoryStream
  $voice.SetOutputToAudioStream($line, $format)
  $voice.Speak($part)
  $voice.SetOutputToNull()
  $bytes = $line.ToArray()
  $pcm.Write($bytes, 0, $bytes.Length)
}
$data = $pcm.ToArray()
$file = [System.IO.File]::Create($Out)
$writer = New-Object System.IO.BinaryWriter($file)
$writer.Write([Text.Encoding]::ASCII.GetBytes('RIFF')); $writer.Write([int](36 + $data.Length)); $writer.Write([Text.Encoding]::ASCII.GetBytes('WAVEfmt '))
$writer.Write([int]16); $writer.Write([int16]1); $writer.Write([int16]1); $writer.Write([int]48000); $writer.Write([int]96000); $writer.Write([int16]2); $writer.Write([int16]16)
$writer.Write([Text.Encoding]::ASCII.GetBytes('data')); $writer.Write([int]$data.Length); $writer.Write($data)
$writer.Close()
