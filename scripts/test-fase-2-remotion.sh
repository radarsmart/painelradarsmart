#!/bin/bash
# Test Fase 2: Video Composition with Remotion

echo "======================================================================="
echo "Fase 2: Video Composition Testing"
echo "======================================================================="

API_URL="http://localhost:3000/api/ai"
PRODUCT_NAME="iPhone 16 Pro"
DESCRIPTION="Smartphone flagship com câmera avançada e processador A18 Pro"
PRICE="R$ 8.999"

echo ""
echo "[1/4] Checking video system status..."
curl -s "$API_URL/video/status" | jq '.'

echo ""
echo "[2/4] Testing full pipeline (Image + Text + Video)..."
echo "POST $API_URL/video/full-pipeline"
PIPELINE=$(curl -s -X POST "$API_URL/video/full-pipeline" \
  -H "Content-Type: application/json" \
  -d "{
    \"productName\": \"$PRODUCT_NAME\",
    \"description\": \"$DESCRIPTION\",
    \"price\": \"$PRICE\",
    \"targetAudience\": \"Tech enthusiasts\",
    \"platform\": \"tiktok\"
  }")

echo "$PIPELINE" | jq '.'

# Extract URLs
IMAGE_URL=$(echo "$PIPELINE" | jq -r '.pipeline.image.url // empty')
VIDEO_URL=$(echo "$PIPELINE" | jq -r '.pipeline.video.url // empty')
PREVIEW_URL=$(echo "$PIPELINE" | jq -r '.pipeline.video.previewUrl // empty')

if [ -n "$IMAGE_URL" ]; then
  echo ""
  echo "✓ Generated Image: $IMAGE_URL"
fi

if [ -n "$PREVIEW_URL" ]; then
  echo "✓ Video Preview: $PREVIEW_URL"
fi

if [ -n "$VIDEO_URL" ]; then
  echo "✓ Rendered Video: $VIDEO_URL"
fi

echo ""
echo "======================================================================="
echo "✓ Phase 2 Testing Complete!"
echo "======================================================================="
