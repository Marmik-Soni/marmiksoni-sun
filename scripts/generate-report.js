import fs from 'fs';
import path from 'path';

const projectRoot = process.cwd();
const outputFile = path.join(projectRoot, 'project_report.md');

const filesToInclude = [
  'README.md',
  'docs/ARCHITECTURE.md',
  'docs/API.md',
  'docs/DOCKER.md',
  'docs/STAGING.md',
  'docs/TESTING.md',
  'package.json',
  'tsconfig.json',
  'vitest.config.ts',
  'playwright.config.ts',
  'eslint.config.ts',
  'commitlint.config.ts',
  'Dockerfile',
  '.dockerignore',
  '.env.example',
  'src/index.ts',
  'src/server.ts',
  'src/config/env.ts',
  'src/config/availability.ts',
  'src/lib/calendar.ts',
  'src/lib/email.ts',
  'src/lib/html.ts',
  'src/lib/ics.ts',
  'src/lib/approval-token.ts',
  'src/lib/approval-token.test.ts',
  'src/schemas/booking.ts',
  'src/routes/health.ts',
  'src/routes/availability.ts',
  'src/routes/bookings.ts',
  'src/routes/routes.test.ts',
  'src/lib/ics.test.ts',
  'tests/e2e/helpers/token.ts',
  'tests/e2e/bookings-html.spec.ts',
  'tests/e2e/staging-smoke.spec.ts',
  '.github/workflows/ci.yml',
  'scripts/generate-report.js',
];

let reportContent = `# sun-backend Comprehensive Project Report\n\n`;
reportContent += `Generated on: ${new Date().toISOString()}\n\n`;
reportContent += `This document contains a complete overview of the \`sun-backend\` project, including all configuration files, documentation, and source code.\n\n`;
reportContent += `---\n\n`;

for (const file of filesToInclude) {
  const filePath = path.join(projectRoot, file);
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const ext = path.extname(file).slice(1) || 'text';
    let lang = ext === 'ts' ? 'typescript' : ext === 'json' ? 'json' : ext === 'md' ? 'markdown' : ext;
    if (file === 'Dockerfile') lang = 'dockerfile';
    if (file === '.dockerignore') lang = 'gitignore';
    
    reportContent += `## \`${file}\`\n\n`;
    reportContent += `\`\`\`${lang}\n`;
    reportContent += content;
    if (!content.endsWith('\n')) reportContent += '\n';
    reportContent += `\`\`\`\n\n`;
  } catch (err) {
    reportContent += `## \`${file}\`\n\n`;
    reportContent += `> Error reading file: ${err.message}\n\n`;
  }
}

fs.writeFileSync(outputFile, reportContent);
console.log(`\n✅ Full project report successfully generated at: ${outputFile}\n`);
