#!/bin/bash
# Quick start: Test AI Factory with Mock Providers

echo "======================================================================="
echo "AI Factory — Quick Start with Mock Providers"
echo "======================================================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Verify structure
echo -e "\n${YELLOW}[Step 1]${NC} Verifying AI Factory structure..."
node scripts/verify-ai-factory.js

if [ $? -ne 0 ]; then
    echo -e "\n${RED}✗ Structure verification failed!${NC}"
    exit 1
fi

# Step 2: Create .env.local
echo -e "\n${YELLOW}[Step 2]${NC} Creating .env.local with mock providers..."
cat > .env.local << 'EOF'
# AI Factory — Mock Configuration (No APIs needed)
AI_IMAGE_PROVIDER=mock
AI_TEXT_PROVIDER=mock
AI_VIDEO_PROVIDER=mock

# For OpenAI (optional):
# AI_IMAGE_PROVIDER=openai
# AI_TEXT_PROVIDER=openai
# OPENAI_API_KEY=sk-your-key
EOF
echo -e "${GREEN}✓ .env.local created${NC}"

# Step 3: Install dependencies (if needed)
echo -e "\n${YELLOW}[Step 3]${NC} Checking dependencies..."
if ! npm list | grep -q openai; then
    echo "Installing openai package..."
    npm install openai
fi
echo -e "${GREEN}✓ Dependencies ready${NC}"

# Step 4: Start dev server
echo -e "\n${YELLOW}[Step 4]${NC} Starting development server..."
echo -e "${GREEN}✓ Run: npm run dev${NC}"
echo -e "\n${YELLOW}[Step 5]${NC} Test endpoints:"
echo "
  # Image generation (mock)
  curl -X POST http://localhost:3000/api/ai/image \\
    -H 'Content-Type: application/json' \\
    -d '{
      \"productName\": \"iPhone 16\",
      \"description\": \"Flagship smartphone\"
    }'

  # Text generation (mock)
  curl -X POST http://localhost:3000/api/ai/text \\
    -H 'Content-Type: application/json' \\
    -d '{
      \"productName\": \"iPhone 16\",
      \"description\": \"Flagship smartphone\",
      \"platform\": \"tiktok\"
    }'

  # Full preview (mock)
  curl -X POST http://localhost:3000/api/ai/preview \\
    -H 'Content-Type: application/json' \\
    -d '{
      \"productName\": \"iPhone 16\",
      \"description\": \"Flagship smartphone\"
    }'
"

echo "======================================================================="
echo -e "${GREEN}✓ Ready to test!${NC}"
echo "======================================================================="
