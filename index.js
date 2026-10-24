const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');

// Bulletproof modular imports for modern firebase-admin SDKs
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// Firebase Initialization with Senior-level Guardrails
let jobsCollection = null;
const keyPath = path.join(__dirname, 'serviceAccountKey.json');

if (fs.existsSync(keyPath)) {
  try {
    const fileContent = fs.readFileSync(keyPath, 'utf8');
    const serviceAccount = JSON.parse(fileContent);

    if (serviceAccount.project_id && serviceAccount.private_key) {
      // Prevent duplicate app initialization crashes if hot-reloaded
      const existingApps = getApps();
      const firebaseApp = existingApps.length === 0 
        ? initializeApp({ credential: cert(serviceAccount) }) 
        : existingApps[0];

      jobsCollection = getFirestore(firebaseApp).collection('printJobs');
      console.log('[DB] Firebase Firestore connected successfully (Test/Prod Mode Active)');
    } else {
      console.warn('[DB WARN] serviceAccountKey.json is missing project_id or private_key -> Running in Local Store mode');
    }
  } catch (err) {
    console.error('[DB ERROR] Failed parsing serviceAccountKey.json:', err.message, '-> Running in Local Store mode');
  }
} else {
  console.log('[DB INFO] No serviceAccountKey.json detected -> Running safely in Local Store mode');
}

// Local backup store so the server NEVER crashes even without Firebase keys
const localJobs = new Map();

// Ensure temp uploads folder exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeName = `${Date.now()}-${Math.round(Math.random() * 1000)}${ext}`;
    cb(null, safeName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Helper: Save job to both local memory and Firebase (if connected)
async function saveJob(pin, jobData) {
  localJobs.set(pin, jobData);
  if (jobsCollection) {
    try {
      await jobsCollection.doc(pin).set(jobData);
    } catch (e) {
      console.error('[FIREBASE WRITE WARN]', e.message);
    }
  }
}

// Helper: Get job from local memory or Firebase
async function getJob(pin) {
  if (localJobs.has(pin)) {
    return localJobs.get(pin);
  }
  if (jobsCollection) {
    try {
      const doc = await jobsCollection.doc(pin).get();
      if (doc.exists) return doc.data();
    } catch (e) {
      console.error('[FIREBASE READ WARN]', e.message);
    }
  }
  return null;
}

// Helper: Delete job from both local memory and Firebase
async function deleteJob(pin) {
  localJobs.delete(pin);
  if (jobsCollection) {
    try {
      await jobsCollection.doc(pin).delete();
    } catch (e) {
      console.error('[FIREBASE DELETE WARN]', e.message);
    }
  }
}

// Generate unique 4-digit PIN
async function generateUniquePin() {
  let pin;
  do {
    pin = Math.floor(1000 + Math.random() * 9000).toString();
  } while (localJobs.has(pin));
  return pin;
}

// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    firebaseConnected: Boolean(jobsCollection),
    activeJobs: localJobs.size
  });
});

// 2. Student uploads document
app.post('/api/upload', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file selected' });
    }

    const pin = await generateUniquePin();
    const now = Date.now();
    const expiresAt = now + 5 * 60 * 1000; 

    const jobData = {
      pin,
      originalName: req.file.originalname,
      storedName: req.file.filename,
      filePath: req.file.path,
      mimeType: req.file.mimetype,
      createdAt: now,
      expiresAt
    };

    await saveJob(pin, jobData);

    console.log(`[UPLOAD] PIN: ${pin} | File: ${req.file.originalname}`);
    res.json({ pin, expiresAt });
  } catch (err) {
    console.error('[UPLOAD ERROR]', err);
    res.status(500).json({ error: 'Failed to process upload' });
  }
});

// 3. Shopkeeper verifies 4-digit PIN
app.get('/api/job/:pin', async (req, res) => {
  try {
    const { pin } = req.params;
    const job = await getJob(pin);

    if (!job || Date.now() > job.expiresAt) {
      return res.status(404).json({ error: 'Invalid or expired print code' });
    }

    res.json({
      pin: job.pin,
      fileType: job.mimeType.includes('pdf') ? 'PDF Document' : 'Image File',
      expiresAt: job.expiresAt
    });
  } catch (err) {
    console.error('[VERIFY ERROR]', err);
    res.status(500).json({ error: 'Server error verifying code' });
  }
});

// 4. Shopkeeper triggers Blind Print
app.get('/api/print/:pin', async (req, res) => {
  try {
    const { pin } = req.params;
    const job = await getJob(pin);

    if (!job || Date.now() > job.expiresAt || !fs.existsSync(job.filePath)) {
      return res.status(404).send('Print job expired or not found');
    }

    res.setHeader('Content-Type', job.mimeType);
    res.setHeader('Content-Disposition', 'inline');

    const stream = fs.createReadStream(job.filePath);
    stream.pipe(res);
  } catch (err) {
    console.error('[PRINT ERROR]', err);
    res.status(500).send('Error streaming print file');
  }
});

// 5. Auto-Cleanup Cron Job: Runs every 60 seconds
cron.schedule('* * * * *', async () => {
  const now = Date.now();
  for (const [pin, job] of localJobs.entries()) {
    if (now > job.expiresAt) {
      if (fs.existsSync(job.filePath)) {
        fs.unlink(job.filePath, () => {});
      }
      await deleteJob(pin);
      console.log(`[AUTO-WIPE] PIN ${pin} expired and removed`);
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});