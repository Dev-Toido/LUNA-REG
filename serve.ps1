$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:5500/")
$listener.Start()
Write-Host "HTTP_SERVER_READY"

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $req = $context.Request
        $res = $context.Response

        $path = $req.Url.LocalPath.TrimStart('/')
        if ([string]::IsNullOrWhiteSpace($path)) {
            $path = "index.html"
        }

        $fullPath = Join-Path $PSScriptRoot $path

        if (Test-Path $fullPath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($fullPath)
            $ext = [System.IO.Path]::GetExtension($fullPath).ToLower()

            $contentType = switch ($ext) {
                ".html" { "text/html; charset=utf-8" }
                ".js"   { "application/javascript; charset=utf-8" }
                ".css"  { "text/css; charset=utf-8" }
                ".jpg"  { "image/jpeg" }
                ".jpeg" { "image/jpeg" }
                ".png"  { "image/png" }
                ".svg"  { "image/svg+xml" }
                ".json" { "application/json" }
                default { "application/octet-stream" }
            }

            $res.ContentType = $contentType
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $res.StatusCode = 404
            $msg = [System.Text.Encoding]::UTF8.GetBytes("Not Found: $path")
            $res.ContentLength64 = $msg.Length
            $res.OutputStream.Write($msg, 0, $msg.Length)
        }
        $res.OutputStream.Close()
    } catch {
        # ignore client disconnects
    }
}
