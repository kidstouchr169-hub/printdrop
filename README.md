# PrintDrop

PrintDrop is a lightweight web app built for print shops and cybercafes. It lets users upload files from their phone and print them using a temporary 4-digit PIN without logging into public computers or leaving files behind.

## Why we built this
Printing documents at public shops usually means logging into your email or plugging in a USB drive, which is slow and risks leaving your files behind. PrintDrop makes it instant and secure.

## Tech Stack
- Frontend: React
- Backend: Node.js, Express, Multer
- Database/Storage: Firebase Firestore (with local in-memory fallback)
- Cleanup: node-cron

## How it works (Architecture)
1. **Upload**: Users upload a document. The server generates a random 4-digit PIN and sets a 5-minute expiration timestamp.
2. **Verify**: The shopkeeper types in the 4-digit PIN on their terminal.
3. **Print**: If valid, the file streams directly to the printer interface and is immediately deleted afterward.
4. **Cleanup**: A background cron job runs every minute to wipe expired files from the server disk and memory.

## Setup & Run Locally

Clone the repo:
