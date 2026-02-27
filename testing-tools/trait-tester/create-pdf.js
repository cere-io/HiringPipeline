const PDFDocument = require('pdfkit');
const fs = require('fs');

async function createPDF() {
  return new Promise((resolve) => {
    const doc = new PDFDocument();
    const stream = fs.createWriteStream('test-resume-fixed.pdf');
    doc.pipe(stream);
    doc.text('John Doe\n\nSoftware Engineer\n\nSkills: React, Node.js\n\nHard things done: reversed engineered SQLite database\n\nHackathons: Won ETHGlobal\n\nSchools: MIT');
    doc.end();
    stream.on('finish', resolve);
  });
}

createPDF().then(() => console.log('Done'));