const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { print } = require('pdf-to-printer');
const { PDFDocument } = require('pdf-lib');

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png']);
const SUMATRA_PDF_FILE = 'SumatraPDF-3.4.6-32.exe';
const BUILD_VERSION = '2026-08-30.3';

// ─── Config Loading ─────────────────────────────────────────────────────────
const exeDir = path.dirname(process.execPath);
const configPath = path.join(exeDir, 'config.json');

const sumatraPdfPath = process.pkg
  ? path.join(exeDir, SUMATRA_PDF_FILE)
  : path.join(__dirname, 'node_modules', 'pdf-to-printer', 'dist', SUMATRA_PDF_FILE);

let config = {};
if (fs.existsSync(configPath)) {
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (e) {
    console.error('ERROR: Could not parse config.json:', e.message);
    process.exit(1);
  }
} else {
  console.error('─────────────────────────────────────────────────');
  console.error('  ERROR: config.json not found!');
  console.error('─────────────────────────────────────────────────');
  process.exit(1);
}

const { API_URL, CAFE_ID, AGENT_SECRET_KEY, POLL_INTERVAL_MS } = config;

if (!API_URL || !CAFE_ID || !AGENT_SECRET_KEY) {
  console.error('ERROR: config.json is missing required fields.');
  process.exit(1);
}

if (!fs.existsSync(sumatraPdfPath)) {
  console.error(`ERROR: ${SUMATRA_PDF_FILE} not found at ${sumatraPdfPath}`);
  process.exit(1);
}

const POLL_INTERVAL = parseInt(POLL_INTERVAL_MS) || 5000;

console.log('');
console.log('  ╔═══════════════════════════════════╗');
console.log('  ║    QR Print Multi-Layout Agent    ║');
console.log('  ╚═══════════════════════════════════╝');
console.log(`  Cafe ID  : ${CAFE_ID}`);
console.log(`  Build    : ${BUILD_VERSION}`);
console.log('  ✅ Agent is running. Waiting for jobs...');
console.log('');

const tempDir = path.join(os.tmpdir(), 'qr-print-cafe-jobs');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Helper to form clean absolute URL
const getFullUrl = (rawUrl) => {
  if (!rawUrl) return '';
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
    return rawUrl;
  }
  const cleanApiUrl = API_URL.replace(/\/$/, '');
  const cleanPath = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
  return `${cleanApiUrl}${cleanPath}`;
};

// ─── Polling Loop ────────────────────────────────────────────────────────────
const pollJobs = async () => {
  try {
    const response = await axios.get(`${API_URL}/api/agent/jobs`, {
      params: { cafeId: CAFE_ID },
      headers: { Authorization: `Bearer ${AGENT_SECRET_KEY}` }
    });

    const job = response.data.job;
    if (job) {
      console.log(`\n[${new Date().toLocaleTimeString()}] New job received: #${job.jobNumber}`);
      await processJob(job);
    }
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Error polling: ${error.message}`);
  } finally {
    setTimeout(pollJobs, POLL_INTERVAL);
  }
};

// ─── Job Processor with Canvas Multi-Item Support ─────────────────────────────
const processJob = async (job) => {
  const localPdfPath = path.join(tempDir, `${job.id}_final.pdf`);

  try {
    const layoutItems = Array.isArray(job.layout)
      ? job.layout
      : typeof job.layout === 'string'
      ? JSON.parse(job.layout)
      : [];

    if (layoutItems && layoutItems.length > 0) {
      console.log(`  Creating A4 layout for ${layoutItems.length} item(s)...`);

      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([595.28, 841.89]);
      const { width: PAGE_WIDTH, height: PAGE_HEIGHT } = page.getSize();

      for (const item of layoutItems) {
        const itemUrl = getFullUrl(item.fileUrl || job.downloadUrl || job.fileUrl);
        console.log(`  Downloading image asset: ${itemUrl}`);

        // Fetch without custom Auth headers for static uploaded files
        const imageRes = await axios.get(itemUrl, {
          responseType: 'arraybuffer'
        });
        const imageBuffer = Buffer.from(imageRes.data);

        let embeddedImage;
        try {
          embeddedImage = await pdfDoc.embedPng(imageBuffer);
        } catch (e) {
          embeddedImage = await pdfDoc.embedJpg(imageBuffer);
        }

        const x = (item.xPercent / 100) * PAGE_WIDTH;
        const width = (item.widthPercent / 100) * PAGE_WIDTH;
        const height = (item.heightPercent / 100) * PAGE_HEIGHT;
        const y = PAGE_HEIGHT - ((item.yPercent / 100) * PAGE_HEIGHT) - height;

        page.drawImage(embeddedImage, { x, y, width, height });
      }

      const pdfBytes = await pdfDoc.save();
      fs.writeFileSync(localPdfPath, pdfBytes);

    } else {
      const downloadUrl = getFullUrl(job.downloadUrl || job.fileUrl);

      console.log(`  Downloading single file: ${downloadUrl}`);
      const fileResponse = await axios.get(downloadUrl, {
        responseType: 'arraybuffer'
      });
      fs.writeFileSync(localPdfPath, Buffer.from(fileResponse.data));
    }

    const printOptions = {
      copies: job.copies || 1,
      monochrome: job.colorMode === 'bw',
      paperSize: job.paperSize || 'A4',
      sumatraPdfPath,
    };

    console.log(`  Printing A4 Sheet... (Copies: ${printOptions.copies}, Mode: ${job.colorMode})`);
    await print(localPdfPath, printOptions);

    console.log(`  ✅ Job #${job.jobNumber} printed successfully!`);
    await updateJobStatus(job.id, 'completed');

  } catch (error) {
    console.error(`  ❌ Error on job #${job.jobNumber}: ${error.message}`);
    await updateJobStatus(job.id, 'failed', error.message);
  } finally {
    if (fs.existsSync(localPdfPath)) {
      try { fs.unlinkSync(localPdfPath); } catch (e) { /* ignore */ }
    }
  }
};

// ─── Status Updater ──────────────────────────────────────────────────────────
const updateJobStatus = async (jobId, status, errorMsg = null) => {
  try {
    await axios.post(`${API_URL}/api/agent/jobs/${jobId}/status`,
      { status, error: errorMsg },
      { headers: { Authorization: `Bearer ${AGENT_SECRET_KEY}` } }
    );
  } catch (error) {
    console.error(`  Failed to update status: ${error.message}`);
  }
};

pollJobs();