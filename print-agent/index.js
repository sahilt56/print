const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { print } = require('pdf-to-printer');

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png']);
const SUMATRA_PDF_FILE = 'SumatraPDF-3.4.6-32.exe';
const BUILD_VERSION = '2026-08-30.1';

// ─── Config Loading ─────────────────────────────────────────────────────────
// When packaged as .exe, __dirname may be inside snapshot. Use process.execPath
// to find config.json relative to the actual .exe location.
const exeDir = path.dirname(process.execPath);
const configPath = path.join(exeDir, 'config.json');
// `pkg` runs JavaScript from a virtual snapshot, so pdf-to-printer's bundled
// SumatraPDF executable must be shipped beside the agent executable instead.
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
  console.error('');
  console.error('  Please place your config.json file next to this');
  console.error('  QrPrintAgent.exe and restart the application.');
  console.error('');
  console.error('  Download your config.json from:');
  console.error('  Your Admin Dashboard → Settings → Download Config');
  console.error('─────────────────────────────────────────────────');
  process.exit(1);
}

const { API_URL, CAFE_ID, AGENT_SECRET_KEY, POLL_INTERVAL_MS } = config;

if (!API_URL || !CAFE_ID || !AGENT_SECRET_KEY) {
  console.error('ERROR: config.json is missing required fields: API_URL, CAFE_ID, AGENT_SECRET_KEY');
  process.exit(1);
}

if (!fs.existsSync(sumatraPdfPath)) {
  console.error(`ERROR: ${SUMATRA_PDF_FILE} was not found at: ${sumatraPdfPath}`);
  console.error('Re-download the complete QR Print Agent package and keep all files together.');
  process.exit(1);
}

const POLL_INTERVAL = parseInt(POLL_INTERVAL_MS) || 5000;

// ─── Startup Banner ──────────────────────────────────────────────────────────
console.log('');
console.log('  ╔═══════════════════════════════════╗');
console.log('  ║       QR Print Cafe Agent         ║');
console.log('  ╚═══════════════════════════════════╝');
console.log('');
console.log(`  Cafe ID  : ${CAFE_ID}`);
console.log(`  Server   : ${API_URL}`);
console.log(`  Build    : ${BUILD_VERSION}`);
console.log(`  Polling  : every ${POLL_INTERVAL / 1000}s`);
console.log('');
console.log('  ✅ Agent is running. Waiting for print jobs...');
console.log('  (Press Ctrl+C to stop)');
console.log('');

// ─── Temp Directory ──────────────────────────────────────────────────────────
const tempDir = path.join(os.tmpdir(), 'qr-print-cafe-jobs');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

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
    if (error.response && error.response.status === 401) {
      console.error('\nERROR: Authentication failed. Your AGENT_SECRET_KEY is invalid.');
      console.error('Please download a fresh config.json from your Admin Dashboard → Settings.');
      process.exit(1);
    }
    console.error(`[${new Date().toLocaleTimeString()}] Error polling: ${error.message}`);
  } finally {
    setTimeout(pollJobs, POLL_INTERVAL);
  }
};

// ─── Job Processor ───────────────────────────────────────────────────────────
const processJob = async (job) => {
  const extension = path.extname(job.fileName || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    console.error(`  ❌ Refusing unsupported file type: ${job.fileName}`);
    await updateJobStatus(job.id, 'failed', 'Unsupported file type');
    return;
  }

  // Never use a customer-controlled filename for a local path.
  const localFilePath = path.join(tempDir, `${job.id}${extension}`);

  try {
    // 1. Download file
    console.log(`  Downloading: ${job.fileName}`);
    const fileResponse = await axios.get(job.downloadUrl, {
      responseType: 'stream',
      headers: { Authorization: `Bearer ${AGENT_SECRET_KEY}` },
    });
    const writer = fs.createWriteStream(localFilePath);
    fileResponse.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    // 2. Print file
    const printOptions = {
      copies: job.copies || 1,
      ...(job.selectedPages && job.selectedPages !== 'all' ? { pages: job.selectedPages } : {}),
      monochrome: job.colorMode === 'bw',
      paperSize: job.paperSize || 'A4',
      sumatraPdfPath,
    };
    console.log(`  Printing... (Copies: ${printOptions.copies}, Mode: ${job.colorMode})`);
    await print(localFilePath, printOptions);

    console.log(`  ✅ Job #${job.jobNumber} printed successfully!`);
    await updateJobStatus(job.id, 'completed');

  } catch (error) {
    console.error(`  ❌ Error on job #${job.jobNumber}: ${error.message}`);
    await updateJobStatus(job.id, 'failed', error.message);
  } finally {
    // 3. Cleanup temp file
    if (fs.existsSync(localFilePath)) {
      try { fs.unlinkSync(localFilePath); } catch (e) { /* ignore */ }
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
    console.error(`  Failed to update status for job ${jobId}: ${error.message}`);
  }
};

// Start!
pollJobs();
