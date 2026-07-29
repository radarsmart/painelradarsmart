# Test Fase 2: Video Composition with Remotion
# PowerShell version for Windows

$API_URL = "http://localhost:3000/api/ai"
$PRODUCT_NAME = "iPhone 16 Pro"
$DESCRIPTION = "Smartphone flagship com câmera avançada e processador A18 Pro"
$PRICE = "R$ 8.999"

Write-Host "=======================================================================" -ForegroundColor Cyan
Write-Host "Fase 2: Video Composition Testing" -ForegroundColor Cyan
Write-Host "=======================================================================" -ForegroundColor Cyan

# Test 1: Video System Status
Write-Host ""
Write-Host "[1/4] Checking video system status..." -ForegroundColor Yellow
Write-Host "GET $API_URL/video/status" -ForegroundColor Gray

$statusResponse = Invoke-WebRequest -Uri "$API_URL/video/status" -UseBasicParsing
$status = $statusResponse.Content | ConvertFrom-Json
$status | ConvertTo-Json | Write-Host

# Test 2: Full Pipeline
Write-Host ""
Write-Host "[2/4] Testing full pipeline (Image + Text + Video)..." -ForegroundColor Yellow
Write-Host "POST $API_URL/video/full-pipeline" -ForegroundColor Gray

$pipelineBody = @{
    productName = $PRODUCT_NAME
    description = $DESCRIPTION
    price = $PRICE
    targetAudience = "Tech enthusiasts"
    platform = "tiktok"
} | ConvertTo-Json

try {
    $pipelineResponse = Invoke-WebRequest -Uri "$API_URL/video/full-pipeline" `
        -Method POST `
        -ContentType "application/json" `
        -Body $pipelineBody `
        -UseBasicParsing
    
    $pipeline = $pipelineResponse.Content | ConvertFrom-Json
    $pipeline | ConvertTo-Json -Depth 5 | Write-Host
    
    # Extract and display URLs
    Write-Host ""
    Write-Host "Results:" -ForegroundColor Green
    
    $imageUrl = $pipeline.pipeline.image.url
    $previewUrl = $pipeline.pipeline.video.previewUrl
    $videoUrl = $pipeline.pipeline.video.url
    
    if ($imageUrl) {
        Write-Host "  ✓ Generated Image: $imageUrl" -ForegroundColor Green
    }
    
    if ($previewUrl) {
        Write-Host "  ✓ Video Preview: $previewUrl" -ForegroundColor Green
    }
    
    if ($videoUrl) {
        Write-Host "  ✓ Rendered Video: $videoUrl" -ForegroundColor Green
    }
}
catch {
    Write-Host "Error: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "=======================================================================" -ForegroundColor Cyan
Write-Host "✓ Phase 2 Testing Complete!" -ForegroundColor Green
Write-Host "=======================================================================" -ForegroundColor Cyan
