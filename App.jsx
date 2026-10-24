import { useState } from 'react';
import './App.css';

const API_BASE = 'http://localhost:5000/api';

function App() {
  const [activeTab, setActiveTab] = useState('student');

  // Student state
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [generatedPin, setGeneratedPin] = useState(null);
  const [studentError, setStudentError] = useState('');

  // Shopkeeper state
  const [inputPin, setInputPin] = useState('');
  const [jobInfo, setJobInfo] = useState(null);
  const [shopError, setShopError] = useState('');
  const [printing, setPrinting] = useState(false);

  // 1. Student uploads file to Express backend
  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      setStudentError('Please select a PDF or image file first.');
      return;
    }

    setUploading(true);
    setStudentError('');
    setGeneratedPin(null);

    const formData = new FormData();
    formData.append('document', selectedFile);

    try {
      const res = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setGeneratedPin(data.pin);
      setSelectedFile(null);
      e.target.reset();
    } catch (err) {
      setStudentError(err.message);
    } finally {
      setUploading(false);
    }
  };

  // 2. Shopkeeper verifies 4-digit PIN
  const handleVerifyPin = async (e) => {
    e.preventDefault();
    if (inputPin.length !== 4) {
      setShopError('Please enter a valid 4-digit code.');
      return;
    }

    setShopError('');
    setJobInfo(null);

    try {
      const res = await fetch(`${API_BASE}/job/${inputPin}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Invalid or expired code');
      }

      setJobInfo(data);
    } catch (err) {
      setShopError(err.message);
    }
  };

  // 3. Shopkeeper triggers Blind Print via hidden iframe
  const handleBlindPrint = async () => {
    if (!jobInfo) return;
    setPrinting(true);
    setShopError('');

    try {
      const res = await fetch(`${API_BASE}/print/${jobInfo.pin}`);
      if (!res.ok) {
        throw new Error('Document expired or could not be loaded.');
      }

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);

      // Remove any old hidden print frame if one exists
      const oldFrame = document.getElementById('hidden-print-frame');
      if (oldFrame) oldFrame.remove();

      // Create an invisible 0x0 iframe so the document never displays on the shop screen
      const iframe = document.createElement('iframe');
      iframe.id = 'hidden-print-frame';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';

      // If it's an image (JPG/PNG), wrap it cleanly so it prints full-page; if PDF, load directly
      if (blob.type.startsWith('image/')) {
        iframe.onload = () => {
          setTimeout(() => {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            URL.revokeObjectURL(blobUrl);
            setPrinting(false);
          }, 300);
        };
        document.body.appendChild(iframe);
        const doc = iframe.contentWindow.document;
        doc.open();
        doc.write(`
          <html>
            <body style="margin:0; display:flex; justify-content:center; align-items:center;">
              <img src="${blobUrl}" style="max-width:100%; max-height:100vh;" />
            </body>
          </html>
        `);
        doc.close();
      } else {
        iframe.src = blobUrl;
        iframe.onload = () => {
          setTimeout(() => {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            setPrinting(false);
          }, 500);
        };
        document.body.appendChild(iframe);
      }
    } catch (err) {
      setShopError(err.message);
      setPrinting(false);
    }
  };

  return (
    <div className="container">
      <div className="header">
        <h1>PrintDrop</h1>
        <p>Zero-download, self-destructing document printing</p>
      </div>

      <div className="tabs">
        <button
          className={`tab-btn ${activeTab === 'student' ? 'active' : ''}`}
          onClick={() => setActiveTab('student')}
        >
          Student Upload
        </button>
        <button
          className={`tab-btn ${activeTab === 'shop' ? 'active' : ''}`}
          onClick={() => setActiveTab('shop')}
        >
          Shopkeeper Portal
        </button>
      </div>

      {activeTab === 'student' ? (
        <div className="card">
          <h2>Upload Sensitive Document</h2>
          <p className="subtitle">
            Upload your Aadhaar, PAN, or ID. It will automatically self-destruct from our server in 5 minutes.
          </p>

          {studentError && <div className="error-msg">{studentError}</div>}

          <form onSubmit={handleUpload}>
            <div className="file-drop">
              <input
                type="file"
                accept=".pdf,image/png,image/jpeg,image/jpg"
                onChange={(e) => setSelectedFile(e.target.files[0])}
              />
            </div>

            <button type="submit" className="primary-btn" disabled={uploading}>
              {uploading ? 'Encrypting & Uploading...' : 'Generate 4-Digit Print Code'}
            </button>
          </form>

          {generatedPin && (
            <div className="pin-box">
              <span>Share this code with the shopkeeper</span>
              <div className="pin-code">{generatedPin}</div>
              <p className="timer-note">Valid for 5 minutes • Auto-deletes after expiry</p>
            </div>
          )}
        </div>
      ) : (
        <div className="card">
          <h2>Shopkeeper Print Terminal</h2>
          <p className="subtitle">
            Enter the student&apos;s 4-digit PIN. Document contents are hidden to protect customer privacy.
          </p>

          {shopError && <div className="error-msg">{shopError}</div>}

          <form onSubmit={handleVerifyPin}>
            <input
              type="text"
              maxLength="4"
              placeholder="0000"
              className="pin-input"
              value={inputPin}
              onChange={(e) => setInputPin(e.target.value.replace(/\D/g, ''))}
            />
            <button type="submit" className="primary-btn">
              Verify Print Code
            </button>
          </form>

          {jobInfo && (
            <div className="job-ready-box">
              <span className="privacy-badge">Preview Locked (Privacy Mode)</span>
              <div className="job-meta">Document Type: {jobInfo.fileType}</div>
              <p className="subtitle" style={{ marginBottom: '14px' }}>
                File is verified and ready in memory. Direct downloading is disabled.
              </p>
              <button
                onClick={handleBlindPrint}
                className="primary-btn print-btn"
                disabled={printing}
              >
                {printing ? 'Sending to Printer...' : 'Print Document Now'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;