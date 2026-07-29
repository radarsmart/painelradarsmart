#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

console.log('='.repeat(70));
console.log('AI Factory Architecture — Structural Verification');
console.log('='.repeat(70));

const projectRoot = path.join(__dirname, '..');
const libAiPath = path.join(projectRoot, 'lib', 'ai');
const appApiPath = path.join(projectRoot, 'app', 'api', 'ai');

// Define expected structure
const expectedStructure = {
  'Contracts': [
    'lib/ai/contracts/image.ts',
    'lib/ai/contracts/text.ts',
    'lib/ai/contracts/video.ts',
  ],
  'Image Provider': [
    'lib/ai/providers/image/openai.ts',
    'lib/ai/providers/image/mock.ts',
    'lib/ai/providers/image/index.ts',
  ],
  'Text Provider': [
    'lib/ai/providers/text/openai.ts',
    'lib/ai/providers/text/mock.ts',
    'lib/ai/providers/text/index.ts',
  ],
  'Video Provider': [
    'lib/ai/providers/video/remotion.ts',
    'lib/ai/providers/video/mock.ts',
    'lib/ai/providers/video/index.ts',
  ],
  'Registry & Factory': [
    'lib/ai/registry.ts',
    'lib/ai/factory.ts',
    'lib/ai/index.ts',
  ],
  'API Routes': [
    'app/api/ai/image/route.ts',
    'app/api/ai/text/route.ts',
    'app/api/ai/video/compose/route.ts',
    'app/api/ai/video/render/route.ts',
    'app/api/ai/preview/route.ts',
  ],
};

let allGood = true;
const results = {};

for (const [category, files] of Object.entries(expectedStructure)) {
  console.log(`\n[${category}]`);
  results[category] = { total: files.length, found: 0 };

  for (const file of files) {
    const fullPath = path.join(projectRoot, file);
    const exists = fs.existsSync(fullPath);
    const status = exists ? '✓' : '✗';
    const color = exists ? '' : ' (MISSING)';

    console.log(`  ${status} ${file}${color}`);
    if (exists) {
      results[category].found++;
      // Quick check for file size
      const stats = fs.statSync(fullPath);
      if (stats.size < 10) {
        console.log(`    ⚠ Warning: file seems empty (${stats.size} bytes)`);
        allGood = false;
      }
    } else {
      allGood = false;
    }
  }
}

console.log('\n' + '='.repeat(70));
console.log('Summary');
console.log('='.repeat(70));

for (const [category, counts] of Object.entries(results)) {
  const percentage = ((counts.found / counts.total) * 100).toFixed(0);
  const symbol = counts.found === counts.total ? '✓' : '✗';
  console.log(`${symbol} ${category}: ${counts.found}/${counts.total} (${percentage}%)`);
}

console.log('\n' + '='.repeat(70));
if (allGood) {
  console.log('✓ All files created successfully!');
  console.log('\nNext steps:');
  console.log('1. Set environment variables in .env.local');
  console.log('   - AI_IMAGE_PROVIDER=mock (or openai with OPENAI_API_KEY)');
  console.log('   - AI_TEXT_PROVIDER=mock (or openai)');
  console.log('   - AI_VIDEO_PROVIDER=mock (or remotion)');
  console.log('2. Run: npm run dev');
  console.log('3. Test endpoint: POST /api/ai/preview');
} else {
  console.log('✗ Some files are missing or empty.');
  console.log('Please check the structure above and rerun this verification.');
  process.exit(1);
}
console.log('='.repeat(70));
