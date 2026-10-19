Add-Type -AssemblyName System.Drawing

$inputPath = "C:/Users/Gabriel/Documents/Projeto do kayky/client/public/logo.png"
$outputPath = "C:/Users/Gabriel/Documents/Projeto do kayky/client/public/logo.png"
$backupPath = "C:/Users/Gabriel/Documents/Projeto do kayky/client/public/logo_original.png"

Copy-Item $inputPath $backupPath -Force

$bmp = [System.Drawing.Bitmap]::FromFile($backupPath)
Write-Host "Original size: $($bmp.Width) x $($bmp.Height)"

# Find the bounding box of the circular logo
# The outer border has black/dark background around the circle:
# Let's inspect rows and columns to find where the dark background ends and the circle begins.
# Let's sample edges:
$minX = $bmp.Width
$maxX = 0
$minY = $bmp.Height
$maxY = 0

# Check each pixel: background outside is near black (R<40, G<40, B<40) or dark grey
for ($y = 0; $y -lt $bmp.Height; $y++) {
    for ($x = 0; $x -lt $bmp.Width; $x++) {
        $c = $bmp.GetPixel($x, $y)
        # Background is dark: let's check brightness or distance from dark border
        # The circle border has either purple (R ~ 90-110, G ~ 30-40, B ~ 110-130) or white (R>200, G>200, B>200)
        # Outside background is dark near black (R < 50, G < 50, B < 50)
        $isBackground = ($c.R -lt 45 -and $c.G -lt 45 -and $c.B -lt 45)
        if (-not $isBackground) {
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}

Write-Host "Detected Circle Bounding Box: minX=$minX, maxX=$maxX, minY=$minY, maxY=$maxY"
$boxWidth = $maxX - $minX + 1
$boxHeight = $maxY - $minY + 1
Write-Host "Width=$boxWidth, Height=$boxHeight"

# Let's make a square based on the circle size
$diameter = [Math]::Max($boxWidth, $boxHeight)
$centerX = ($minX + $maxX) / 2.0
$centerY = ($minY + $maxY) / 2.0
$radius = ($diameter / 2.0) - 2 # slight inset to clean any edge artifacts

Write-Host "Center: $centerX, $centerY, Radius: $radius"

# Create a clean high-resolution square transparent bitmap
$targetSize = 512
$result = New-Object System.Drawing.Bitmap($targetSize, $targetSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($result)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)

# Create a circular clipping path
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddEllipse(0, 0, $targetSize, $targetSize)
$g.SetClip($path)

# Draw the source image mapped to the circle
$srcX = $centerX - $radius
$srcY = $centerY - $radius
$srcSize = $radius * 2

$destRect = New-Object System.Drawing.Rectangle(0, 0, $targetSize, $targetSize)
$g.DrawImage($bmp, $destRect, $srcX, $srcY, $srcSize, $srcSize, [System.Drawing.GraphicsUnit]::Pixel)

$g.Dispose()
$bmp.Dispose()

# Save as clean PNG
$result.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
$result.Dispose()

Copy-Item $outputPath "C:/Users/Gabriel/Documents/Projeto do kayky/client/src/assets/logo.png" -Force

Write-Host "Logo successfully cropped to clean transparent centered circle!"
